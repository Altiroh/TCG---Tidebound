import type { CSSProperties } from "react";

/**
 * Visuels de sachet et leur CALAGE. Les trois images d'un booster (fermé,
 * bande arrachée, corps ouvert) sont recadrées séparément : ce fichier dit
 * comment les superposer pour que le paquet fermé et le paquet découpé se
 * recouvrent, et où se trouve l'ouverture d'où sortent les cartes.
 *
 * Tout est exprimé relativement à la boîte du CORPS OUVERT (qui ne bouge
 * jamais) : pourcentages de sa largeur / hauteur. Les nombres ne se
 * devinent pas — ils se REMESURENT sur les images, et chaque bloc dit de
 * quelles tailles en pixels il sort. Recadrer une image invalide son bloc.
 *
 * Ajouter un visuel = livrer une planche, en découper les trois images,
 * ajouter une entrée ici, et la relier à un id de booster dans
 * `BOOSTER_VISUAL_BY_ID`.
 */

/** Rectangle en % de la boîte du corps ouvert (left/width → largeur, top/height → hauteur). */
interface PercentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BoosterPackVisual {
  id: string;
  assets: {
    /** Booster fermé complet. */
    closed: string;
    /** Bande supérieure arrachée. */
    openTop: string;
    /** Corps du booster ouvert (dos de cartes visibles dans l'ouverture). */
    openBottom: string;
  };
  /** Largeur / hauteur de `openBottom` en pixels : proportions de la boîte du sachet. */
  aspectRatio: number;
  /** Paquet fermé, superposé au corps ouvert (bords, sangles et bas du sachet alignés). */
  closedRect: PercentRect;
  /** Bande arrachée, à la même échelle que le corps, recalée sur la ligne de découpe. */
  topRect: PercentRect;
  /** Point de la bande qui reste accroché pendant la déchirure (`transform-origin`, % de la bande). */
  topHinge: { x: number; y: number };
  /** Hauteur de la ligne de déchirure du corps, en % (point de départ des effets). */
  tearLineTop: number;
  /**
   * Dos de cartes peints dans l'ouverture : les vraies cartes montent
   * derrière eux, à la même largeur, avant d'en sortir.
   */
  mouth: {
    /** Décalage horizontal de leur centre par rapport au centre du sachet, en fraction de sa largeur. */
    centerX: number;
    /** Largeur en fraction de la largeur du sachet. */
    width: number;
    /** Sommet de départ d'une carte cachée, en fraction de la hauteur du sachet (sous le bord peint). */
    startTop: number;
  };
}

