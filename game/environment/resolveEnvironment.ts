import { absorbShipDamage, armorEvents, armorOf } from "@/game/state/armor";
import { consumeAmplify, tickTide } from "@/game/environment/tide";
import { getShipDefinition } from "@/game/environment/shipData";
import { reasonAfterLoss } from "@/game/state/reason";
import type { TideStateName } from "@/game/environment/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasResistance, STATUS_MALADE, UNIT_CARD_TYPES } from "@/game/cards/types";
import type { CardInstance } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";
import { nextInt } from "@/game/rng";
import type { GameEvent } from "@/game/events/types";
import {
  processGraveyardEntryTriggers,
  processTideStateChange,
  processTrigger,
  revealStructuresOnTideChange,
} from "@/game/triggers/triggerBus";
import { discardFromHandState, recordGraveyardArrival } from "@/game/state/discard";
import {
  consumeEquippedEffectDamageShield,
  consumeReasonLossShield,
  consumeTideShipDamageShield,
  restoreStructureResistanceAfterLoss,
} from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import { applyAbyssesEntryOrExit, clearHouleSickness, isSick } from "@/game/environment/tideTransition";

const IGNORE_FLAG_PREFIX = "ignoreNextTideDamage";

function ignoreFlagFor(tideState: TideStateName): string {
  return `${IGNORE_FLAG_PREFIX}:${tideState}`;
}

interface TideDamageForPlayer {
  anchor: number;
  reason: number;
}

/**
 * Calcule les pertes d'Ancrage et de Raison qu'un joueur subit CHAQUE
 * TOUR pour l'état de Marée courant, à l'Intensité donnée : dégâts de
 * base × Intensité, modulés par le Navire (résistance/faiblesse). Jamais
 * négatif.
 *
 * Les Abysses n'ont PLUS de malus par tour ici (Notion "Moteur de partie
 * — déroulement, Raison & chaînes d'effets", section "Malus globaux des
 * Marées — verrouillé", 2026-09-10) : leur malus est un choc unique à
 * l'entrée, traité séparément par `applyAbyssesEntryOrExit`.
 */
function computeTideDamageForPlayer(
  player: PlayerState,
  tideState: TideStateName,
  intensity: number
): TideDamageForPlayer {
  if (tideState === "abysses") return { anchor: 0, reason: 0 };

  const baseAnchor = RULES.TIDE_ANCHOR_DAMAGE[tideState] ?? 0;
  const baseReason = RULES.TIDE_REASON_DAMAGE[tideState] ?? 0;

  const ship = getShipDefinition(player.shipId);
  const resistance = ship.resistanceByState?.[tideState] ?? 0;
  const weakness = ship.weaknessByState?.[tideState] ?? 0;
  const reasonWeakness = ship.reasonWeaknessByState?.[tideState] ?? 0;

  const anchor = Math.max(0, (baseAnchor + weakness - resistance) * intensity);
  const reason = Math.max(0, (baseReason + reasonWeakness) * intensity);

  return { anchor, reason };
}

interface BoardCardRef {
  unit: CardInstance;
  ownerId: PlayerId;
}

/**
 * Candidats éligibles au statut MALADE de la Houle — Marins/Créatures
 * uniquement. Structures/Objets/Équipements n'ont pas de "santé" au sens
 * où ce malus l'entend (perte de PV/tour n'a de sens narratif que pour un
 * membre d'équipage) et ne doivent jamais être tirés au sort ici.
 */
function collectBoardCards(state: GameState): BoardCardRef[] {
  const refs: BoardCardRef[] = [];
  for (const player of state.players) {
    for (const unit of player.board) {
      if (UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type)) {
        refs.push({ unit, ownerId: player.id });
      }
    }
  }
  return refs;
}

/**
 * Malus de la Houle (verrouillé, section "Malus globaux des Marées") :
 * une fois par tour tant que la Houle est active, une carte éligible
 * aléatoire du board (des deux joueurs confondus) a 10% de chances de
 * devenir MALADE ; toute carte actuellement MALADE perd 1 PV/Résistance
 * ce tour-ci. Le statut lui-même est retiré séparément dès la sortie de
 * la Houle (`clearHouleSickness`).
 */
