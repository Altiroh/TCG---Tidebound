import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertInPhase, assertIsActivePlayer, assertPlayerInGame, combine } from "@/game/rules/validation";
import type { GameState } from "@/game/state/types";
import type { ActionResult, AdvancePhaseAction } from "@/game/actions/types";

function validate(state: GameState, action: AdvancePhaseAction) {
  return combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase")
  );
}

/**
 * Fait passer le joueur actif de la Phase principale à la Phase de combat.
 * Ne touche à rien d'autre que `phase` — ne consomme pas l'action
 * principale du tour, ne rafraîchit rien : c'est `endTurn` qui reste le
 * seul point où les unités se dégèlent et où l'action principale se
 * réinitialise pour le tour suivant.
 */
export function advancePhase(state: GameState, action: AdvancePhaseAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const events: GameEvent[] = [
    { type: "PHASE_CHANGED", turnNumber: state.turnNumber, timestamp: Date.now(), playerId: action.playerId, phase: "combatPhase" },
  ];

  return { ok: true, state: { ...state, phase: "combatPhase" }, events };
}
