import type { GameEvent } from "@/game/events/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { oncePerGameAvailable, withOncePerGameUse } from "@/game/state/oncePerGame";
import { STATUS_NO_REASON_GAIN, type GameState, type PlayerState } from "@/game/state/types";

/**
 * ÉPUISEMENT DE LA RAISON — la Raison perdue pendant le tour, et ce qu'en
 * fait un Navire qui la rend (`ShipDefinition.refundTurnReasonOnFirstDepletion`,
 * L'Errant — Cap sûr, 29/09/2026) :
 *
 *   « La première fois de la partie que votre Raison tombe à 0 ou moins,
 *     récupérez la Raison perdue pendant ce tour. »
 *
 * Constaté par `dispatch` APRÈS chaque action, par différence avec l'état
 * d'avant : la Raison se dépense et se perd par une vingtaine de chemins
 * (coûts, drains, Marée, Bris), et les suivre un par un en oublierait. Une
 * action qui fait perdre puis regagner compte pour son solde — « perdue »
 * veut dire ce qui manque, pas chaque mouvement.
 */

const DEPLETION_KEY = "raison:epuisement";

function lostSoFar(player: PlayerState, turnNumber: number): number {
  return player.reasonLostThisTurn?.turnNumber === turnNumber ? player.reasonLostThisTurn.amount : 0;
}

function refundsOnDepletion(player: PlayerState): boolean {
  try {
    return getShipDefinition(player.shipId).refundTurnReasonOnFirstDepletion === true;
  } catch {
    return false;
  }
}

export function applyReasonDepletion(before: GameState, after: GameState): { state: GameState; events: GameEvent[] } {
  const turnNumber = after.turnNumber;
  const events: GameEvent[] = [];

  const players = after.players.map((player) => {
    const previous = before.players.find((p) => p.id === player.id);
    if (!previous) return player;

    // Un relevé d'un tour précédent vaut zéro (`lostSoFar`) : inutile de
    // réécrire le joueur tant qu'il ne perd rien.
    const loss = Math.max(0, previous.reason - player.reason);
    const amount = lostSoFar(player, turnNumber) + loss;
    let next: PlayerState = loss > 0 ? { ...player, reasonLostThisTurn: { turnNumber, amount } } : player;

    const depleted = previous.reason > 0 && player.reason <= 0;
    if (depleted && amount > 0 && refundsOnDepletion(player) && oncePerGameAvailable(player, DEPLETION_KEY)) {
      // « Vous ne pouvez pas récupérer de Raison » (La Gueule Sous la Mer) :
      // la première fois a bien eu lieu, mais elle ne rend rien.
      if (player.statusFlags.includes(STATUS_NO_REASON_GAIN)) return withOncePerGameUse(next, DEPLETION_KEY);
      const reason = Math.min(next.reasonMax, next.reason + amount);
      events.push({ type: "REASON_CHANGED", turnNumber, timestamp: Date.now(), playerId: player.id, delta: reason - next.reason });
      next = withOncePerGameUse({ ...next, reason }, DEPLETION_KEY);
    }
    return next;
  }) as [PlayerState, PlayerState];

  return { state: { ...after, players }, events };
}
