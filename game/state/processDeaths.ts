import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasResistance, type CardInstance } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import { collectReactionCandidates, processTrigger } from "@/game/triggers/triggerBus";
import { leaveChromaticShard } from "@/game/rules/chromaticShards";
import type { DestructionCause } from "@/game/cards/types";
import { reasonAfterLoss } from "@/game/state/reason";
import { recordGraveyardArrival } from "@/game/state/discard";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import type { GameState, PlayerState } from "@/game/state/types";

/**
 * Ce permanent est-il couvert, en ce moment, par une protection de son
 * contrôleur contre CETTE cause de destruction (`PlayerState.destructionProtections`,
 * ex: Brise-Lames — Tenir la ligne) ?
 *
 * Un Sabordage n'est jamais couvert : c'est un coût consenti, pas une
 * destruction subie — même règle que pour les substitutions et les survies.
 */
export function isProtectedFromDestruction(
  controller: PlayerState,
  unit: CardInstance,
  cause: DestructionCause,
  turnNumber: number
): boolean {
  if (cause === "scuttle" || unit.pendingRemoval === "scuttled") return false;
  const cardType = getCardDefinition(unit.cardId).type;
  return (controller.destructionProtections ?? []).some(
    (protection) =>
      turnNumber <= protection.expiresAfterTurn &&
      protection.causes.includes(cause) &&
      (protection.cardTypes === undefined || protection.cardTypes.includes(cardType))
  );
}

function shouldDie(
  unit: CardInstance,
  tideState: TideStateName,
  controller: PlayerState,
  tideOrientation: "montante" | "descendante",
  turnNumber: number
): boolean {
  const stats = computeEffectiveStats(unit, tideState, {
    controllerBoard: controller.board,
    controllerReason: controller.reason,
    tideOrientation,
  });
  // Une protection en cours écarte le départ AVANT toute autre
  // considération : « ne peut pas être détruite » se lit au pied de la
  // lettre. Les dégâts déjà marqués, eux, restent — la protection fait
  // gagner du temps, elle ne soigne pas.
  if (isProtectedFromDestruction(controller, unit, destructionCauseOf(unit, stats.destroyedByTide), turnNumber)) {
    return false;
  }
  // Un départ déjà décidé (effet `destroy`/`saborde`, action Saborder,
  // Ancre de Dérive) ne dépend d'aucune arithmétique de Résistance : une
  // Anomalie sans Résistance doit pouvoir partir comme une Créature.
  if (unit.pendingRemoval) return true;
  // Sans Résistance (un Objet), l'arithmétique des dégâts ne s'applique
  // pas : `stats.health` vaudrait 0 et la carte mourrait dès son arrivée.
  // Seule la Marée peut encore l'emporter (`tideAffinity.destroyed`).
  if (!hasResistance(getCardDefinition(unit.cardId))) return stats.destroyedByTide;
  return unit.damageMarked >= stats.health || stats.destroyedByTide;
}

/** Équipement attaché à `unitInstanceId` sur CE plateau et porteur d'un `destructionSubstitute` (ex: Plaque de Fortune) — `undefined` si aucun. */
function findDestructionSubstitute(board: CardInstance[], unitInstanceId: string): CardInstance | undefined {
  return board.find(
    (u) => u.attachedToInstanceId === unitInstanceId && Boolean(getCardDefinition(u.cardId).destructionSubstitute)
  );
}

/**
 * Applique la substitution de destruction (Plaque de Fortune et
 * assimilées) : détruit l'Équipement au lieu de l'unité sauvée, inflige le
 * malus permanent de Résistance, et réduit les dégâts marqués juste sous
 * le nouveau seuil pour que l'unité survive concrètement à CE cycle
 * (au lieu de mourir immédiatement rehaussée par son propre malus).
 */
