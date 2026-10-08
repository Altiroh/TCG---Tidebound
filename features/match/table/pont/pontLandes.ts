import type { LandeFloorProps } from "@/features/match/table/BackgroundLayer";
import type { PontLandeFxKind } from "@/features/match/table/pont/PontLandeFx";

/**
 * DÉCORS DE LANDE du pont : une Lande posée remplace le sol du pont par le
 * sien (même cadrage, 1672 × 941) et y dresse ses pièces. Boîtes en
 * fractions du fond : [gauche, haut, largeur, hauteur].
 *
 * Le Donjon (maquette du 08/10) : une seule cabine, à gauche contre le mur,
 * à l'échelle des dalles (≈ trois rangées de dalles de haut, 32 % de la
 * hauteur), qui déborde un peu du cadre. Cliquée, elle lâche une fumée
 * verte et puante. Les quatre flammes peintes (candélabres du fond, bougies
 * des coins bas) ont chacune leur lueur.
 */
export const PONT_LANDE_FLOORS: Record<string, LandeFloorProps> = {
  "le-donjon-de-ladalle": {
    key: "pont-donjon",
    src: "/assets/landes/le-donjon-de-ladalle/pont-sol.webp",
    // Le sol part de la carte, après son impact (`landeCardSlam`, ~480 ms).
    delayMs: 480,
    origin: [0.19, 0.49],
    frame: [
      { src: "/assets/landes/le-donjon-de-ladalle/cabine.webp", box: [-0.015, 0.15, 0.1162, 0.32], fx: "fumeeVerte", label: "Cabine (ne pas ouvrir)" },
      // Le panneau « SAFE PLACE », pendu en haut à droite.
      { src: "/assets/landes/le-donjon-de-ladalle/panneau.webp", box: [0.885, 0.04, 0.083, 0.24] },
    ],
    glows: [
      [0.132, 0.037, 0.1],
      [0.83, 0.037, 0.1],
      [0.021, 0.733, 0.1],
      [0.966, 0.733, 0.1],
    ],
  },
  "pluie-corrosive": pontSol("pluie-corrosive"),
  "calme-trompeur": pontSol("calme-trompeur"),
  // Les feux derrière les vitres, aux quatre coins.
  "vallee-de-verre": pontSol("vallee-de-verre", [
    [0.14, 0.03, 0.12],
    [0.855, 0.03, 0.12],
    [0.02, 0.72, 0.12],
    [0.975, 0.72, 0.12],
  ]),
  // Les lanternes du chantier.
  "chaine-de-construction": pontSol("chaine-de-construction", [
    [0.255, 0.045, 0.07],
    [0.825, 0.05, 0.07],
    [0.962, 0.15, 0.06],
    [0.982, 0.745, 0.08],
  ]),
};

/** Effets animés posés sur le sol d'une Lande (`PontLandeFx`). */
export const PONT_LANDE_FX: Record<string, PontLandeFxKind> = {
  "pluie-corrosive": "pluieVerte",
  "calme-trompeur": "puitsLumiere",
};

/** Un sol de Lande sans pièce : `landes/<id>/pont-sol.webp`, qui part de la carte. */
function pontSol(cardId: string, glows?: LandeFloorProps["glows"]): LandeFloorProps {
  return { key: `pont-${cardId}`, src: `/assets/landes/${cardId}/pont-sol.webp`, delayMs: 480, origin: [0.19, 0.49], frame: [], glows };
}

/**
 * Le décor d'une Lande sur le pont, avec SA clé (une Lande rejouée rejoue son
 * entrée) et son délai d'entrée : 480 ms quand elle arrive sous les yeux du
 * joueur (sa carte s'abat d'abord), 0 si elle était déjà là. `null` : la Lande
 * n'a pas de sol pour le pont, le pont reste.
 */
export function pontLandeFloor(cardId: string, key: string, arriving: boolean): LandeFloorProps | null {
  const floor = PONT_LANDE_FLOORS[cardId];
  return floor ? { ...floor, key, delayMs: arriving ? floor.delayMs : 0 } : null;
}