export const DEFAULT_PACK_VISUAL: BoosterPackVisual = {
  id: "defaut",
  assets: {
    closed: "/assets/boosters/defaut/defaut.webp",
    openTop: "/assets/boosters/defaut/defaut-open-top.webp",
    openBottom: "/assets/boosters/defaut/defaut-open-bottom.webp",
  },
  // Corps 816 × 1351 px.
  aspectRatio: 816 / 1351,
  // Fermé 943 × 1585 px, ramené à 81.52 % (rapport des silhouettes).
  closedRect: { left: 3.21, top: 4.35, width: 94.21, height: 95.65 },
  // Bande 805 × 283 px → 98.65 % × 20.95 %, bord bas sur la déchirure.
  topRect: { left: 0.67, top: -3.95, width: 98.65, height: 20.95 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 17,
  mouth: { centerX: 0.02, width: 0.56, startTop: 0.24 },
};

export const WELCOME_PACK_VISUAL: BoosterPackVisual = {
  id: "welcome",
  assets: {
    closed: "/assets/boosters/welcome/welcome.webp",
    openTop: "/assets/boosters/welcome/welcome-open-top.webp",
    openBottom: "/assets/boosters/welcome/welcome-open-bottom.webp",
  },
  // 849 × 1322 px
  aspectRatio: 849 / 1322,
  // 877 × 1494 px affichés à 97 % de l'échelle du corps.
  closedRect: { left: 0.21, top: -8.91, width: 100.2, height: 109.6 },
  // 796 × 226 px → 93.76 % × 17.1 %.
  topRect: { left: 3.2, top: -4.6, width: 93.76, height: 17.1 },
  topHinge: { x: 96, y: 82 },
  tearLineTop: 9,
  mouth: { centerX: 0.055, width: 0.56, startTop: 0.15 },
};

/**
 * Les trois boosters spécialisés. Leurs trois fichiers ne sont PAS à la même
 * échelle : le sachet fermé et la planche ouverte sont deux dessins séparés.
 * D'où la façon de les recaler, qui n'est pas celle de la boîte englobante :
 *
 *   - l'ÉCHELLE vient du rapport des SILHOUETTES entre 60 % et 80 % de la
 *     hauteur, là où le sachet est droit. La boîte englobante du corps ne
 *     convient pas : elle inclut les cartes qui dépassent et l'évasement de
 *     l'ouverture, deux choses que le sachet fermé n'a pas ;
 *   - le sachet fermé est ensuite aligné par le BAS (même objet, même
 *     sertissage) et centré sur l'axe du sachet, pas sur celui de l'image ;
 *   - la bande arrachée vient de la MÊME planche que le corps, donc déjà à
 *     la bonne échelle : centrée, bord inférieur posé sur la déchirure ;
 *   - `tearLineTop` et `mouth` sont relevés à la règle sur le corps — la
 *     ligne de déchirure entre ses pointes et son creux, la bouche sur la
 *     carte de devant PEINTE, pour que la vraie carte qui monte ait sa
 *     largeur et son axe.
 */
export const POISSONS_PAS_FRAIS_PACK_VISUAL: BoosterPackVisual = {
  id: "poissons-pas-frais",
  assets: {
    closed: "/assets/boosters/poissons-pas-frais/poissons-pas-frais.webp",
    openTop: "/assets/boosters/poissons-pas-frais/poissons-pas-frais-open-top.webp",
    openBottom: "/assets/boosters/poissons-pas-frais/poissons-pas-frais-open-bottom.webp",
  },
  // Corps 723 × 1289 px.
  aspectRatio: 723 / 1289,
  // Fermé 869 × 1495 px, ramené à 80.55 %.
  closedRect: { left: 1.27, top: 6.58, width: 96.81, height: 93.42 },
  // Bande 710 × 240 px → 98.2 % × 18.62 %.
  topRect: { left: 0.9, top: -2.62, width: 98.2, height: 18.62 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 16,
  mouth: { centerX: 0.01, width: 0.58, startTop: 0.23 },
};

export const ETRANGETE_SOUS_MARINE_PACK_VISUAL: BoosterPackVisual = {
  id: "etrangete-sous-marine",
  assets: {
    closed: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine.webp",
    openTop: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine-open-top.webp",
    openBottom: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine-open-bottom.webp",
  },
  // Corps 738 × 1346 px.
  aspectRatio: 738 / 1346,
  // Fermé 855 × 1461 px, ramené à 82.81 %.
  closedRect: { left: 2.69, top: 10.12, width: 95.94, height: 89.88 },
  // Bande 741 × 203 px → 100.41 % × 15.08 % : elle déborde le corps, ses
  // pointes s'écartent en se détachant.
  topRect: { left: -0.2, top: -2.08, width: 100.41, height: 15.08 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 13,
  mouth: { centerX: 0.005, width: 0.57, startTop: 0.19 },
};

/**
 * La Veillée des Disparus — quatrième booster (18/09/2026), noyau du Lot 13.
 * Son éventail de cartes penche nettement à droite : `mouth.centerX` vaut
 * 0.07 là où les trois autres sont à peu près centrés, sinon la vraie carte
 * monterait à côté de celles qui sont peintes dans l'ouverture.
 */
export const LA_VEILLEE_DES_DISPARUS_PACK_VISUAL: BoosterPackVisual = {
  id: "la-veillee-des-disparus",
  assets: {
    closed: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus.webp",
    openTop: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus-open-top.webp",
    openBottom: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus-open-bottom.webp",
  },
  // Corps 737 × 1300 px.
  aspectRatio: 737 / 1300,
  // Fermé 868 × 1598 px, ramené à 82.13 %.
  closedRect: { left: 1.67, top: -0.96, width: 96.73, height: 100.96 },
  // Bande 710 × 250 px → 96.34 % × 19.23 %.
  topRect: { left: 1.83, top: -4.23, width: 96.34, height: 19.23 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 15,
  mouth: { centerX: 0.07, width: 0.56, startTop: 0.22 },
};

/**
 * Nécessaire du Marin — cinquième booster (22/09/2026), le Lot 14.
 *
 * Livré en DEUX fichiers et non trois : une planche fermée, et une planche
 * ouverte portant la bande arrachée ET le corps, séparés par un vide. Les
 * deux morceaux ont été découpés par COMPOSANTES CONNEXES plutôt qu'au
 * ciseau horizontal — ils se chevauchent en hauteur (la bande descend à
 * droite jusque sous le sommet des cartes), donc aucune ligne droite ne
 * les sépare sans en entamer un.
 *
 * Le calage suit la méthode des autres boosters spécialisés (cf. l'en-tête
 * de ce fichier), et chaque nombre vient d'une mesure :
 *
 *   - corps 766 × 1360 px, bande 769 × 280 px, fermé 832 × 1458 px une
 *     fois recadré sur sa silhouette ;
 *   - ÉCHELLE 0,9527 — rapport des silhouettes entre 60 % et 80 % de la
 *     hauteur (698,5 px contre 733,2), là où le sachet est droit ;
 *   - le fermé est aligné par le BAS et centré sur l'axe du sachet
 *     (x = 380,7 dans le corps), pas sur celui de l'image ;
 *   - la bande vient de la même planche que le corps, donc déjà à la
 *     bonne échelle : son bord inférieur est posé sur la déchirure ;
 *   - `tearLineTop` est la médiane du liseré blanc (y ≈ 270), entre ses
 *     pointes (y ≈ 164) et son creux (y ≈ 343) ;
 *   - `mouth` est relevée sur la carte de devant PEINTE : x 205..680,
 *     donc un centre décalé de 8 % à droite de l'axe. `startTop` la place
 *     sous la déchirure, comme sur les quatre autres sachets, pour que la
 *     vraie carte monte de derrière le bord peint.
 */
export const NECESSAIRE_DU_MARIN_PACK_VISUAL: BoosterPackVisual = {
  id: "necessaire-du-marin",
  assets: {
    closed: "/assets/boosters/necessaire-du-marin/necessaire-du-marin.webp",
    openTop: "/assets/boosters/necessaire-du-marin/necessaire-du-marin-open-top.webp",
    openBottom: "/assets/boosters/necessaire-du-marin/necessaire-du-marin-open-bottom.webp",
  },
  // Corps 766 × 1360 px.
  aspectRatio: 766 / 1360,
  // Fermé 832 × 1458 px, ramené à 95.27 %.
  closedRect: { left: -1.95, top: -2.13, width: 103.48, height: 102.13 },
  // Bande 769 × 280 px → 100.39 % × 20.59 %, bord bas sur la déchirure.
  topRect: { left: -0.5, top: -0.74, width: 100.39, height: 20.59 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 20,
  mouth: { centerX: 0.08, width: 0.62, startTop: 0.27 },
};

/**
 * Éclats en Selle — sixième booster (23/09/2026), le Lot 15. Un bébé
 * Cavalerie en couche culotte, une pierre de verre dans une patte et une
 * pierre chromatique dans l'autre.
 *
 * Livré comme le Nécessaire : une planche fermée, une planche ouverte
 * portant la bande ET le corps. Ici un vide sépare les deux morceaux sur
 * toute la largeur : la découpe suit la première ligne vide sous la bande.
 * Le corps est pris depuis le HAUT du sachet (zone de la bande laissée
 * transparente), pour que bande et fermé se calent dans son repère.
 *
 * Mesures, sur les planches 1024 × 1536 :
 *   - corps 688 × 1488 px, bande 669 × 216 px à 14 px du bord gauche,
 *     fermé 734 × 1486 px, décalé de 25 px à gauche ;
 *   - déchirure : première ligne où le sachet couvre 85 % de sa largeur,
 *     à 18 % de la hauteur ;
 *   - `mouth` : étendue des dos de cartes peints à mi-hauteur entre leur
 *     sommet et la déchirure (72 % de la largeur, centrée), la vraie carte
 *     partant 6 % sous le bord peint.
 */
export const ECLATS_EN_SELLE_PACK_VISUAL: BoosterPackVisual = {
  id: "eclats-en-selle",
  assets: {
    closed: "/assets/boosters/eclats-en-selle/eclats-en-selle.webp",
    openTop: "/assets/boosters/eclats-en-selle/eclats-en-selle-open-top.webp",
    openBottom: "/assets/boosters/eclats-en-selle/eclats-en-selle-open-bottom.webp",
  },
  // Corps 688 × 1488 px.
  aspectRatio: 688 / 1488,
  // Fermé 734 × 1486 px.
  closedRect: { left: -3.63, top: 0.07, width: 106.69, height: 99.87 },
  // Bande 669 × 216 px → 97.24 % × 14.52 %.
  topRect: { left: 2.03, top: 0, width: 97.24, height: 14.52 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 18,
  mouth: { centerX: 0, width: 0.72, startTop: 0.24 },
};

/** Id de booster (table `boosters`) → visuel. Tout id inconnu retombe sur le visuel par défaut. */
const BOOSTER_VISUAL_BY_ID: Record<string, BoosterPackVisual> = {
  standard: DEFAULT_PACK_VISUAL,
  welcome_tutorial: WELCOME_PACK_VISUAL,
  "poissons-pas-frais": POISSONS_PAS_FRAIS_PACK_VISUAL,
  "etrangete-sous-marine": ETRANGETE_SOUS_MARINE_PACK_VISUAL,
  "la-veillee-des-disparus": LA_VEILLEE_DES_DISPARUS_PACK_VISUAL,
  "necessaire-du-marin": NECESSAIRE_DU_MARIN_PACK_VISUAL,
  "eclats-en-selle": ECLATS_EN_SELLE_PACK_VISUAL,
};

export const BOOSTER_PACK_VISUALS: readonly BoosterPackVisual[] = [
  DEFAULT_PACK_VISUAL,
  NECESSAIRE_DU_MARIN_PACK_VISUAL,
  POISSONS_PAS_FRAIS_PACK_VISUAL,
  ETRANGETE_SOUS_MARINE_PACK_VISUAL,
  LA_VEILLEE_DES_DISPARUS_PACK_VISUAL,
  ECLATS_EN_SELLE_PACK_VISUAL,
  WELCOME_PACK_VISUAL,
];

/**
 * Largeur / hauteur du SACHET FERMÉ. Déduite du calage plutôt que saisie
 * à part : `closedRect` dit déjà de quel facteur le paquet fermé est plus
 * large et plus haut que le corps ouvert, dont on connaît les
 * proportions. Un recadrage des visuels qui corrige `closedRect` corrige
 * donc aussi cette valeur, sans rien d'autre à retoucher.
 */
export function closedPackAspectRatio(visual: BoosterPackVisual): number {
  return visual.aspectRatio * (visual.closedRect.width / visual.closedRect.height);
}

/** Variables CSS pour poser le sachet FERMÉ d'un booster ailleurs que dans la scène d'ouverture (l'étagère de l'écran Boosters). */
export function closedPackVariables(visual: BoosterPackVisual): CSSProperties {
  const vars: Record<`--${string}`, string | number> = {
    "--pack-art": `url("${visual.assets.closed}")`,
    "--pack-ratio": closedPackAspectRatio(visual),
  };
  return vars as CSSProperties;
}

export function getBoosterPackVisual(boosterId: string): BoosterPackVisual {
  return BOOSTER_VISUAL_BY_ID[boosterId] ?? DEFAULT_PACK_VISUAL;
}

/** Calage poussé en variables CSS sur la scène (lues par le sachet ET par les cartes qui en sortent). */
export function packVisualVariables(visual: BoosterPackVisual): CSSProperties {
  const pct = (value: number) => `${value}%`;
  const vars: Record<`--${string}`, string | number> = {
    "--pack-ratio": visual.aspectRatio,
    "--closed-left": pct(visual.closedRect.left),
    "--closed-top": pct(visual.closedRect.top),
    "--closed-width": pct(visual.closedRect.width),
    "--closed-height": pct(visual.closedRect.height),
    "--top-left": pct(visual.topRect.left),
    "--top-top": pct(visual.topRect.top),
    "--top-width": pct(visual.topRect.width),
    "--top-height": pct(visual.topRect.height),
    "--top-hinge": `${visual.topHinge.x}% ${visual.topHinge.y}%`,
    "--tear-y": pct(visual.tearLineTop),
    "--mouth-x": visual.mouth.centerX,
    "--mouth-w": visual.mouth.width,
    "--mouth-top": visual.mouth.startTop,
  };
  return vars as CSSProperties;
}
