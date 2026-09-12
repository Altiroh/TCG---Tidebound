import { consumeAmplify, tickTide } from "@/game/environment/tide";
import { getShipDefinition } from "@/game/environment/shipData";
import type { TideStateName } from "@/game/environment/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide, STATUS_MALADE, UNIT_CARD_TYPES } from "@/game/cards/types";
import type { CardInstance } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";
import { nextInt } from "@/game/rng";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import { applyTideChangeAnomalies } from "@/game/state/anomalies";
import { consumeReasonLossShield, consumeTideShipDamageShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";

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

interface AbyssesEntryLoss {
  anchor: number;
  extraReason: number;
}

/**
 * Choc d'entrée dans les Abysses (une seule fois, pas par tour) : Ancrage
 * fixe modulé par le Navire, plus une éventuelle perte de Raison
 * supplémentaire propre au Navire (ex: "Équipage à bout" du Brise-Lames,
 * `reasonWeaknessByState.abysses`). La réduction de Raison maximale
 * elle-même est appliquée séparément (`applyAbyssesEntryOrExit`).
 */
function computeAbyssesEntryLoss(player: PlayerState): AbyssesEntryLoss {
  const ship = getShipDefinition(player.shipId);
  const resistance = ship.resistanceByState?.abysses ?? 0;
  const weakness = ship.weaknessByState?.abysses ?? 0;
  const anchor = Math.max(0, RULES.ABYSSES_ENTRY_ANCHOR_LOSS + weakness - resistance);
  const extraReason = ship.reasonWeaknessByState?.abysses ?? 0;
  return { anchor, extraReason };
}

/**
 * Applique le choc d'entrée dans les Abysses (-Ancrage one-shot, -Raison
 * max continue avec clampage immédiat de la Raison courante) ou restaure
 * la Raison max à la sortie. Ne fait rien en dehors d'une transition
 * entrante/sortante des Abysses.
 */
function applyAbyssesEntryOrExit(
  state: GameState,
  previousTideState: TideStateName,
  newTideState: TideStateName,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  if (newTideState === "abysses" && previousTideState !== "abysses") {
    const players = state.players.map((player) => {
      const loss = computeAbyssesEntryLoss(player);
      const reasonMax = Math.max(0, player.reasonMax - RULES.ABYSSES_REASON_MAX_PENALTY);
      const reason = Math.max(0, Math.min(player.reason - loss.extraReason, reasonMax));
      return { ...player, anchor: player.anchor - loss.anchor, reasonMax, reason };
    }) as [PlayerState, PlayerState];

    for (let i = 0; i < state.players.length; i++) {
      const before = state.players[i]!;
      const after = players[i]!;
      const loss = computeAbyssesEntryLoss(before);
      if (loss.anchor > 0) events.push({ ...base, type: "DAMAGE", targetPlayerId: before.id, amount: loss.anchor });
      if (after.reason !== before.reason) {
        events.push({ ...base, type: "REASON_CHANGED", playerId: before.id, delta: after.reason - before.reason });
      }
    }

    return { state: { ...state, players }, events };
  }

  if (previousTideState === "abysses" && newTideState !== "abysses") {
    const players = state.players.map((player) => ({
      ...player,
      reasonMax: player.reasonMax + RULES.ABYSSES_REASON_MAX_PENALTY,
    })) as [PlayerState, PlayerState];
    return { state: { ...state, players }, events };
  }

  return { state, events };
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

function isSick(unit: CardInstance): boolean {
  return (unit.statuses ?? []).includes(STATUS_MALADE);
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

  const damagedPlayers = players.map((player) => ({
    ...player,
    board: player.board.map((unit) => {
      if (!isSick(unit)) return unit;
      events.push({ ...base, type: "DAMAGE", targetInstanceId: unit.instanceId, amount: RULES.HOULE_SICKNESS_DAMAGE });
      return { ...unit, damageMarked: unit.damageMarked + RULES.HOULE_SICKNESS_DAMAGE };
    }),
  })) as [PlayerState, PlayerState];

  return { state: { ...state, players: damagedPlayers, rngState }, events };
}

/** Retire automatiquement le statut MALADE de tout le board dès que la Marée quitte la Houle. */
function clearHouleSickness(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };

  for (const player of state.players) {
    for (const unit of player.board) {
      if (isSick(unit)) events.push({ ...base, type: "STATUS_CHANGED", targetInstanceId: unit.instanceId, status: STATUS_MALADE, applied: false });
    }
  }

  const players = state.players.map((player) => ({
    ...player,
    board: player.board.map((unit) =>
      isSick(unit) ? { ...unit, statuses: unit.statuses!.filter((s) => s !== STATUS_MALADE) } : unit
    ),
  })) as [PlayerState, PlayerState];

  return { state: { ...state, players }, events };
}

/**
 * Applique une étape complète de progression de Marée pour le début d'un
 * tour (étapes 4-7 de la structure de tour verrouillée) : décompte la
 * durée restante, avance éventuellement vers l'état suivant, puis
 * applique les effets environnementaux du tour — dégâts d'Ancrage/Raison
 * aux deux joueurs à CHAQUE tour tant qu'on est en Tempête (pas seulement
 * à l'entrée), choc d'entrée/sortie unique pour les Abysses, et maladie
 * aléatoire de la Houle — avec réactions de Navire et déclenchement des
 * capacités `onTideStateEntered` en cas de changement d'état.
 */
export function resolveTideTurnStep(
  state: GameState,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
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

  // "La Mer Réclame Davantage" : uniquement sur un vrai CHANGEMENT d'état
  // (`tick.stateChanged`), jamais sur un simple décompte dans le même état —
  // lue AVANT que le nouvel état ne soit committé ci-dessous.
  const tideAnomaly = tick.stateChanged
    ? applyTideChangeAnomalies(state, tick.tideRemainingTurns)
    : { tideRemainingTurns: tick.tideRemainingTurns, anchorDamagePerShip: 0 };

  let nextState: GameState = {
    ...state,
    environment: {
      ...state.environment,
      tideState: tick.tideState,
      tideRemainingTurns: tideAnomaly.tideRemainingTurns,
      tideOrientation: tick.tideOrientation,
      tideIntensity: tick.tideIntensity,
      pendingTideModifiers: modifiersAfterAmplify,
    },
  };

  events.push({
    type: "TIDE_ADVANCED",
    turnNumber,
    timestamp: Date.now(),
    remainingTurns: tideAnomaly.tideRemainingTurns,
    tideState: tick.tideState,
    tideOrientation: tick.tideOrientation,
    stateChanged: tick.stateChanged,
  });

  if (tideAnomaly.anchorDamagePerShip > 0) {
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => ({ ...p, anchor: p.anchor - tideAnomaly.anchorDamagePerShip })) as [
        PlayerState,
        PlayerState
      ],
    };
    for (const p of nextState.players) {
      events.push({ ...base, type: "DAMAGE", targetPlayerId: p.id, amount: tideAnomaly.anchorDamagePerShip });
    }
  }

  let players = nextState.players.map((p) => ({ ...p })) as [PlayerState, PlayerState];

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const damage = computeTideDamageForPlayer(player, tick.tideState, intensity);

    const flag = ignoreFlagFor(tick.tideState);
    const statusFlags = [...player.statusFlags];
    const ignored = (damage.anchor > 0 || damage.reason > 0) && statusFlags.includes(flag);
    if (ignored) statusFlags.splice(statusFlags.indexOf(flag), 1);

    let anchorLoss = ignored ? 0 : damage.anchor;
    let reasonLoss = ignored ? 0 : damage.reason;
    let board = player.board;

    // Boucliers "1ère fois par tour" (Brise-Vague de Fortune : dégâts de
    // Marée au Navire ; Vieux Loup de Mer / Second au Visage Pâle : perte
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

    let hand = player.hand;
    let graveyard = player.graveyard;
    if (anchorLoss > 0) {
      const ship = getShipDefinition(player.shipId);
      const discardCount = ship.onTideDamageTakenByState?.[tick.tideState]?.discardCount ?? 0;
      for (let d = 0; d < discardCount && hand.length > 0; d++) {
        const [discarded, ...rest] = hand;
        hand = rest;
        graveyard = [...graveyard, { ...discarded!, graveyardCause: "discarded" as const }];
        events.push({ ...base, type: "CARD_MOVED", instanceId: discarded!.instanceId, fromZone: "hand", toZone: "graveyard" });
      }
    }

    players[i] = {
      ...player,
      board,
      anchor: player.anchor - anchorLoss,
      reason: Math.max(0, player.reason - reasonLoss),
      statusFlags,
      hand,
      graveyard,
    };

    if (anchorLoss > 0) events.push({ ...base, type: "DAMAGE", targetPlayerId: player.id, amount: anchorLoss });
    if (reasonLoss > 0) events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -reasonLoss });
  }

  nextState = { ...nextState, players };

  // --- Abysses : choc d'entrée (Ancrage + Raison max) / restauration à la sortie ---
  const abysses = applyAbyssesEntryOrExit(nextState, previousTideState, tick.tideState, turnNumber);
  nextState = abysses.state;
  events.push(...abysses.events);

  // --- Houle : maladie aléatoire tant qu'active / nettoyage à la sortie ---
  if (tick.tideState === "houle") {
    const sickness = applyHouleSickness(nextState, turnNumber);
    nextState = sickness.state;
    events.push(...sickness.events);
  } else if (previousTideState === "houle") {
    const cleared = clearHouleSickness(nextState, turnNumber);
    nextState = cleared.state;
    events.push(...cleared.events);
  }

  if (tick.stateChanged) {
    const trigger = processTrigger(nextState, { trigger: "onTideStateEntered", tideState: tick.tideState }, turnNumber);
    nextState = trigger.state;
    events.push(...trigger.events);

    const exitTrigger = processTrigger(
      nextState,
      { trigger: "onTideStateExited", tideState: previousTideState },
      turnNumber
    );
    nextState = exitTrigger.state;
    events.push(...exitTrigger.events);
  }

  // --- Expiration des permanents à durée limitée (Structures/Objets) -----
  // Décompte une fois par tour joué, tous joueurs confondus (même
  // convention que la durée des états de Marée). Ni mort ni Sabordage.
  for (const player of nextState.players) {
    const expiring = player.board.filter((u) => u.turnsRemaining !== undefined && u.turnsRemaining <= 1);
    const board = player.board
      .filter((u) => !expiring.some((e) => e.instanceId === u.instanceId))
      .map((u) => (u.turnsRemaining !== undefined ? { ...u, turnsRemaining: u.turnsRemaining - 1 } : u));

    // Le décompte (nouveau `board`) doit toujours être appliqué, même
    // quand rien n'expire ce tour-ci — un `continue` prématuré ici
    // revenait à ignorer silencieusement la décrémentation tant qu'aucune
    // Structure n'atteignait 0, ce qui la figeait indéfiniment à sa
    // valeur initiale.
    const graveyard =
      expiring.length > 0
        ? [...player.graveyard, ...expiring.map((u) => ({ ...u, damageMarked: 0, modifiers: [], graveyardCause: "expired" as const }))]
        : player.graveyard;
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === player.id ? { ...p, board, graveyard } : p)) as [
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
    for (const playerId of nextState.players.map((p) => p.id)) {
      const player = nextState.players.find((p) => p.id === playerId)!;
      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        if (!def.visibleDuringTide) continue;
        const wasVisible = isVisibleDuringTide(def, previousTideState);
        const isVisible = isVisibleDuringTide(def, tick.tideState);
        if (wasVisible || !isVisible) continue;
        const becomeVisibleTrigger = processTrigger(
          nextState,
          { trigger: "onBecomeVisible", playerId, cardId: unit.cardId, sourceInstanceId: unit.instanceId },
          turnNumber
        );
        nextState = becomeVisibleTrigger.state;
        events.push(...becomeVisibleTrigger.events);
      }
    }
  }

  return { state: nextState, events };
}

export function grantIgnoreNextTideDamage(player: PlayerState, tideState: TideStateName): PlayerState {
  const flag = ignoreFlagFor(tideState);
  if (player.statusFlags.includes(flag)) return player;
  return { ...player, statusFlags: [...player.statusFlags, flag] };
}
