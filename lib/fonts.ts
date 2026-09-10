import { Baloo_2, Cinzel } from "next/font/google";

/**
 * Police des chiffres superposés sur les cartes (Puissance/Résistance en
 * overlay live, cf. `features/match/CardTile.tsx`) — ronde et massive,
 * pour se fondre avec les chiffres déjà gravés sur les exports de carte
 * (coût, etc.).
 */
export const cardStatFont = Baloo_2({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-card-stat",
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
