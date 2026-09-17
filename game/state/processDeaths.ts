import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import { reasonAfterLoss } from "@/game/state/reason";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import type { GameState, PlayerState } from "@/game/state/types";

function shouldDie(
  unit: CardInstance,
  tideState: TideStateName,
  controller: PlayerState,
  tideOrientation: "montante" | "descendante"
): boolean {
  const stats = computeEffectiveStats(unit, tideState, {
    controllerBoard: controller.board,
    controllerReason: controller.reason,
    tideOrientation,
  });
  // Un départ déjà décidé (effet `destroy`/`saborde`, action Saborder,
  // Ancre de Dérive) ne dépend d'aucune arithmétique de Résistance : une
  // Anomalie sans Résistance doit pouvoir partir comme une Créature.
  if (unit.pendingRemoval) return true;
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
  if (!survival || !survival.tideStateIn.includes(state.environment.tideState)) return undefined;
  if (!oncePerTurnAvailable(unit, SURVIVES_LETHAL_KEY, turnNumber)) return undefined;
  const stats = computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: owner.board,
    controllerReason: owner.reason,
    tideOrientation: state.environment.tideOrientation,
  });
  if (stats.destroyedByTide || stats.health < 1) return undefined;
  const saved = markOncePerTurnUsed({ ...unit, damageMarked: stats.health - 1, pendingRemoval: undefined }, SURVIVES_LETHAL_KEY, turnNumber);
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
          ? {
              ...p,
              board: current.board.filter((u) => !orphanIds.has(u.instanceId)),
              graveyard: [
                ...current.graveyard,
                ...orphans.map((u) => ({ ...u, damageMarked: 0, modifiers: [], attachedToInstanceId: undefined, graveyardCause: "destroyed" as const })),
              ],
            }
          : p
      ) as [PlayerState, PlayerState],
    };

    for (const orphan of orphans) {
      events.push({ type: "DESTROY", instanceId: orphan.instanceId, reason: "effect", turnNumber, timestamp: Date.now() });
      const triggerResult = processTrigger(
        next,
        { trigger: "onDeath", sourceInstanceId: orphan.instanceId, cardId: orphan.cardId, playerId: player.id },
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
        if (shouldDie(unit, current.environment.tideState, player, current.environment.tideOrientation)) {
          lethalPairs.push({ playerId: player.id, unitInstanceId: unit.instanceId });
        }
      }
    }
    for (const { playerId, unitInstanceId } of lethalPairs) {
      const player = current.players.find((p) => p.id === playerId);
      const unit = player?.board.find((u) => u.instanceId === unitInstanceId);
      if (!player || !unit || !shouldDie(unit, current.environment.tideState, player, current.environment.tideOrientation)) continue;
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
        if (shouldDie(unit, tideState, player, current.environment.tideOrientation)) deaths.push({ unit, owner: player });
      }
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
      const graveyard = [
        ...player.graveyard,
        {
          ...unit,
          damageMarked: 0,
          modifiers: [],
          pendingRemoval: undefined,
          graveyardCause: scuttled ? ("scuttled" as const) : ("destroyed" as const),
        },
      ];
      const updatedPlayer = {
        ...player,
        board,
        graveyard,
        reason: reasonAfterLoss(player, equipReasonLoss),
      };
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
        },
        turnNumber
      );
      next = triggerResult.state;
      events.push(...triggerResult.events);
    }

    current = next;
  }

  return { state: current, events };
}
