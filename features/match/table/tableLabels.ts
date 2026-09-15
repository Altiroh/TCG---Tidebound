import type { GamePhase } from "@/game";
import { PHASE_LABELS } from "@/game/rules/validation";

/** Icônes du bouton de phase — les mêmes que `PhaseActionButton`. */
const ICONS = {
  wait: "/assets/board/phase-buttons/icon-wait.webp",
  combat: "/assets/board/phase-buttons/icon-combat.webp",
  endTurn: "/assets/board/phase-buttons/icon-end-turn.webp",
} as const;

/**
 * Libellé, icône et action du bouton de phase du nouveau plateau — même règle
 * que `PhaseActionButton` : pas mon tour → attente ; Phase principale →
 * passer au combat ; Phase de combat → Phase principale 2 ; Phase
 * principale 2 → fin de tour. (Les conteneurs passent déjà `mainPhase2`
 * quand aucune unité ne peut attaquer, pour sauter le combat.)
 *
 * Faute d'icône dédiée, la Phase principale 2 réutilise celle du combat :
 * le bouton dit « avancer », son libellé précise vers quoi.
 */
export function phaseButtonFor({ isMyTurn, phase }: { isMyTurn: boolean; phase: GamePhase }) {
  if (!isMyTurn) return { label: "En attente…", icon: ICONS.wait, action: null };
  if (phase === "mainPhase2") return { label: "Fin de tour", icon: ICONS.endTurn, action: "endTurn" as const };
  if (phase === "combatPhase") return { label: "Phase principale 2", icon: ICONS.combat, action: "advance" as const };
  return { label: "Combat", icon: ICONS.combat, action: "advance" as const };
}

/** Consigne affichée sous la piste de Marée pendant un choix de cible au clic. */
export function targetingHint(kind: "playCard" | "break" | "attack" | null): string | null {
  if (kind === "playCard") return "Choisissez une cible sur le plateau.";
  if (kind === "break") return "Choisissez une cible pour l'effet de bris.";
  if (kind === "attack") return "Choisissez une cible adverse, ou le Navire adverse.";
  return null;
}

/**
 * Nom de la phase EN COURS, en majuscule initiale, pour l'infobulle du
 * bouton de phase.
 *
 * Dérivé de `PHASE_LABELS`, qui sert déjà aux messages de refus du moteur
 * (« Cette action n'est possible que pendant la Phase de combat ») : deux
 * listes de noms finiraient par se contredire, et le joueur lirait un nom
 * dans l'infobulle et un autre dans le message d'erreur.
 */
export function phaseTitle(phase: GamePhase): string {
  // `PHASE_LABELS` est écrit pour s'insérer dans une phrase (« pendant la
  // Phase de combat ») : on retire l'article pour un titre.
  const label = PHASE_LABELS[phase].replace(/^(la |l'|le )/, "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
