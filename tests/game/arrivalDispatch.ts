import { getCardDefinition, type GameState, type PlayerAction } from "@/game";
import { dispatch as engineDispatch } from "@/game/engine";

/**
 * `dispatch` des tests écrits AVANT les effets d'arrivée en réserve
 * (12/10/2026, `game/reactions/deferredArrivals.ts`).
 *
 *   - Jouer une carte à effet d'arrivée facultatif (`arrivalEffect`) l'ACTIVE
 *     aussitôt (`activateArrival`), avec la cible et la carte du Cimetière que
 *     la pose désignait déjà — ce que fait le joueur qui clique sa carte
 *     lumineuse puis « Activer ». Le comportement de la carte ne change pas.
 *   - Un `activateReaction` qui visait l'arrivée d'une carte (ancienne
 *     fenêtre) est rejoué en `activateArrival` ; un `passReaction` sans
 *     fenêtre ouverte ne fait rien, comme laisser la carte luire.
 *
 * Les tests de la réserve elle-même (`arrivalRule.test.ts`) n'utilisent pas
 * cette aide : ils vérifient la lueur, l'activation et l'expiration.
 */
export function dispatch(state: GameState, action: PlayerAction): ReturnType<typeof engineDispatch> {
  if (action.type === "activateReaction" && !state.pendingReaction && deferred(state, action.sourceInstanceId, action.abilityIndex)) {
    return engineDispatch(state, { ...action, type: "activateArrival" });
  }
  if (action.type === "passReaction" && !state.pendingReaction) return { ok: true, state, events: [] };

  let result = engineDispatch(state, action);
  if (!result.ok || action.type !== "playCard") return result;
  for (let guard = 0; guard < 4; guard += 1) {
    // Une fenêtre (un piège adverse qui répond à l'arrivée) ou un choix passe d'abord :
    // c'est au test d'y répondre, l'effet en réserve attendra.
    if (result.state.pendingReaction || result.state.pendingChoice) return result;
    const entry = (result.state.deferredArrivals ?? []).find(
      (e) => e.sourceInstanceId === action.instanceId && getCardDefinition(e.cardId).abilities?.[e.abilityIndex]?.arrivalEffect
    );
    if (!entry) return result;
    const next = engineDispatch(result.state, {
      type: "activateArrival",
      playerId: action.playerId,
      sourceInstanceId: entry.sourceInstanceId,
      abilityIndex: entry.abilityIndex,
      ...(action.targetInstanceId ? { targetInstanceId: action.targetInstanceId } : {}),
      ...(action.chosenGraveyardInstanceId ? { chosenGraveyardInstanceId: action.chosenGraveyardInstanceId } : {}),
    });
    if (!next.ok) return result;
    result = { ...next, events: [...result.events, ...next.events] };
  }
  return result;
}

function deferred(state: GameState, sourceInstanceId: string, abilityIndex: number): boolean {
  return (state.deferredArrivals ?? []).some((e) => e.sourceInstanceId === sourceInstanceId && e.abilityIndex === abilityIndex);
}

/**
 * À qui le jeu propose-t-il quelque chose ? La fenêtre de réaction ouverte,
 * ou à défaut le joueur qui a un effet d'arrivée en réserve — ce que les
 * anciens tests lisaient dans `pendingReaction.awaitingPlayerId`.
 */
export function offeredTo(state: GameState): string | undefined {
  return state.pendingReaction?.awaitingPlayerId ?? state.deferredArrivals?.[state.deferredArrivals.length - 1]?.controllerId;
}