function applyHouleSickness(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  const candidates = collectBoardCards(state);

  let rngState = state.rngState;
  let newlySickInstanceId: string | undefined;

  if (candidates.length > 0) {
    const pick = nextInt(rngState, candidates.length);
    rngState = pick.nextState;
    const roll = nextInt(rngState, 100);
    rngState = roll.nextState;

    if (roll.value < RULES.HOULE_SICKNESS_CHANCE_PERCENT) {
      const target = candidates[pick.value]!;
      if (!isSick(target.unit)) newlySickInstanceId = target.unit.instanceId;
    }
  }

  const players = state.players.map((player) => ({
    ...player,
    board: player.board.map((unit) =>
      unit.instanceId === newlySickInstanceId
        ? { ...unit, statuses: [...(unit.statuses ?? []), STATUS_MALADE] }
        : unit
    ),
  })) as [PlayerState, PlayerState];

  if (newlySickInstanceId) {
    events.push({ ...base, type: "STATUS_CHANGED", targetInstanceId: newlySickInstanceId, status: STATUS_MALADE, applied: true });
  }

  // Le dégât de MALADE est un dégât de Marée, donc un dégât d'EFFET : le
  // Casque-Coquille l'intercepte (arbitrage du 2026-09-14). Le bouclier
  // modifiant l'état (il détruit son propre Équipement), on l'enchaîne
  // unité par unité plutôt que de mapper le board d'un bloc.
  let damaged: GameState = { ...state, players, rngState };
  const sickPairs = players.flatMap((player) =>
    player.board.filter(isSick).map((unit) => ({ playerId: player.id, instanceId: unit.instanceId }))
  );

  for (const { playerId, instanceId } of sickPairs) {
    // Bouclier d'Équipement (Casque-Coquille) : il intercepte un dégât
    // d'effet, et le dégât de MALADE en est un.
    const shield = consumeEquippedEffectDamageShield(damaged, playerId, instanceId, turnNumber);
    damaged = shield.state;
    events.push(...shield.events);
    const amount = Math.max(0, RULES.HOULE_SICKNESS_DAMAGE - shield.reduction);
    if (amount === 0) continue;
    events.push({ ...base, type: "DAMAGE", targetInstanceId: instanceId, amount });
    damaged = {
      ...damaged,
      players: damaged.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              board: p.board.map((u) =>
                u.instanceId === instanceId
                  ? { ...u, damageMarked: u.damageMarked + amount, lastDamageCause: "tide" as const, lastDamageBy: undefined, lastDamageTurn: turnNumber }
                  : u
              ),
            }
          : p
      ) as [PlayerState, PlayerState],
    };
  }

  return { state: damaged, events };
}

/**
 * Dégâts de Marée sur les STRUCTURES (22/09/2026).
 *
 * La mer n'abîmait que les coques et les équipages : une Structure posée ne
 * craignait rien de la Tempête, ce qui rendait « Tenir la ligne » sans
 * objet — la capacité protégeait d'un danger inexistant.
 *
 * Seules les Structures sont touchées, et seulement celles qui ont une
 * Résistance : un Objet ne s'encaisse pas (`hasResistance`), et un
 * Équipement suit son porteur. Les dégâts sont marqués comme venant de la
 * MARÉE (`lastDamageCause`), ce qui les rend à la fois imputables au bon
 * poste dans le banc d'essai et couverts par `protectFromDestruction`.
 *
 * Une Structure masquée par la Marée n'est pas épargnée : elle est inactive,
 * pas à l'abri — la mer ne demande pas si on la voit.
 */
function applyTideStructureDamage(
  state: GameState,
  tideState: TideStateName,
  intensity: number,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const parTour = RULES.TIDE_STRUCTURE_DAMAGE[tideState] ?? 0;
  const amount = parTour * intensity;
  if (amount <= 0) return { state, events: [] };

  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  const touchee = (unit: CardInstance) => {
    const def = getCardDefinition(unit.cardId);
    return def.type === "structure" && hasResistance(def);
  };

  const players = state.players.map((player) => ({
    ...player,
    board: player.board.map((unit) => {
      if (!touchee(unit)) return unit;
      events.push({ ...base, type: "DAMAGE", targetInstanceId: unit.instanceId, amount });
      return { ...unit, damageMarked: unit.damageMarked + amount, lastDamageCause: "tide" as const, lastDamageBy: undefined, lastDamageTurn: turnNumber };
    }),
  })) as [PlayerState, PlayerState];

  // Wood Vy : une Structure alliée qui perd de la Résistance à la Marée en
  // récupère 1, comme sous un coup d'effet ou de combat.
  let nextState: GameState = { ...state, players };
  for (const player of state.players) {
    for (const unit of player.board) {
      if (!touchee(unit)) continue;
      const rendu = restoreStructureResistanceAfterLoss(nextState, player.id, unit.instanceId, amount, turnNumber);
      nextState = rendu.state;
      events.push(...rendu.events);
    }
  }
  return { state: nextState, events };
}

