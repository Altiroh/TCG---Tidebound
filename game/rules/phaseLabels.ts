import type { GamePhase } from "@/game/state/types";

/**
 * Nom de chaque phase, tel qu'on le DIT dans une phrase (« pendant la Phase
 * de combat »). Exporté : l'infobulle du bouton de phase montre la même
 * chose que les messages de refus, et deux listes finiraient par diverger.
 *
 * Vit dans son propre module plutôt que dans `validation.ts` : les
 * capacités de Navire (`game/state/shipAbility.ts`) refusent avec les mêmes
 * mots, et `validation.ts` lit lui-même l'état des capacités de Navire —
 * les garder ensemble ferait tourner les deux fichiers en rond.
 */
export const PHASE_LABELS: Record<GamePhase, string> = {
  waitingForPlayers: "l'attente des joueurs",
  mainPhase: "la Phase principale",
  combatPhase: "la Phase de combat",
  mainPhase2: "la Phase principale 2",
  finished: "la fin de partie",
};

/**
 * « Possible seulement pendant une Phase principale ou la Phase de combat. »
 * Les deux Phases principales se disent « une Phase principale » plutôt que
 * de s'énumérer : le joueur n'a pas à savoir qu'il y en a deux pour
 * comprendre qu'il doit sortir du combat.
 */
export function phaseRefusal(phases: readonly GamePhase[]): string {
  const bothMains = phases.includes("mainPhase") && phases.includes("mainPhase2");
  const listed = bothMains
    ? [
        "une Phase principale",
        ...phases.filter((p) => p !== "mainPhase" && p !== "mainPhase2").map((p) => PHASE_LABELS[p]),
      ]
    : phases.map((p) => PHASE_LABELS[p]);
  return `Possible seulement pendant ${listed.join(" ou ")}.`;
}
