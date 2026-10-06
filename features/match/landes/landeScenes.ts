/**
 * MISE EN SCÈNE des Landes sur le plateau — une entrée par carte.
 *
 * Une Lande change les règles de la partie entière : elle doit se
 * reconnaître d'un coup d'œil, sur tout le plateau, sans jamais masquer les
 * cartes (Roadmap « Système de Terrain », 05/10/2026). Vocabulaire visuel
 * fixé : pics = attrition, chaînes = restriction, pluie corrosive =
 * suppression défensive.
 *
 * Chaque scène combine, du fond vers l'avant (toutes SOUS les cartes) :
 *   1. une teinte d'atmosphère (`tint`, dégradé CSS posé en `mix-blend`) ;
 *   2. un effet ANIMÉ dessiné sur canvas (`fx`), procédural — il ne dépend
 *      d'aucun fichier ;
 *   3. des PIÈCES illustrées (`sprites`) — pics, segments de chaîne — que
 *      l'effet animé place LUI-MÊME le long des bords, à la taille de
 *      l'écran : rien n'est une grande image recadrée, le centre reste
 *      toujours libre pour les cartes ;
 *   4. des calques de bord (`layers`), pour ce qui n'a pas à se placer
 *      (flaques, fumées).
 * Un fichier absent n'est simplement pas dessiné : l'effet animé dessine
 * alors ses propres pics et chaînes, et la scène s'enrichit dès que les
 * pièces sont déposées.
 *
 * Les calques vivent dans `public/assets/landes/<cardId>/` (voir le README
 * du dossier pour les dimensions). Une Lande sans entrée ici a la scène par
 * défaut : sa teinte et ses particules d'arrivée, rien d'autre.
 */

/** Effets animés disponibles (`features/match/landes/landeFx.ts`). */
export type LandeFxKind = "acidRain" | "glassSpikes" | "chains";

/** Calque d'image posé sur un bord du plateau. */
export interface LandeLayer {
  /** Fichier, relatif à `/assets/landes/<cardId>/`. */
  file: string;
  /** Bord auquel le calque s'accroche ; il garde son ratio et s'étire sur la largeur (haut/bas) ou la hauteur (gauche/droite). */
  edge: "top" | "bottom" | "left" | "right" | "full";
  /** Taille sur l'axe perpendiculaire au bord, en % de la scène (défaut : 30). */
  size?: number;
  /** Opacité finale (défaut : 1). */
  opacity?: number;
  /** Respiration lente (léger va-et-vient) — pour les chaînes qui pendent. */
  sway?: boolean;
}

/** Zone où se pose une pièce de décor : la bande de mer, le bureau sous la rangée du joueur, le ciel au-dessus de l'adversaire. */
export type LandePropZone = "sea" | "desk" | "sky";

/**
 * PIÈCE DE DÉCOR POSÉE (Le Donjon de Ladalle) : une image isométrique,
 * pied au bas de l'image, posée par `LandeProps` dans sa zone.
 */
export interface LandeProp {
  file: string;
  zone: LandePropZone;
  /** Position horizontale dans la zone (0 → 1). */
  at: number;
  /** Hauteur, en multiple de la hauteur de la zone. */
  scale: number;
  /** « front » : devant le plateau (hors cartes) ; « back » : sous les cartes. */
  layer: "back" | "front";
  /** Sources de lumière (fractions de l'image) : un halo cliquable, qu'on souffle et rallume. */
  lights?: { x: number; y: number; size?: number }[];
  /** Point d'où monte une fumée verte nauséabonde (fractions de l'image). */
  stench?: { x: number; y: number };
}

export interface LandeScene {
  /** Couleur de la Lande, `r, g, b` — halo, particules, liseré de dissolution. */
  rgb: string;
  /** Seconde couleur, plus claire : cœur des particules et bord brûlant de la dissolution. */
  rgbHot: string;
  /** Teinte d'atmosphère posée sur le décor (CSS `background`). */
  tint: string;
  fx?: LandeFxKind;
  /**
   * L'effet a aussi un calque DEVANT les rangées (pics qui percent le bord
   * des cadres), posé au-dessus du plateau mais jamais sur une carte.
   */
  frontFx?: boolean;
  /**
   * Pièces illustrées que l'effet animé place lui-même (`landeFx.ts`) :
   * pics de verre (base en bas de l'image, pointe en haut), segments de
   * chaîne (horizontaux, qui se répètent sans couture). Relatives au
   * dossier de la Lande. Tant qu'aucune n'a chargé, l'effet dessine les
   * siennes.
   */
  sprites?: string[];
  /** Petits débris projetés aux temps forts (éclats de verre). */
  debris?: string[];
  /** Pièces d'ancrage aux extrémités visibles (anneau, crochet), en alternance. */
  anchors?: string[];
  layers?: LandeLayer[];
  /** Pièces de décor posées autour du plateau (`LandeProps`). */
  props?: LandeProp[];
  /**
   * Calque montré un instant à chaque tour de table qui s'achève (fissures
   * de la Vallée, cadenas de la Chaîne). Relatif au dossier de la Lande.
   */
  pulseLayer?: string;
}