/**
 * Effets DE TOUR d'un état de Marée, pour les deux joueurs : dégâts
 * d'Ancrage/Raison (boucliers de Navire compris), dégâts aux Structures,
 * choc d'entrée/sortie des Abysses, maladie de la Houle. Appelé par
 * `appliquerMareeAnnoncee` au tick.
 */
export function applyTideTurnEffects(
  state: GameState,
  previousTideState: TideStateName,
  tideState: TideStateName,
  intensity: number,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  /** Défausses infligées par la Marée, relues après la boucle pour réveiller leurs déclencheurs. */
  const discardEvents: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  let nextState = state;

  let players = nextState.players.map((p) => ({ ...p })) as [PlayerState, PlayerState];

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const damage = computeTideDamageForPlayer(player, tideState, intensity);

    const flag = ignoreFlagFor(tideState);
    const statusFlags = [...player.statusFlags];
    const ignored = (damage.anchor > 0 || damage.reason > 0) && statusFlags.includes(flag);
    if (ignored) statusFlags.splice(statusFlags.indexOf(flag), 1);

    let anchorLoss = ignored ? 0 : damage.anchor;
    let reasonLoss = ignored ? 0 : damage.reason;
    let board = player.board;

    // Boucliers "1ère fois par tour" (Brise-Vague de Fortune : dégâts de
    // Marée au Navire ; Vieux Loup de Mer / Seconde au Visage Pâle : perte
    // de Raison) — consommés via `nextState` (qui porte le plateau à jour)
    // puis reportés dans `board` pour que la ré-assignation de `players[i]`
    // ci-dessous ne perde pas le marqueur "déjà utilisé ce tour-ci".
    if (anchorLoss > 0) {
      const shield = consumeTideShipDamageShield(nextState, player.id, turnNumber);
      nextState = shield.state;
      board = getPlayer(nextState, player.id).board;
      anchorLoss = Math.max(0, anchorLoss - shield.reduction);
    }
    if (reasonLoss > 0) {
      const shield = consumeReasonLossShield(nextState, player.id, turnNumber);
      nextState = shield.state;
      board = getPlayer(nextState, player.id).board;
      reasonLoss = Math.max(0, reasonLoss - shield.reduction);
    }

    // L'Armure du Navire (Lot 17) encaisse la Marée avant l'Ancrage.
    const armure = absorbShipDamage(player, anchorLoss);
    anchorLoss = armure.rest;
    events.push(...armorEvents(player.id, -armure.absorbed, armorOf(armure.player), turnNumber));

    // La défausse infligée par la Marée passe par la même voie que les
    // autres (`game/state/discard.ts`) : même cause, même journal
    // d'arrivées, mêmes événements complets — donc mêmes déclencheurs.
    let discardedPlayer = player;
    if (anchorLoss > 0) {
      const ship = getShipDefinition(player.shipId);
      const discardCount = ship.onTideDamageTakenByState?.[tideState]?.discardCount ?? 0;
      if (discardCount > 0) {
        const result = discardFromHandState(player, { count: discardCount }, base);
        discardedPlayer = result.player;
        events.push(...result.events);
        discardEvents.push(...result.events);
      }
    }

    players[i] = {
      ...discardedPlayer,
      armor: armure.player.armor,
      board,
      anchor: player.anchor - anchorLoss,
      reason: reasonAfterLoss(player, reasonLoss),
      statusFlags,
    };

    if (anchorLoss > 0) {
      events.push({ ...base, type: "DAMAGE", targetPlayerId: player.id, amount: anchorLoss, targetAnchorAfter: player.anchor - anchorLoss });
    }
    if (reasonLoss > 0) events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -reasonLoss });
  }

  nextState = { ...nextState, players };

  // Les cartes que la Marée vient d'arracher de la main sont défaussées
  // comme les autres : leurs déclencheurs se réveillent ici, une fois le
  // nouvel état des joueurs posé.
  if (discardEvents.length > 0) {
    const discardTriggers = processGraveyardEntryTriggers(nextState, discardEvents, turnNumber);
    nextState = discardTriggers.state;
    events.push(...discardTriggers.events);
  }

  // --- Structures : la Tempête ronge ce qui est posé ---------------------
  const structures = applyTideStructureDamage(nextState, tideState, intensity, turnNumber);
  nextState = structures.state;
  events.push(...structures.events);

  // --- Abysses : choc d'entrée (Ancrage + Raison max) / restauration à la sortie ---
  const abysses = applyAbyssesEntryOrExit(nextState, previousTideState, tideState, turnNumber);
  nextState = abysses.state;
  events.push(...abysses.events);

  // --- Houle : maladie aléatoire tant qu'active / nettoyage à la sortie ---
  if (tideState === "houle") {
    const sickness = applyHouleSickness(nextState, turnNumber);
    nextState = sickness.state;
    events.push(...sickness.events);
  } else if (previousTideState === "houle") {
    const cleared = clearHouleSickness(nextState, turnNumber);
    nextState = cleared.state;
    events.push(...cleared.events);
  }

  return { state: nextState, events };
}

