import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState } from "@/game/state/types";
import type { ActionResult, PassReactionAction } from "@/game/actions/types";

function validate(state: GameState, action: PassReactionAction) {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  const pending = state.pendingReaction;
  if (!pending) return { ok: false as const, error: "Aucune fenêtre de réaction n'est ouverte." };
  if (pending.awaitingPlayerId !== action.playerId) {
    return { ok: false as const, error: "Ce n'est pas à ce joueur de répondre à cette fenêtre de réaction." };
  }

  return { ok: true as const };
}

/**
 * Passe la priorité pendant une fenêtre de réaction : n'active rien.
 * Retire simplement ce joueur de la file — s'il reste quelqu'un
 * d'éligible (potentiellement le même joueur si une nouvelle capacité
 * est devenue éligible entre-temps), la fenêtre continue avec lui ;
 * sinon elle se ferme.
 */
export function passReaction(state: GameState, action: PassReactionAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const pending = state.pendingReaction!;
  const events: GameEvent[] = [
    { type: "REACTION_PASSED", turnNumber: pending.turnNumber, timestamp: Date.now(), playerId: action.playerId },
  ];

  // Retire ce joueur SANS le réévaluer immédiatement : il vient de
  // choisir de ne rien activer, ce n'est donc pas à lui de reprendre la
  // main tant que personne d'autre n'a rien changé à l'état de jeu.
  const remainingQueue = pending.priorityQueue.filter((id) => id !== action.playerId);
  const nextPending = remainingQueue.length > 0 ? { ...pending, awaitingPlayerId: remainingQueue[0]!, priorityQueue: remainingQueue.slice(1) } : undefined;

  if (nextPending) {
    events.push({
      type: "REACTION_WINDOW_OPENED",
      turnNumber: nextPending.turnNumber,
      timestamp: Date.now(),
      playerId: nextPending.awaitingPlayerId,
    });
  }

  return { ok: true, state: { ...state, pendingReaction: nextPending }, events };
}
