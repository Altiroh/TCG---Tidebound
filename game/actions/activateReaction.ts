import { candidateKey, eligibleCandidatesFor, recomputePendingReaction } from "@/game/reactions/reactionWindow";
import { resolveReaction } from "@/game/triggers/triggerBus";
import type { PendingReactionCandidate } from "@/game/triggers/types";
import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState } from "@/game/state/types";
import type { ActionResult, ActivateReactionAction } from "@/game/actions/types";

function validate(
  state: GameState,
  action: ActivateReactionAction
): { ok: true; candidate: PendingReactionCandidate } | { ok: false; error: string } {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  const pending = state.pendingReaction;
  if (!pending) return { ok: false, error: "Aucune fenêtre de réaction n'est ouverte." };
  if (pending.awaitingPlayerId !== action.playerId) {
    return { ok: false, error: "Ce n'est pas à ce joueur de répondre à cette fenêtre de réaction." };
  }

  // Réévalué à l'instant T (coût, cible disponible) et privé de ce qui a
  // déjà été activé pendant cette même fenêtre — jamais une liste mise en
  // cache.
  const candidates = eligibleCandidatesFor(state, pending.events, action.playerId, pending.turnNumber, pending.usedCandidateKeys);
  const candidate = candidates.find(
    (c) => c.sourceInstanceId === action.sourceInstanceId && c.abilityIndex === action.abilityIndex
  );
  if (!candidate) return { ok: false, error: "Cette capacité n'est plus éligible." };
  if (candidate.needsTarget && !action.targetInstanceId) {
    return { ok: false, error: "Cette réaction nécessite une cible." };
  }

  return { ok: true, candidate };
}

/**
 * Active une capacité facultative éligible pendant une fenêtre de
 * réaction : paie son coût, résout ses effets, puis reconstruit la
 * fenêtre — soit elle continue (l'activation vient elle-même de rendre
 * une nouvelle réaction éligible, cadrage : "une réaction activée peut
 * déclencher de nouvelles réactions"), soit elle se ferme si plus
 * personne n'a rien à offrir. La capacité activée ne peut pas l'être une
 * seconde fois pendant cette même fenêtre (`usedCandidateKeys`).
 */
export function activateReaction(state: GameState, action: ActivateReactionAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const pending = state.pendingReaction!;
  const resolution = resolveReaction(state, validation.candidate, action.targetInstanceId, pending.turnNumber);
  const events: GameEvent[] = [...resolution.events];

  const usedCandidateKeys = [...pending.usedCandidateKeys, candidateKey(action.sourceInstanceId, action.abilityIndex)];
  const nextPending = recomputePendingReaction(resolution.state, { ...pending, usedCandidateKeys });
  if (nextPending) {
    events.push({
      type: "REACTION_WINDOW_OPENED",
      turnNumber: nextPending.turnNumber,
      timestamp: Date.now(),
      playerId: nextPending.awaitingPlayerId,
    });
  }

  return { ok: true, state: { ...resolution.state, pendingReaction: nextPending }, events };
}
