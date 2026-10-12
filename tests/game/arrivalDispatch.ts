import { eligibleCandidatesFor, getCardDefinition, type GameState, type PlayerAction } from "@/game";
import { dispatch as engineDispatch } from "@/game/engine";

/**
 * `dispatch` des tests écrits AVANT la règle des effets d'arrivée
 * facultatifs (12/10/2026, `game/cards/arrivalRule.ts`) : jouer la carte
 * PUIS accepter son effet d'arrivée dans la fenêtre — ce que fait un joueur
 * qui clique « Appliquer » — avec la cible et la carte du Cimetière que
 * l'action désignait déjà. Le comportement de la carte reste ce qu'il
 * était ; seul le chemin passe désormais par la fenêtre.
 *
 * Les tests de la règle elle-même (`arrivalRule.test.ts`) n'utilisent pas
 * cette aide : ils vérifient la fenêtre, le refus et ce qui reste imposé.
 */
export function dispatch(state: GameState, action: PlayerAction): ReturnType<typeof engineDispatch> {
  let result = engineDispatch(state, action);
  if (!result.ok || action.type !== "playCard") return result;
  for (let guard = 0; guard < 4; guard += 1) {
    const pending = result.state.pendingReaction;
    if (!pending || pending.awaitingPlayerId !== action.playerId) return result;
    const candidate = eligibleCandidatesFor(result.state, pending.events, action.playerId, pending.turnNumber, pending.usedCandidateKeys).find((c) => {
      const ability = getCardDefinition(c.cardId).abilities?.[c.abilityIndex];
      return c.sourceInstanceId === action.instanceId && ability?.arrivalEffect;
    });
    if (!candidate) return result;
    const next = engineDispatch(result.state, {
      type: "activateReaction",
      playerId: action.playerId,
      sourceInstanceId: candidate.sourceInstanceId,
      abilityIndex: candidate.abilityIndex,
      ...(action.targetInstanceId ? { targetInstanceId: action.targetInstanceId } : {}),
      ...(action.chosenGraveyardInstanceId ? { chosenGraveyardInstanceId: action.chosenGraveyardInstanceId } : {}),
    });
    if (!next.ok) return result;
    result = { ...next, events: [...result.events, ...next.events] };
  }
  return result;
}
