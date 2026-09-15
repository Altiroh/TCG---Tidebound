import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertIsActivePlayer, assertPlayerInGame, combine, fail } from "@/game/rules/validation";
import type { GamePhase, GameState } from "@/game/state/types";
import type { ActionResult, AdvancePhaseAction } from "@/game/actions/types";

/**
 * Enchaînement des phases d'un tour : Phase principale → Phase de combat →
 * Phase principale 2. Il n'y a rien après la Phase principale 2 :
 * `endTurn` seul en sort.
 */
const NEXT_PHASE: Partial<Record<GamePhase, "combatPhase" | "mainPhase2">> = {
  mainPhase: "combatPhase",
  combatPhase: "mainPhase2",
};

function validate(state: GameState, action: AdvancePhaseAction) {
  const checks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
  if (!checks.ok) return checks;
  if (!NEXT_PHASE[state.phase]) return fail("Il n'y a plus de phase après la Phase principale 2 : terminez le tour.");
  return checks;
}

/**
 * Fait passer le joueur actif à la phase suivante de son tour (cf.
 * `NEXT_PHASE`). Ne touche à rien d'autre que `phase` — ne consomme pas
 * l'action principale du tour, ne rafraîchit rien : c'est `endTurn` qui
 * reste le seul point où les unités se dégèlent et où l'action principale
 * se réinitialise pour le tour suivant.
 *
 * La Phase principale 2 (après le combat) existe pour la même raison que
 * dans les jeux dont Tidebound s'inspire : on garde de quoi réagir à ce
 * que le combat a révélé — reposer un corps sur un plateau dégarni,
 * Saborder ce qui vient d'être exposé, Briser un Objet devenu utile.
 */
export function advancePhase(state: GameState, action: AdvancePhaseAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const phase = NEXT_PHASE[state.phase]!;
  const events: GameEvent[] = [
    { type: "PHASE_CHANGED", turnNumber: state.turnNumber, timestamp: Date.now(), playerId: action.playerId, phase },
  ];

  return { ok: true, state: { ...state, phase }, events };
}
