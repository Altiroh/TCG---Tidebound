import type { GameState } from "@/game";

/**
 * FENÊTRES DÉJÀ TRANCHÉES — l'état RETENU pendant une mise en scène (dé qui
 * roule, attaque, sort en vol : `useAttackPresentation`) est celui d'AVANT le
 * coup. Il porte donc encore la question à laquelle le joueur vient de
 * répondre : sans ce tri, la fenêtre de réaction ou de choix se rouvrait sous
 * le dé et restait jusqu'à la fin de l'animation (retour du 12/10/2026).
 *
 * Une décision que l'état RÉEL ne porte plus (même objet) est retirée de
 * l'état affiché ; celle qui attend toujours reste. Une NOUVELLE question de
 * l'état réel n'est pas avancée : elle s'ouvre quand la retenue se lève.
 *
 * Affichage seulement — rien ne décide sur cet état.
 */
export function withoutSettledPrompts(held: GameState, live: GameState): GameState {
  const reactionSettled = held.pendingReaction !== undefined && held.pendingReaction !== live.pendingReaction;
  const choiceSettled = held.pendingChoice !== undefined && held.pendingChoice !== live.pendingChoice;
  if (!reactionSettled && !choiceSettled) return held;
  return {
    ...held,
    ...(reactionSettled ? { pendingReaction: undefined } : {}),
    ...(choiceSettled ? { pendingChoice: undefined, pendingChoiceQueue: undefined } : {}),
  };
}
