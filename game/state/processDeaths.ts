import { computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import type { GameState, PlayerState } from "@/game/state/types";

function shouldDie(unit: CardInstance, tideState: TideStateName): boolean {
  const stats = computeEffectiveStats(unit, tideState);
  return unit.damageMarked >= stats.health || stats.destroyedByTide;
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
