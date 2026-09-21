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
  // 900 pour les titres les plus lourds (`menuFont`, même famille) : une seule
  // déclaration Cinzel, sans quoi les graisses 600/700 étaient téléchargées
  // deux fois sous deux noms de police différents.
  weight: ["600", "700", "900"],
  variable: "--font-card-title",
});

export const cardBodyFont = Crimson_Pro({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-card-body",
});

/**
 * Police du MENU PRINCIPAL. Elle servait aux libellés gravés sur les
 * plaques du coffret, retiré avec lui (21/09/2026) : la table du
 * navigateur porte ses libellés peints dans ses propres illustrations.
 *
 * L'alias reste : c'est la MÊME police que `cardTitleFont`, et seule la
 * variable CSS `--font-menu` est posée à part (cf. `app/layout.tsx`),
 * pour qu'on puisse un jour l'en distinguer sans toucher aux écrans.
 */
export const menuFont = cardTitleFont;

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
