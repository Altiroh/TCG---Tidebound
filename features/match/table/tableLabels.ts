import type { GamePhase } from "@/game";

/** Icônes du bouton de phase — les mêmes que `PhaseActionButton`. */
const ICONS = {
  wait: "/assets/board/phase-buttons/icon-wait.webp",
  combat: "/assets/board/phase-buttons/icon-combat.webp",
  endTurn: "/assets/board/phase-buttons/icon-end-turn.webp",
} as const;

/**
 * Libellé, icône et action du bouton de phase du nouveau plateau — même règle
 * que `PhaseActionButton` : pas mon tour → attente ; Phase principale → passer
 * au combat ; Phase de combat → fin de tour. (Les conteneurs passent déjà
 * `combatPhase` quand aucune unité ne peut attaquer, pour sauter le combat.)
 */
export function phaseButtonFor({ isMyTurn, phase }: { isMyTurn: boolean; phase: GamePhase }) {
  if (!isMyTurn) return { label: "En attente…", icon: ICONS.wait, action: null };
  if (phase === "combatPhase") return { label: "Fin de tour", icon: ICONS.endTurn, action: "endTurn" as const };
  return { label: "Combat", icon: ICONS.combat, action: "advance" as const };
}

/** Consigne affichée sous la piste de Marée pendant un choix de cible au clic. */
export function targetingHint(kind: "playCard" | "break" | "attack" | null): string | null {
  if (kind === "playCard") return "Choisissez une cible sur le plateau.";
  if (kind === "break") return "Choisissez une cible pour l'effet de bris.";
  if (kind === "attack") return "Choisissez une cible adverse, ou le Navire adverse.";
  return null;
}