/**
 * La Marée qui vient d'être annoncée, telle que l'ANNONCE l'a arrêtée.
 * Portée par `GameState.pendingTideStep` le temps de la fenêtre, puis
 * rendue à `appliquerMareeAnnoncee`.
 */
export interface AnnonceDeMaree {
  previousTideState: TideStateName;
  tideState: TideStateName;
  intensity: number;
  stateChanged: boolean;
}

/**
 * PREMIÈRE moitié de l'étape de Marée : l'ANNONCE (étapes 4-5 de la
 * structure de tour). Décompte la durée restante, avance éventuellement
 * vers l'état suivant — et s'arrête là. L'état de Marée est committé et
 * `TIDE_ADVANCED` est émis, mais AUCUN effet de tour n'est encore appliqué.
 *
 * Entre l'annonce et l'application, une fenêtre `onTideAnnounced` laisse
 * les joueurs réagir (capacités de Navire « après l'annonce d'une Marée »).
 */
export function annoncerMaree(
  state: GameState,
  turnNumber: number
): { state: GameState; events: GameEvent[]; annonce: AnnonceDeMaree } {
  const events: GameEvent[] = [];
  const previousTideState = state.environment.tideState;

  // La Marée ne PROGRESSE (décompte de durée + avancée d'état) qu'une fois
  // par tour DE TABLE — les deux joueurs ont joué — jamais à chaque tour
  // individuel (cadrage clarifié : "un tour" = un aller-retour des deux
  // joueurs, pas le tour d'un seul). `turnNumber` impair marque le retour
  // au premier joueur (P1 commence toujours à `turnNumber` 1, l'alternance
  // stricte de `getOpponent` garantit la parité pour toute la partie) :
  // c'est le seul moment où `tickTide` s'exécute réellement. Les dégâts/
  // effets DE la Marée courante, eux, continuent de s'appliquer à chaque
  // tour individuel (inchangé, cf. commentaire de fonction ci-dessus).
  const isNewRound = turnNumber % 2 === 1;
  const tick = isNewRound
    ? tickTide(state.environment)
    : {
        tideState: state.environment.tideState,
        tideRemainingTurns: state.environment.tideRemainingTurns,
        tideOrientation: state.environment.tideOrientation,
        tideIntensity: state.environment.tideIntensity,
        pendingTideModifiers: state.environment.pendingTideModifiers,
        stateChanged: false,
      };
  const { amplified, modifiers: modifiersAfterAmplify } = consumeAmplify(tick.pendingTideModifiers);
  const intensity = amplified ? tick.tideIntensity * 2 : tick.tideIntensity;

  let nextState: GameState = {
    ...state,
    environment: {
      ...state.environment,
      tideState: tick.tideState,
      tideRemainingTurns: tick.tideRemainingTurns,
      tideOrientation: tick.tideOrientation,
      tideIntensity: tick.tideIntensity,
      pendingTideModifiers: modifiersAfterAmplify,
    },
  };

  events.push({
    type: "TIDE_ADVANCED",
    turnNumber,
    timestamp: Date.now(),
    remainingTurns: tick.tideRemainingTurns,
    tideState: tick.tideState,
    tideOrientation: tick.tideOrientation,
    stateChanged: tick.stateChanged,
  });

  return {
    state: nextState,
    events,
    annonce: { previousTideState, tideState: tick.tideState, intensity, stateChanged: tick.stateChanged },
  };
}

/**
 * SECONDE moitié de l'étape de Marée (étapes 6-7) : les effets de tour de
 * la Marée annoncée, les capacités d'entrée/sortie d'état, l'expiration des
 * permanents à durée limitée, et les Structures qui deviennent visibles.
 */