const DEFAULT_SCENE: LandeScene = {
  rgb: "126, 224, 208",
  rgbHot: "220, 255, 248",
  tint: "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(10, 40, 40, 0.35) 100%)",
};

export const LANDE_SCENES: Readonly<Record<string, LandeScene>> = {
  "pluie-corrosive": {
    rgb: "164, 214, 58",
    rgbHot: "232, 255, 150",
    tint:
      "linear-gradient(180deg, rgba(60, 80, 20, 0.38) 0%, rgba(30, 50, 10, 0.12) 45%, rgba(70, 90, 20, 0.32) 100%), " +
      "radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(16, 28, 4, 0.45) 100%)",
    fx: "acidRain",
    layers: [
      { file: "flaques-bas.png", edge: "bottom", size: 22, opacity: 0.9 },
      { file: "fumees.png", edge: "full", opacity: 0.55 },
    ],
  },
  "vallee-de-verre": {
    rgb: "150, 220, 255",
    rgbHot: "240, 252, 255",
    tint:
      "linear-gradient(180deg, rgba(150, 210, 255, 0.16) 0%, transparent 40%, rgba(120, 190, 240, 0.2) 100%), " +
      "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(8, 22, 40, 0.45) 100%)",
    fx: "glassSpikes",
    frontFx: true,
    // Pics élancés et grappes plus larges (`eclat-*`) : les grappes donnent
    // du corps aux bords, les pics la hauteur aux coins.
    sprites: ["pic-01.png", "pic-02.png", "pic-03.png", "pic-04.png", "pic-05.png", "pic-06.png", "eclat-01.png", "eclat-02.png", "eclat-03.png"],
    debris: ["eclat-01.png", "eclat-02.png", "eclat-03.png"],
    pulseLayer: "fissures.png",
  },
  "le-donjon-de-ladalle": {
    rgb: "236, 170, 84",
    rgbHot: "255, 226, 160",
    tint:
      "linear-gradient(180deg, rgba(30, 20, 10, 0.4) 0%, rgba(20, 14, 8, 0.15) 40%, rgba(30, 20, 10, 0.4) 100%), " +
      "radial-gradient(120% 90% at 50% 45%, transparent 40%, rgba(8, 5, 2, 0.55) 100%)",
    frontFx: true,
    // Murs, arche, étal et latrines sortent du plateau à l'arrivée de la Lande.
    props: [
      { file: "arche.png", zone: "sea", at: 0.19, scale: 1.05, layer: "front", lights: [{ x: 0.825, y: 0.33 }] },
      { file: "mur-echelle.png", zone: "sea", at: 0.79, scale: 0.8, layer: "back" },
      { file: "etal.png", zone: "desk", at: 0.12, scale: 1.25, layer: "front", lights: [{ x: 0.83, y: 0.38 }] },
      { file: "latrines.png", zone: "desk", at: 0.93, scale: 1.2, layer: "front", stench: { x: 0.45, y: 0.42 } },
      { file: "mur-fenetre.png", zone: "sky", at: 0.07, scale: 1.05, layer: "front", lights: [{ x: 0.465, y: 0.48, size: 0.42 }] },
      { file: "mur-torche.png", zone: "sky", at: 0.92, scale: 1.05, layer: "front", lights: [{ x: 0.275, y: 0.33 }] },
    ],
  },
  "chaine-de-construction": {
    rgb: "196, 112, 52",
    rgbHot: "255, 196, 120",
    tint:
      "linear-gradient(180deg, rgba(70, 36, 14, 0.32) 0%, transparent 35%, transparent 65%, rgba(70, 36, 14, 0.32) 100%), " +
      "radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(24, 12, 4, 0.5) 100%)",
    fx: "chains",
    sprites: ["chaine-segment-01.png", "chaine-segment-02.png", "chaine-segment-03.png"],
    anchors: ["anneau.png", "crochet.png"],
    pulseLayer: "cadenas.png",
  },
};

export function landeScene(cardId: string): LandeScene {
  return LANDE_SCENES[cardId] ?? DEFAULT_SCENE;
}

export function landeAsset(cardId: string, file: string): string {
  return `/assets/landes/${cardId}/${file.replace(/\.png$/, ".webp")}`;
}
