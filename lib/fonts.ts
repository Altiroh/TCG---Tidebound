import { Barlow, Cinzel, Crimson_Pro } from "next/font/google";

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
 * (`app/page.tsx`, `public/assets/menu/box/menu_box_base.webp`) — gravure
 * capitale, cohérente avec le rendu du logo "TIDEBOUND" déjà peint sur
 * l'asset.
 */
export const menuFont = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  variable: "--font-menu",
});

/**
 * Police fonctionnelle de l'interface (recherche, filtres, tri, boutons
 * utilitaires). Cinzel/Crimson Pro restent réservées à ce qui porte
 * l'identité Tidebound — titres, noms de sections, rendu des cartes ;
 * au-delà, une serif décorative sur chaque petit contrôle donnait à l'UI
 * un air de jeu Flash décoré. Barlow est neutre, un peu technique
 * (instrument de bord) et lisible à 12-13px, sans tomber dans le
 * "Inter/dashboard".
 */
export const uiFont = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
});
