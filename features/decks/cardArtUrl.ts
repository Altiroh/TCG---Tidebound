import type { CardArtwork } from "@/game/cosmetics/artworks";

/**
 * URLs des illustrations de carte — et RIEN d'autre.
 *
 * À part de `nameplateArt.ts` (audit du 24/09/2026) : celui-ci importe le
 * moteur (`@/game`) pour choisir la carte signature d'un deck, donc tout
 * le catalogue de cartes (~370 Ko). L'avatar de l'en-tête n'a besoin que
 * d'une URL ; en passant par lui, il embarquait le catalogue dans CHAQUE
 * écran, connexion comprise.
 */

/**
 * Fichier d'illustration à MONTRER SEULE. Une Abyssale n'a que son décor
 * dans `<id>.webp` (le sujet vit dans le débord, empilé par la face de
 * carte) : seule, on sert sa vignette composée décor + sujet
 * (`<id>-vignette.webp`, fabriquée par `scripts/optimizeImages.mjs`).
 */
function illustrationFile(cardId: string): string {
  return cardId.endsWith("-abyssal") ? `${cardId}-vignette` : cardId;
}

/** Illustration d'une carte, telle que servie par `public/assets` — pour l'afficher seule. */
export function cardIllustrationUrl(cardId: string): string {
  return `/assets/cards/illustrations/${illustrationFile(cardId)}.webp`;
}

/**
 * Fichier d'une ILLUSTRATION précise (Collection visuelle V2,
 * `game/cosmetics/artworks.ts`) : la Classique reste à la racine, une Styled
 * ou une Full-Art vit dans le dossier qui porte son nom.
 */
export function cardArtworkUrl(cardId: string, artwork: CardArtwork = "classique"): string {
  return artwork === "classique" ? cardIllustrationUrl(cardId) : `/assets/cards/illustrations/${artwork}/${cardId}.webp`;
}

/** Vignette de cette illustration (`illustrations/mini/<illustration>/`). */
export function cardArtworkThumbUrl(cardId: string, artwork: CardArtwork = "classique"): string {
  return artwork === "classique" ? cardIllustrationThumbUrl(cardId) : `/assets/cards/illustrations/mini/${artwork}/${cardId}.webp`;
}

/** Le DÉCOR seul d'une Abyssale (pour qui empile lui-même le débord par-dessus). */
export function cardDecorUrl(cardId: string): string {
  return `/assets/cards/illustrations/${cardId}.webp`;
}

/**
 * VIGNETTE de l'illustration (360 px, ≈ 26 Ko au lieu de ≈ 124 Ko) : pour
 * tout ce qui l'affiche en petit — lignes de liste, avatars, mosaïques.
 * Fabriquée par `scripts/optimizeImages.mjs`, présence vérifiée par
 * `tests/game/illustrations.test.ts`.
 */
export function cardIllustrationThumbUrl(cardId: string): string {
  return `/assets/cards/illustrations/mini/${illustrationFile(cardId)}.webp`;
}
