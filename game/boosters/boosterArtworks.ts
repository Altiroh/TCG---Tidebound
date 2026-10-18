import { artworksOf, type RareCardArtwork } from "@/game/cosmetics/artworks";

/**
 * Illustrations ALTERNATIVES qu'un booster propose pour une carte de son
 * pool (Collection visuelle V2, 18/10/2026).
 *
 * Règle de départ, décidée le 18/10 : les illustrations font partie des
 * pools — une carte tirée dans un booster peut y sortir dans chacune de ses
 * illustrations (Styled, Styled Full-Art). Notion prévoit qu'un booster
 * puisse les consigner une à une (booster événementiel, Cartoon…) : le
 * jour où l'un d'eux en écarte ou en réserve, c'est ici qu'il le déclare,
 * sans toucher au tirage.
 */
const ILLUSTRATIONS_ECARTEES: Record<string, Record<string, readonly RareCardArtwork[]>> = {};

export function boosterArtworksFor(boosterId: string, cardId: string): RareCardArtwork[] {
  const ecartees = ILLUSTRATIONS_ECARTEES[boosterId]?.[cardId] ?? [];
  return artworksOf(cardId).filter((artwork): artwork is RareCardArtwork => artwork !== "classique" && !ecartees.includes(artwork));
}
