/**
 * URLs des illustrations de carte — et RIEN d'autre.
 *
 * À part de `nameplateArt.ts` (audit du 24/09/2026) : celui-ci importe le
 * moteur (`@/game`) pour choisir la carte signature d'un deck, donc tout
 * le catalogue de cartes (~370 Ko). L'avatar de l'en-tête n'a besoin que
 * d'une URL ; en passant par lui, il embarquait le catalogue dans CHAQUE
 * écran, connexion comprise.
 */

/** Illustration d'une carte, telle que servie par `public/assets`. */
export function cardIllustrationUrl(cardId: string): string {
  return `/assets/cards/illustrations/${cardId}.webp`;
}

/**
 * VIGNETTE de l'illustration (360 px, ≈ 26 Ko au lieu de ≈ 124 Ko) : pour
 * tout ce qui l'affiche en petit — lignes de liste, avatars, mosaïques.
 * Fabriquée par `scripts/optimizeImages.mjs`, présence vérifiée par
 * `tests/game/illustrations.test.ts`.
 */
export function cardIllustrationThumbUrl(cardId: string): string {
  return `/assets/cards/illustrations/mini/${cardId}.webp`;
}
