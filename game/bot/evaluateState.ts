import { computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance } from "@/game/cards/types";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Valeur heuristique d'une unité sur le plateau : Puissance et Résistance
 * pondérées (Résistance légèrement moins volatile compte tenu des Marées),
 * réduite de moitié si la Marée rend l'unité inactive (elle occupe quand
 * même un Slot et reprendra de la valeur plus tard).
 */
function unitValue(state: GameState, unit: CardInstance, controller: PlayerState): number {
  const stats = computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: controller.board,
    controllerReason: controller.reason,
  });
  const raw = stats.attack * 1.5 + stats.health * 1.2;
  return stats.inactive ? raw * 0.5 : raw;
}

function playerValue(state: GameState, player: PlayerState): number {
  const boardValue = player.board.reduce((sum, unit) => sum + unitValue(state, unit, player), 0);
  return player.anchor * 3 + player.reason * 0.5 + boardValue + player.hand.length * 0.75;
}

/**
 * Score une position du point de vue de `forPlayerId` : plus c'est élevé,
 * meilleure est la position pour ce joueur. Utilisé par le bot pour
 * comparer l'état résultant de chaque action candidate (`enumerateCandidateActions`
 * + `dispatch`) — jamais pour valider une action, uniquement pour la classer.
 */
export function evaluateState(state: GameState, forPlayerId: PlayerId): number {
  if (state.status === "finished") {
    if (state.winnerId === forPlayerId) return 100000;
    if (state.winnerId === undefined) return 0;
    return -100000;
  }

  const me = state.players.find((p) => p.id === forPlayerId);
  const opponent = state.players.find((p) => p.id !== forPlayerId);
  if (!me || !opponent) return 0;

  return playerValue(state, me) - playerValue(state, opponent);
}
