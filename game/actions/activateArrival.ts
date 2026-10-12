import { activateReaction } from "@/game/actions/activateReaction";
import { activatableArrivals, arrivalActivationState } from "@/game/reactions/deferredArrivals";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState } from "@/game/state/types";
import type { ActionResult, ActivateArrivalAction } from "@/game/actions/types";

/**
 * Active un effet d'arrivée mis en réserve (`game/reactions/deferredArrivals.ts`).
 *
 * La résolution est EXACTEMENT celle d'une réaction (`activateReaction`) :
 * coût, cible, carte du Cimetière, révélation, déclencheurs en chaîne,
 * nouvelle fenêtre si l'effet en ouvre une. On la lui confie sur un état
 * où la capacité sort de la réserve et occupe seule une fenêtre éphémère.
 */
export function activateArrival(state: GameState, action: ActivateArrivalAction): ActionResult {
  const checks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!checks.ok) return checks;
  if (state.activePlayerId !== action.playerId) return { ok: false, error: "Ce n'est pas le tour de ce joueur." };

  const activable = activatableArrivals(state, action.playerId).find(
    ({ entry }) => entry.sourceInstanceId === action.sourceInstanceId && entry.abilityIndex === action.abilityIndex
  );
  if (!activable) return { ok: false, error: "Cet effet d'arrivée n'est plus activable." };

  return activateReaction(arrivalActivationState(state, activable.entry), {
    type: "activateReaction",
    playerId: action.playerId,
    sourceInstanceId: action.sourceInstanceId,
    abilityIndex: action.abilityIndex,
    targetInstanceId: action.targetInstanceId,
    chosenGraveyardInstanceId: action.chosenGraveyardInstanceId,
  });
}
