import type { CardArtwork } from "@/game/cosmetics/artworks";

/**
 * Illustrations PAS ENCORE SORTIES (Styled, Styled Full-Art) : floutées pour
 * un joueur, visibles en mode Dev seulement (`useDevMode`). Le flou est posé
 * sur l'image seule — Puissance et Résistance d'une Full-Art restent nettes.
 */
export const HIDDEN_ARTWORK_FILTER = "blur(18px) saturate(0.8)";

export function isArtworkHidden(artwork: CardArtwork | undefined, devMode: boolean): boolean {
  return !devMode && artwork !== undefined && artwork !== "classique";
}
