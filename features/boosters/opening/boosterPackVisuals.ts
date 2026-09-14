import type { CSSProperties } from "react";

/**
 * Visuels de sachet et leur CALAGE. Les trois PNG d'un booster (fermé,
 * bande arrachée, corps ouvert) sont recadrés séparément : ce fichier dit
 * comment les superposer pour que le paquet fermé et le paquet découpé se
 * recouvrent, et où se trouve l'ouverture d'où sortent les cartes.
 *
 * Tout est exprimé relativement à la boîte du CORPS OUVERT (qui ne bouge
 * jamais) : pourcentages de sa largeur / hauteur. Calibré à l'œil sur les
 * PNG fournis — à refaire si un PNG est recadré.
 *
 * Ajouter un visuel = déposer ses 3 PNG, ajouter une entrée ici, et la
 * relier à un id de booster dans `BOOSTER_VISUAL_BY_ID`.
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
  // 834 × 1198 px
  aspectRatio: 834 / 1198,
  // 842 × 1371 px affichés à 98.5 % de l'échelle du corps.
  closedRect: { left: 0.1, top: -15.8, width: 99.4, height: 112.7 },
  // 809 × 222 px → 97 % × 18.53 %.
  topRect: { left: 1.3, top: -9.8, width: 97, height: 18.53 },
  topHinge: { x: 96, y: 84 },
  tearLineTop: 8,
  mouth: { centerX: 0.01, width: 0.63, startTop: 0.14 },
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

/** Id de booster (table `boosters`) → visuel. Tout id inconnu retombe sur le visuel par défaut. */
const BOOSTER_VISUAL_BY_ID: Record<string, BoosterPackVisual> = {
  standard: DEFAULT_PACK_VISUAL,
  welcome_tutorial: WELCOME_PACK_VISUAL,
};

export const BOOSTER_PACK_VISUALS: readonly BoosterPackVisual[] = [DEFAULT_PACK_VISUAL, WELCOME_PACK_VISUAL];

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
