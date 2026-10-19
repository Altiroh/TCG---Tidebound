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