function applyDestructionSubstitute(
  state: GameState,
  turnNumber: number,
  ownerId: string,
  unit: CardInstance,
  substitute: CardInstance
): { state: GameState; events: GameEvent[] } {
  const player = state.players.find((p) => p.id === ownerId)!;
  const penalty = getCardDefinition(substitute.cardId).destructionSubstitute?.healthPenalty ?? 1;
  const modifiers = [
    ...unit.modifiers,
    { id: `mod_${Math.random().toString(36).slice(2, 8)}`, source: substitute.cardId, attack: 0, health: -penalty, duration: "permanent" as const },
  ];
  const newEffectiveHealth = computeEffectiveStats(
    { ...unit, modifiers },
    state.environment.tideState,
    { controllerBoard: player.board, controllerReason: player.reason, tideOrientation: state.environment.tideOrientation }
  ).health;
  const savedUnit: CardInstance = {
    ...unit,
    modifiers,
    damageMarked: Math.max(0, Math.min(unit.damageMarked, newEffectiveHealth - 1)),
    // La destruction est esquivée : le départ n'a plus lieu.
    pendingRemoval: undefined,
  };

  const board = player.board
    .filter((u) => u.instanceId !== substitute.instanceId)
    .map((u) => (u.instanceId === unit.instanceId ? savedUnit : u));
  const graveyard = [
    ...player.graveyard,
    { ...substitute, damageMarked: 0, modifiers: [], graveyardCause: "destroyed" as const },
  ];

  const nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === ownerId ? { ...p, board, graveyard } : p)) as [PlayerState, PlayerState],
  };
  const event: GameEvent = {
    type: "DESTROY",
    instanceId: substitute.instanceId,
    reason: "effect",
    turnNumber,
    timestamp: Date.now(),
  };
  return { state: nextState, events: [event] };
}

/**
 * COMMENT cette unité est en train de partir.
 *
 * Elle ne peut plus être interrogée une fois morte : la cause se déduit ici,
 * au moment où elle quitte le plateau, de la dernière source de dégâts
 * qu'elle a retenue (`lastDamageCause`) et de la façon dont elle part.
 *
 * L'ordre compte. Un Sabordage est un coût consenti et prime sur tout le
 * reste ; une destruction DIRECTE par la Marée (une Vigie aux Abysses) n'est
 * pas des dégâts et ne doit pas être imputée au dernier coup reçu ; et une
 * unité marquée `pendingRemoval` par un effet de destruction meurt de cet
 * effet, même si elle portait des dégâts de combat.
 */
export function destructionCauseOf(
  unit: CardInstance,
  destroyedByTide: boolean
): DestructionCause {
  if (unit.pendingRemoval === "scuttled") return "scuttle";
  if (destroyedByTide) return "tide";
  if (unit.pendingRemoval === "destroyed") return "effect";
  return unit.lastDamageCause ?? "effect";
}

const SURVIVES_LETHAL_KEY = "survivesLethal";

/**
 * "Il reste à 1 Résistance à la place" (`survivesLethalOncePerTurn`) :
 * ramène les dégâts marqués juste sous la vie effective, une fois par
 * tour, si la Marée est dans l'un des états requis. Retourne `undefined`
 * si la carte ne se sauve pas (pas de capacité, Marée hors condition,
 * déjà utilisée ce tour-ci, ou destruction directe par la Marée).
 */
function applySelfSurvival(
  state: GameState,
  turnNumber: number,
  owner: PlayerState,
  unit: CardInstance
): GameState | undefined {
  const survival = getCardDefinition(unit.cardId).survivesLethalOncePerTurn;
  // `tideStateIn` absent : la survie ne dépend d'aucun état de Marée.
  if (!survival) return undefined;
  if (survival.tideStateIn && !survival.tideStateIn.includes(state.environment.tideState)) return undefined;
  // « qu'elle devrait être détruite AU COMBAT » : la survie ne joue que
  // contre les causes que le texte nomme.
  if (survival.from) {
    const stats = computeEffectiveStats(unit, state.environment.tideState, {
      controllerBoard: owner.board,
      controllerReason: owner.reason,
      tideOrientation: state.environment.tideOrientation,
    });
    if (!survival.from.includes(destructionCauseOf(unit, stats.destroyedByTide))) return undefined;
  }
  if (!oncePerTurnAvailable(unit, SURVIVES_LETHAL_KEY, turnNumber)) return undefined;
  const stats = computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: owner.board,
    controllerReason: owner.reason,
    tideOrientation: state.environment.tideOrientation,
  });
  if (stats.destroyedByTide || stats.health < 1) return undefined;
  const saved = markOncePerTurnUsed({ ...unit, damageMarked: stats.health - 1, pendingRemoval: undefined }, SURVIVES_LETHAL_KEY, turnNumber, survival.onceEver);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === owner.id ? { ...p, board: p.board.map((u) => (u.instanceId === unit.instanceId ? saved : u)) } : p
    ) as [PlayerState, PlayerState],
  };
}

