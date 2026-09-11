import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import type { GameState, PlayerState } from "@/game/state/types";

function shouldDie(unit: CardInstance, tideState: TideStateName): boolean {
  const stats = computeEffectiveStats(unit, tideState);
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
  const penalty = getCardDefinition(substitute.cardId).destructionSubstitute?.healthPenalty ?? 1;
  const modifiers = [
    ...unit.modifiers,
    { id: `mod_${Math.random().toString(36).slice(2, 8)}`, source: substitute.cardId, attack: 0, health: -penalty, duration: "permanent" as const },
  ];
  const newEffectiveHealth = computeEffectiveStats({ ...unit, modifiers }, state.environment.tideState).health;
  const savedUnit: CardInstance = {
    ...unit,
    modifiers,
    damageMarked: Math.max(0, Math.min(unit.damageMarked, newEffectiveHealth - 1)),
  };

  const player = state.players.find((p) => p.id === ownerId)!;
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
        if (shouldDie(unit, current.environment.tideState)) {
          lethalPairs.push({ playerId: player.id, unitInstanceId: unit.instanceId });
        }
      }
    }
    for (const { playerId, unitInstanceId } of lethalPairs) {
      const player = current.players.find((p) => p.id === playerId);
      const unit = player?.board.find((u) => u.instanceId === unitInstanceId);
      if (!player || !unit || !shouldDie(unit, current.environment.tideState)) continue;
      const substitute = findDestructionSubstitute(player.board, unit.instanceId);
      if (!substitute) continue;
      const result = applyDestructionSubstitute(current, turnNumber, player.id, unit, substitute);
      current = result.state;
      events.push(...result.events);
    }

    const tideState = current.environment.tideState;
    const deaths: Array<{ unit: CardInstance; owner: PlayerState }> = [];

    for (const player of current.players) {
      for (const unit of player.board) {
        if (shouldDie(unit, tideState)) deaths.push({ unit, owner: player });
      }
    }

    if (deaths.length === 0) break;

    let next = current;
    for (const { unit, owner } of deaths) {
      const player = next.players.find((p) => p.id === owner.id);
      if (!player) continue;
      const board = player.board.filter((u) => u.instanceId !== unit.instanceId);
      const graveyard = [
        ...player.graveyard,
        { ...unit, damageMarked: 0, modifiers: [], graveyardCause: "destroyed" as const },
      ];
      next = {
        ...next,
        players: next.players.map((p) => (p.id === player.id ? { ...p, board, graveyard } : p)) as [
          PlayerState,
          PlayerState
        ],
      };
      events.push({
        type: "DESTROY",
        instanceId: unit.instanceId,
        reason: "lethal",
        turnNumber,
        timestamp: Date.now(),
      });

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
