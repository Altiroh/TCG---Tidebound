/**
 * SILHOUETTE d'une unité du plateau, pour les effets qui la recouvrent ou
 * l'entourent (voile de soin, voile de maladie, poussière d'un choc).
 *
 * Une carte est un rectangle aux coins arrondis ; un JETON (Péon, Éclat
 * Chromatique…) a un cadre OVALE, transparent autour (`cards/frames/
 * token.webp`). Un effet qui dessinait le rectangle laissait voir, autour du
 * jeton, le contour d'une carte qui n'existe pas (12/10/2026). Le plateau
 * marque les jetons (`data-token`, `TableBoard`) ; les effets lisent ici
 * quelle forme épouser.
 */
export type Silhouette = "card" | "oval";

export function silhouetteOf(el: Element | null | undefined): Silhouette {
  return el instanceof HTMLElement && el.dataset.token !== undefined ? "oval" : "card";
}
