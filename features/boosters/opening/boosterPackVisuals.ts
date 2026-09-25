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
 *
 * Planches UNIFORMISÉES du 25/09/2026 (les six boosters en vente) : un même
 * gabarit de sachet, livré en deux PNG — le sachet fermé, et une planche
 * ouverte où la bande arrachée flotte au-dessus du corps. Aucun dos de carte
 * n'y est peint : ce sont ceux DU JOUEUR (`cardBacks`) que la scène glisse
 * dans l'ouverture. Découpe et mesures :
 *   - bande et corps : les deux blocs non vides de la planche ouverte, de
 *     haut en bas, recadrés à leur silhouette ;
 *   - échelle du fermé : rapport des largeurs de silhouette entre 60 % et
 *     80 % de la hauteur (là où le sachet est droit), puis aligné par le bas
 *     et centré sur l'axe ;
 *   - bande : même planche que le corps, donc même échelle ; son bord haut
 *     posé sur celui du fermé, son décalage horizontal repris de la planche.
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
  /**
   * Dos de cartes que la scène pose ELLE-MÊME dans l'ouverture, derrière le
   * corps — le dos équipé par le joueur, pas un dos peint. Absent : le corps
   * en peint déjà (Mini Booster de Bienvenue).
   */
  cardBacks?: {
    /** Sommet de la pile, en fraction de la hauteur du sachet (négatif : au-dessus du bord). */
    top: number;
    /** Largeur d'une carte, en fraction de la largeur du sachet. */
    width: number;
  };
}

/**
 * Ouverture des planches uniformisées : la pile de dos du joueur dépasse de
 * 6 % au-dessus du corps, sur 60 % de sa largeur ; la vraie carte qui monte
 * a cette largeur et part cachée derrière elle.
 */
const PACK_CARD_BACKS = { top: -0.06, width: 0.6 } as const;
const PACK_MOUTH = { centerX: 0, width: 0.6, startTop: 0.03 } as const;

/** Défaut — planches du 25/09/2026. */
export const DEFAULT_PACK_VISUAL: BoosterPackVisual = {
  id: "defaut",
  assets: {
    closed: "/assets/boosters/defaut/defaut.webp",
    openTop: "/assets/boosters/defaut/defaut-open-top.webp",
    openBottom: "/assets/boosters/defaut/defaut-open-bottom.webp",
  },
  // Corps 846 × 1380 px, bande 786 × 168 px, fermé 931 × 1573 px ramené à 91.58 %.
  aspectRatio: 846 / 1380,
  closedRect: { left: -0.3, top: -4.39, width: 100.78, height: 104.39 },
  topRect: { left: 4.14, top: -4.39, width: 92.91, height: 12.17 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 6,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
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

/** Poissons pas frais — planches du 25/09/2026. */
export const POISSONS_PAS_FRAIS_PACK_VISUAL: BoosterPackVisual = {
  id: "poissons-pas-frais",
  assets: {
    closed: "/assets/boosters/poissons-pas-frais/poissons-pas-frais.webp",
    openTop: "/assets/boosters/poissons-pas-frais/poissons-pas-frais-open-top.webp",
    openBottom: "/assets/boosters/poissons-pas-frais/poissons-pas-frais-open-bottom.webp",
  },
  // Corps 860 × 1403 px, bande 799 × 171 px, fermé 941 × 1587 px ramené à 93.12 %.
  aspectRatio: 860 / 1403,
  closedRect: { left: -0.78, top: -5.34, width: 101.89, height: 105.34 },
  topRect: { left: 4.19, top: -5.34, width: 92.91, height: 12.19 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 5,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
};

/** Étrangeté sous-marine — planches du 25/09/2026. */
export const ETRANGETE_SOUS_MARINE_PACK_VISUAL: BoosterPackVisual = {
  id: "etrangete-sous-marine",
  assets: {
    closed: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine.webp",
    openTop: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine-open-top.webp",
    openBottom: "/assets/boosters/etrangete-sous-marine/etrangete-sous-marine-open-bottom.webp",
  },
  // Corps 856 × 1356 px, bande 778 × 164 px, fermé 900 × 1499 px ramené à 96.5 %.
  aspectRatio: 856 / 1356,
  closedRect: { left: -1.17, top: -6.68, width: 101.46, height: 106.68 },
  topRect: { left: 4.32, top: -6.68, width: 90.89, height: 12.09 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 3,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
};

/** La Veillée des Disparus — planches du 25/09/2026. */
export const LA_VEILLEE_DES_DISPARUS_PACK_VISUAL: BoosterPackVisual = {
  id: "la-veillee-des-disparus",
  assets: {
    closed: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus.webp",
    openTop: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus-open-top.webp",
    openBottom: "/assets/boosters/la-veillee-des-disparus/la-veillee-des-disparus-open-bottom.webp",
  },
  // Corps 814 × 1322 px, bande 746 × 154 px, fermé 941 × 1588 px ramené à 87.27 %.
  aspectRatio: 814 / 1322,
  closedRect: { left: -0.39, top: -4.83, width: 100.89, height: 104.83 },
  topRect: { left: 3.81, top: -4.83, width: 91.65, height: 11.65 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 5,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
};

/** Nécessaire du Marin — planches du 25/09/2026. */
export const NECESSAIRE_DU_MARIN_PACK_VISUAL: BoosterPackVisual = {
  id: "necessaire-du-marin",
  assets: {
    closed: "/assets/boosters/necessaire-du-marin/necessaire-du-marin.webp",
    openTop: "/assets/boosters/necessaire-du-marin/necessaire-du-marin-open-top.webp",
    openBottom: "/assets/boosters/necessaire-du-marin/necessaire-du-marin-open-bottom.webp",
  },
  // Corps 854 × 1395 px, bande 795 × 171 px, fermé 943 × 1585 px ramené à 92.24 %.
  aspectRatio: 854 / 1395,
  closedRect: { left: -0.92, top: -4.81, width: 101.86, height: 104.81 },
  topRect: { left: 3.98, top: -4.81, width: 93.09, height: 12.26 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 5,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
};

/** Éclats en Selle — planches du 25/09/2026. */
export const ECLATS_EN_SELLE_PACK_VISUAL: BoosterPackVisual = {
  id: "eclats-en-selle",
  assets: {
    closed: "/assets/boosters/eclats-en-selle/eclats-en-selle.webp",
    openTop: "/assets/boosters/eclats-en-selle/eclats-en-selle-open-top.webp",
    openBottom: "/assets/boosters/eclats-en-selle/eclats-en-selle-open-bottom.webp",
  },
  // Corps 843 × 1381 px, bande 786 × 167 px, fermé 942 × 1584 px ramené à 90.88 %.
  aspectRatio: 843 / 1381,
  closedRect: { left: -0.78, top: -4.24, width: 101.56, height: 104.24 },
  topRect: { left: 3.91, top: -4.24, width: 93.24, height: 12.09 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 6,
  mouth: PACK_MOUTH,
  cardBacks: PACK_CARD_BACKS,
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
