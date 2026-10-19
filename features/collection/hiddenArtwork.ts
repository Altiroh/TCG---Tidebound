import type { CardArtwork } from "@/game/cosmetics/artworks";

/**
 * Illustrations PAS ENCORE SORTIES (Styled, Styled Full-Art) : floutées pour
 * un joueur qui ne les a pas obtenues, nettes en mode Dev (`useDevMode`) ou
 * dès qu'il en possède un exemplaire. Le flou reste DANS la carte (posé sous
 * la découpe qui la clippe) et les stats disparaissent avec l'image.
 */
export const HIDDEN_ARTWORK_FILTER = "blur(10px) saturate(0.85)";

export function isArtworkHidden(artwork: CardArtwork | undefined, devMode: boolean, owned = false): boolean {
  return !devMode && !owned && artwork !== undefined && artwork !== "classique";
}
