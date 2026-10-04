import { Cinzel, Crimson_Pro, Lora, Spectral } from "next/font/google";

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

/**
 * Titre du NOUVEAU CADRE (test, 04/10/2026) : Lora Bold Italic, choisie
 * d'après la maquette — distincte du Cinzel des cartes actuelles, qui reste
 * la police verrouillée du rendu officiel. Chargée en `swap` : seule la face
 * du nouveau cadre l'emploie.
 */
export const cardNewTitleFont = Lora({
  subsets: ["latin"],
  weight: "700",
  style: "italic",
  display: "swap",
  variable: "--font-card-new-title",
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
 * Police de l'INTERFACE — Spectral (décision du 26/09/2026 : harmonisation
 * typographique de tout le jeu sur l'Éditeur de deck « sur le livre »).
 *
 * Tidebound est un carnet de bord maritime : toute l'interface est en
 * SERIF. Cinzel porte l'identité (titres, noms, sections, navigation) ;
 * Spectral porte tout le reste — filtres, options, listes, boutons,
 * descriptions, compteurs. Elle remplace Barlow, une sans-serif qui donnait
 * aux écrans un air d'application moderne, en décalage avec leurs titres.
 *
 * Même variable qu'avant (`--font-ui`) : chaque style qui passait par
 * `--tb-font-ui` / `--cb-font-ui` bascule sans être retouché. Le rendu des
 * CARTES ne change pas (Cinzel + Crimson Pro, verrouillés dans Notion).
 */
export const uiFont = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-ui",
});
