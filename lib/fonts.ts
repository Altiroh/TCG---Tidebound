import { Cinzel, Crimson_Pro } from "next/font/google";

/**
 * Typographie verrouillée dans Notion ("Bibliothèque visuelle — cohérence
 * verrouillée", section Typographie canonique) pour le rendu des cartes par
 * `CardTile.tsx` : Cinzel pour le nom/type/valeurs (informations courtes,
 * structurantes), Crimson Pro pour le texte de règles (lecture continue).
 * Ne jamais substituer une autre police à celles-ci.
 */
export const cardTitleFont = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-card-title",
});

export const cardBodyFont = Crimson_Pro({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-card-body",
});

/**
 * Police des libellés posés sur les plaques du coffret du menu principal
 * (`app/page.tsx`, `public/assets/menu/box/menu_box_base.png`) — gravure
 * capitale, cohérente avec le rendu du logo "TIDEBOUND" déjà peint sur
 * l'asset.
 */
export const menuFont = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  variable: "--font-menu",
});