export function appliquerMareeAnnoncee(
  state: GameState,
  turnNumber: number,
  annonce: AnnonceDeMaree
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  const { previousTideState, tideState, intensity } = annonce;
  const tick = { tideState, stateChanged: annonce.stateChanged };
  let nextState = state;

  const turnEffects = applyTideTurnEffects(nextState, previousTideState, tideState, intensity, turnNumber);
  nextState = turnEffects.state;
  events.push(...turnEffects.events);

  if (tick.stateChanged) {
    const change = processTideStateChange(nextState, previousTideState, tick.tideState, turnNumber);
    nextState = change.state;
    events.push(...change.events);
  }

  // --- Expiration des permanents à durée limitée (Structures/Objets) -----
  // « Durée : 3 tours de table » sur une CARTE (harmonisation du
  // 09/10/2026 : toute durée s'écrit en tours de table) : un tour de table,
  // c'est un tour de chaque joueur, donc UN tour de son contrôleur — c'est
  // ainsi que se lit « à chacun de vos tours », et une carte posée ne fond
  // pas deux fois plus vite parce que l'adversaire joue aussi (décision du
  // 17/09/2026). La durée d'un état de Marée se compte, elle aussi, en tours
  // de table.
  //
  // Le décompte a donc lieu au début du tour de son propriétaire, et
  // `resolveTideTurnStep` est appelée juste après le passage de main : le
  // joueur actif est celui qui commence. Ni mort ni Sabordage.
  //
  // Seule exception au « tour du contrôleur » : un permanent marqué
  // `expiresAtNextTurnStart` (Anomalie dont les choix imposés sont épuisés,
  // cf. `anomalyForceChoiceAtStartOfTurn.times`) part à l'entame du tour
  // suivant, quel que soit le joueur qui commence.
  for (const player of nextState.players) {
    const isActive = player.id === nextState.activePlayerId;
    const expiring = player.board.filter(
      (u) => u.expiresAtNextTurnStart || (isActive && u.turnsRemaining !== undefined && u.turnsRemaining <= 1)
    );
    if (!isActive && expiring.length === 0) continue;
    const board = player.board
      .filter((u) => !expiring.some((e) => e.instanceId === u.instanceId))
      .map((u) => (isActive && u.turnsRemaining !== undefined ? { ...u, turnsRemaining: u.turnsRemaining - 1 } : u));

    // Le décompte (nouveau `board`) doit toujours être appliqué, même
    // quand rien n'expire ce tour-ci — un `continue` prématuré ici
    // revenait à ignorer silencieusement la décrémentation tant qu'aucune
    // Structure n'atteignait 0, ce qui la figeait indéfiniment à sa
    // valeur initiale.
    const graveyard =
      expiring.length > 0
        ? [...player.graveyard, ...expiring.map((u) => ({ ...u, damageMarked: 0, modifiers: [], graveyardCause: "expired" as const }))]
        : player.graveyard;
    const withArrivals = expiring.reduce<PlayerState>(
      (acc, u) => recordGraveyardArrival(acc, { cardId: u.cardId, instanceId: u.instanceId, turnNumber, fromZone: "board" }),
      { ...player, board, graveyard }
    );
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === player.id ? withArrivals : p)) as [
        PlayerState,
        PlayerState
      ],
    };

    if (expiring.length === 0) continue;

    for (const unit of expiring) {
      events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone: "board", toZone: "graveyard" });
      const expireTrigger = processTrigger(
        nextState,
        { trigger: "onExpire", playerId: player.id, cardId: unit.cardId, sourceInstanceId: unit.instanceId },
        turnNumber
      );
      nextState = expireTrigger.state;
      events.push(...expireTrigger.events);
    }
  }

  // --- "Devient visible" : Structures passant d'invisible à visible ------
  // Ne dépend que d'une transition d'état de Marée (`visibleDuringTide`).
  if (tick.stateChanged) {
    const reveal = revealStructuresOnTideChange(nextState, previousTideState, tick.tideState, turnNumber);
    nextState = reveal.state;
    events.push(...reveal.events);
  }

  return { state: nextState, events };
}

/**
 * Étape de Marée complète, annonce ET application, sans fenêtre
 * intermédiaire. `endTurn` ne passe plus par ici — il a besoin de la
 * coupure pour ouvrir `onTideAnnounced` — mais le reste du moteur et les
 * tests qui n'ont que faire de la fenêtre gardent un appel en un geste.
 */
export function resolveTideTurnStep(
  state: GameState,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const annonce = annoncerMaree(state, turnNumber);
  const applique = appliquerMareeAnnoncee(annonce.state, turnNumber, annonce.annonce);
  return { state: applique.state, events: [...annonce.events, ...applique.events] };
}

export function grantIgnoreNextTideDamage(player: PlayerState, tideState: TideStateName): PlayerState {
  const flag = ignoreFlagFor(tideState);
  if (player.statusFlags.includes(flag)) return player;
  return { ...player, statusFlags: [...player.statusFlags, flag] };
}