/**
 * Un Équipement suit son porteur : quand le permanent auquel il est
 * attaché n'est plus sur le plateau (détruit, Sabordé, expiré, renvoyé en
 * main…), l'Équipement part au cimetière avec lui — "sauf contre-indication
 * de l'effet", c'est-à-dire sauf s'il déclare `survivesOwnerDestruction`.
 *
 * Nettoyage passé en revue à CHAQUE passe de `processDeaths` plutôt qu'à
 * chaque site de départ (destruction, Sabordage, effet `destroy`,
 * expiration de durée…) : `dispatch` fait toujours passer une action par
 * ici, ce qui donne un point unique — et couvre du même coup les départs
 * en chaîne (un Équipement détruit avec son porteur peut en faire mourir
 * d'autres).
 *
 * Un Équipement jamais attaché (`attachedToInstanceId` absent, ex: joué
 * sans cible légale) n'est PAS orphelin : il n'a jamais eu de porteur.
 */
function destroyOrphanedEquipment(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let next = state;

  for (const player of state.players) {
    const orphans = player.board.filter((unit) => {
      if (!unit.attachedToInstanceId) return false;
      if (getCardDefinition(unit.cardId).survivesOwnerDestruction) return false;
      return !player.board.some((u) => u.instanceId === unit.attachedToInstanceId);
    });
    if (orphans.length === 0) continue;

    const orphanIds = new Set(orphans.map((u) => u.instanceId));
    const current = next.players.find((p) => p.id === player.id)!;
    next = {
      ...next,
      players: next.players.map((p) =>
        p.id === player.id
          ? orphans.reduce<PlayerState>(
              (acc, u) => recordGraveyardArrival(acc, { cardId: u.cardId, turnNumber, fromZone: "board" }),
              {
                ...p,
                board: current.board.filter((u) => !orphanIds.has(u.instanceId)),
                graveyard: [
                  ...current.graveyard,
                  ...orphans.map((u) => ({ ...u, damageMarked: 0, modifiers: [], attachedToInstanceId: undefined, graveyardCause: "destroyed" as const })),
                ],
              }
            )
          : p
      ) as [PlayerState, PlayerState],
    };

    for (const orphan of orphans) {
      events.push({ type: "DESTROY", instanceId: orphan.instanceId, reason: "effect", turnNumber, timestamp: Date.now() });
      const triggerResult = processTrigger(
        next,
        // Un Équipement qui suit son porteur est DÉTRUIT par la règle — une
        // cause « effet », sans quoi « un Équipement adverse est détruit »
        // (Mange-Fer) ne le verrait jamais.
        { trigger: "onDeath", sourceInstanceId: orphan.instanceId, cardId: orphan.cardId, playerId: player.id, destructionCause: "effect" },
        turnNumber
      );
      next = triggerResult.state;
      events.push(...triggerResult.events);
    }
  }

  return { state: next, events };
}

/**
 * Repère les unités dont les dégâts marqués atteignent ou dépassent leur
 * vie effective (ou que la Marée courante détruit directement, ex: la
 * Vigie fragile aux Abysses), les envoie au cimetière et déclenche leurs
 * capacités `onDeath`. Boucle jusqu'à stabilisation, avec une garde-fou
 * anti-boucle infinie.
 */
/**
 * Au moins un joueur a-t-il, en jeu, une capacité facultative capable de
 * répondre à la destruction de l'un de ces permanents ?
 *
 * On ne l'ouvre QUE si quelqu'un peut vraiment répondre : une fenêtre vide
 * ferait attendre les deux joueurs pour rien à chaque échange de combat.
 * Le recensement est celui de tout le monde (`collectReactionCandidates`) :
 * les conditions, les coûts et les cibles y sont déjà évalués.
 */
function hasRescueCandidate(
  state: GameState,
  doomed: Array<{ unit: CardInstance; owner: PlayerState }>,
  turnNumber: number
): boolean {
  const events = doomed.map(({ unit, owner }) => ({
    trigger: "onPermanentWouldBeDestroyed" as const,
    sourceInstanceId: unit.instanceId,
    cardId: unit.cardId,
    playerId: owner.id,
  }));
  return state.players.some((p) => collectReactionCandidates(state, events, p.id, turnNumber).length > 0);
}

