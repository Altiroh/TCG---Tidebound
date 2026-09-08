import { Baloo_2 } from "next/font/google";

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
