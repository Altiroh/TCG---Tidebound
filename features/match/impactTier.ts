/**
 * INTENSITÉ D'UN COUP selon ses dégâts (retour du 19/10/2026), pour un coup
 * physique comme pour un projectile d'effet :
 *   - 1 à 3 : `light`, l'animation classique ;
 *   - 4 et 5 : `heavy`, tremblement plus marqué, projectile et choc plus gros ;
 *   - 6 et plus : `massive`, gros tremblement et explosion à l'impact.
 * Un coup à 0 reste `light`.
 */
export type ImpactTier = "light" | "heavy" | "massive";

export function impactTier(amount: number): ImpactTier {
  if (amount >= 6) return "massive";
  if (amount >= 4) return "heavy";
  return "light";
}

/** Facteur d'ampleur d'un palier : tremblement, éclair et projectile s'y règlent. */
export const IMPACT_SCALE: Record<ImpactTier, number> = { light: 1, heavy: 1.7, massive: 2.6 };

/**
 * PRISE D'ÉLAN d'un coup physique selon son palier (retour du 19/10/2026) :
 * plus le coup est fort, plus l'attaquant recule loin et longtemps, en
 * tremblant de la force qu'il accumule, avant de frapper. Un coup léger
 * garde l'élan classique.
 */
export const CHARGE_MS: Record<ImpactTier, number> = { light: 0, heavy: 260, massive: 560 };

/** Durée du tremblement de l'ÉCRAN au choc, par palier. */
const SCREEN_QUAKE_MS: Record<ImpactTier, number> = { light: 220, heavy: 420, massive: 680 };
/** Amplitude (px) du tremblement de l'écran : à peine perceptible pour un coup léger, violent pour un coup massif. */
const SCREEN_QUAKE_PX: Record<ImpactTier, number> = { light: 1.5, heavy: 5, massive: 11 };

/**
 * TOUT L'ÉCRAN DE JEU tremble au choc (`[data-game-viewport]`, comme l'arrivée
 * d'une Abyssale), d'autant plus fort et longtemps que le coup est puissant.
 * Ajouté (`composite: "add"`) : il se cumule à un autre tremblement en cours.
 */
export function screenQuake(tier: ImpactTier) {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const viewport = document.querySelector<HTMLElement>("[data-game-viewport]");
  if (!viewport?.animate) return;
  const a = SCREEN_QUAKE_PX[tier];
  const deg = tier === "massive" ? 0.35 : tier === "heavy" ? 0.15 : 0;
  const at = (x: number, y: number, r: number) => `translate(${x * a}px, ${y * a}px) rotate(${r * deg}deg)`;
  viewport.animate(
    [
      { transform: "translate(0, 0) rotate(0deg)" },
      { transform: at(-1, 0.6, -1), offset: 0.08 },
      { transform: at(0.9, -0.8, 1), offset: 0.18 },
      { transform: at(-0.7, 0.5, -0.6), offset: 0.3 },
      { transform: at(0.55, -0.45, 0.4), offset: 0.43 },
      { transform: at(-0.35, 0.3, -0.2), offset: 0.58 },
      { transform: at(0.2, -0.15, 0), offset: 0.75 },
      { transform: "translate(0, 0) rotate(0deg)" },
    ],
    { duration: SCREEN_QUAKE_MS[tier], easing: "linear", composite: "add" }
  );
}