export function processDeaths(
  state: GameState,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  const MAX_ITERATIONS = 20;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // --- Substitutions de destruction (ex: Plaque de Fortune) : appliquées
    // AVANT la collecte des morts, pour qu'une unité sauvée ne soit jamais
    // envoyée au cimetière ce cycle-ci. Les paires (joueur, unité) à
    // vérifier sont figées au départ, mais chaque application relit l'état
    // COURANT (`current`, déjà éventuellement modifié par une substitution
    // précédente dans cette même passe) plutôt qu'une référence figée.
    const lethalPairs: Array<{ playerId: string; unitInstanceId: string }> = [];
    for (const player of current.players) {
      for (const unit of player.board) {
        if (shouldDie(unit, current.environment.tideState, player, current.environment.tideOrientation, turnNumber)) {
          lethalPairs.push({ playerId: player.id, unitInstanceId: unit.instanceId });
        }
      }
    }
    for (const { playerId, unitInstanceId } of lethalPairs) {
      const player = current.players.find((p) => p.id === playerId);
      const unit = player?.board.find((u) => u.instanceId === unitInstanceId);
      if (!player || !unit || !shouldDie(unit, current.environment.tideState, player, current.environment.tideOrientation, turnNumber)) continue;
      // Un Sabordage est un coût consenti : ni substitution ni survie.
      if (unit.pendingRemoval === "scuttled") continue;
      const substitute = findDestructionSubstitute(player.board, unit.instanceId);
      if (substitute) {
        const result = applyDestructionSubstitute(current, turnNumber, player.id, unit, substitute);
        current = result.state;
        events.push(...result.events);
        continue;
      }
      // "Il reste à 1 Résistance à la place" (Revenante de la Fosse).
      const survived = applySelfSurvival(current, turnNumber, player, unit);
      if (survived) current = survived;
    }

    const tideState = current.environment.tideState;
    const deaths: Array<{ unit: CardInstance; owner: PlayerState }> = [];

    for (const player of current.players) {
      for (const unit of player.board) {
        if (shouldDie(unit, tideState, player, current.environment.tideOrientation, turnNumber)) deaths.push({ unit, owner: player });
      }
    }

    // --- FENÊTRE DE SAUVETAGE (Lot 14) --------------------------------
    //
    // « Lorsqu'une de vos unités devrait être détruite… » : avant d'emporter
    // quoi que ce soit, on marque les condamnés et on rend la main. C'est
    // `dispatch` qui ouvrira la fenêtre `onPermanentWouldBeDestroyed` et
    // reprendra cette passe une fois qu'elle se sera refermée.
    //
    // Un Sabordage n'ouvre rien : c'est un coût consenti, comme pour les
    // substitutions et les survies.
    //
    // Le drapeau posé sur l'instance empêche la question de se reposer à
    // chaque reprise. Il ne survit pas à ce qu'il borne : une carte sauvée
    // le perd (`surviveWithHealth`), une carte qui part l'emporte.
    const aSauver = deaths.filter(
      ({ unit }) => !unit.rescueWindowOffered && unit.pendingRemoval !== "scuttled"
    );
    if (aSauver.length > 0 && hasRescueCandidate(current, aSauver, turnNumber)) {
      const marques = new Set(aSauver.map(({ unit }) => unit.instanceId));
      return {
        state: {
          ...current,
          players: current.players.map((p) => ({
            ...p,
            board: p.board.map((u) => (marques.has(u.instanceId) ? { ...u, rescueWindowOffered: true } : u)),
          })) as [PlayerState, PlayerState],
          pendingDestruction: { instanceIds: [...marques], turnNumber },
        },
        events,
      };
    }

    if (deaths.length === 0) {
      // Plus personne ne meurt : reste à renvoyer au cimetière les
      // Équipements dont le porteur vient de partir. S'ils en font mourir
      // d'autres (perte de Résistance apportée par l'Équipement), la
      // passe suivante s'en chargera ; sinon on s'arrête là.
      const orphaned = destroyOrphanedEquipment(current, turnNumber);
      if (orphaned.events.length === 0) break;
      current = orphaned.state;
      events.push(...orphaned.events);
      continue;
    }

    let next = current;
    for (const { unit, owner } of deaths) {
      const player = next.players.find((p) => p.id === owner.id);
      if (!player) continue;

      // Équipement attaché portant `controllerReasonLossOnOwnDestruction`
      // (ex: Chaîne de Fer Noir) : son contrôleur perd de la Raison quand
      // l'unité qu'il équipe meurt — lu AVANT le filtrage du board, tant
      // que l'Équipement (toujours attaché à `unit`) y est encore présent.
      const equipReasonLoss = player.board
        .filter((u) => u.attachedToInstanceId === unit.instanceId)
        .reduce((sum, equip) => sum + (getCardDefinition(equip.cardId).controllerReasonLossOnOwnDestruction ?? 0), 0);

      const boardWithoutUnit = player.board.filter((u) => u.instanceId !== unit.instanceId);

      // Autres Structures du même contrôleur portant `buffSelfOnOtherOwnStructureDestroyed`
      // (ex: Épaves Accrochées) : +Résistance permanente, plafonnée à `maxStacks`
      // (compté via les modificateurs déjà posés par CETTE carte, `source` = son propre cardId).
      const dyingIsStructure = getCardDefinition(unit.cardId).type === "structure";
      const board = dyingIsStructure
        ? boardWithoutUnit.map((other) => {
            const buff = getCardDefinition(other.cardId).buffSelfOnOtherOwnStructureDestroyed;
            if (!buff) return other;
            const stacksSoFar = other.modifiers.filter((m) => m.source === other.cardId).length;
            if (stacksSoFar >= buff.maxStacks) return other;
            return {
              ...other,
              modifiers: [
                ...other.modifiers,
                { id: `mod_${Math.random().toString(36).slice(2, 8)}`, source: other.cardId, attack: 0, health: buff.healthAmount, duration: "permanent" as const },
              ],
            };
          })
        : boardWithoutUnit;

      const scuttled = unit.pendingRemoval === "scuttled";
      const cause = destructionCauseOf(
        unit,
        computeEffectiveStats(unit, tideState, {
          controllerBoard: player.board,
          controllerReason: player.reason,
          tideOrientation: current.environment.tideOrientation,
        }).destroyedByTide
      );
      const graveyard = [
        ...player.graveyard,
        {
          ...unit,
          damageMarked: 0,
          modifiers: [],
          pendingRemoval: undefined,
          lastDamageCause: undefined,
          lastDamageTurn: undefined,
          graveyardCause: scuttled ? ("scuttled" as const) : ("destroyed" as const),
          destructionCause: cause,
        },
      ];
      // Une destruction est une ARRIVÉE au Cimetière comme une autre : sans
      // cette inscription, « une carte Un Dead a rejoint votre Cimetière ce
      // tour » (Lot 13) ne verrait que les défausses, et un Un Dead tué au
      // combat ne compterait pas — ce que son texte ne dit nulle part.
      const updatedPlayer = recordGraveyardArrival(
        {
          ...player,
          board,
          graveyard,
          reason: reasonAfterLoss(player, equipReasonLoss),
        },
        { cardId: unit.cardId, turnNumber, fromZone: "board" }
      );
      next = {
        ...next,
        players: next.players.map((p) => (p.id === player.id ? updatedPlayer : p)) as [PlayerState, PlayerState],
      };
      // Le Sabordage est un fait distinct, que des cartes et des quêtes
      // observent : il précède la destruction, comme dans `saborder.ts`.
      if (scuttled) {
        events.push({ type: "SABORDED", playerId: owner.id, instanceId: unit.instanceId, cardId: unit.cardId, turnNumber, timestamp: Date.now() });
      }
      events.push({
        type: "DESTROY",
        instanceId: unit.instanceId,
        reason: scuttled ? "effect" : "lethal",
        turnNumber,
        timestamp: Date.now(),
      });
      if (equipReasonLoss > 0) {
        events.push({ type: "REASON_CHANGED", playerId: player.id, delta: -equipReasonLoss, turnNumber, timestamp: Date.now() });
      }

      if (scuttled) {
        const sabordeTrigger = processTrigger(
          next,
          { trigger: "onSaborde", sourceInstanceId: unit.instanceId, cardId: unit.cardId, playerId: owner.id },
          turnNumber
        );
        next = sabordeTrigger.state;
        events.push(...sabordeTrigger.events);
      }

      const triggerResult = processTrigger(
        next,
        {
          trigger: "onDeath",
          sourceInstanceId: unit.instanceId,
          cardId: unit.cardId,
          playerId: owner.id,
          destructionCause: cause,
        },
        turnNumber
      );
      next = triggerResult.state;
      events.push(...triggerResult.events);

      // Sentinelle Chromatique : sa pierre lui survit, un Éclat de sa couleur
      // (règle de famille, `game/rules/chromaticShards.ts`) — sauf si son
      // contrôleur l'a SABORDÉE : un départ voulu, pour faire de la place,
      // ne doit pas la reprendre aussitôt (décision du 25/09/2026).
      if (!scuttled) {
        const eclat = leaveChromaticShard(next, unit, owner.id, turnNumber);
        next = eclat.state;
        events.push(...eclat.events);
      }
    }

    current = next;
  }

  return { state: current, events };
}
