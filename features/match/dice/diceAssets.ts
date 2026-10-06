import type { DieSize } from "@/game";

/**
 * Planches des dés (06/10/2026) : un CORPS par dé (`de-4`, `de-6`, `de-8`)
 * et une image de POINTS par face (`de-6-3`…), peinte de face, à plat.
 *
 * Les points sont PROJETÉS sur chaque face visible du corps : chaque face est
 * mesurée sur la planche (sommets en % de l'image) et l'image des points y
 * est posée par une transformation affine — un parallélogramme pour le cube,
 * un losange inscrit dans le triangle pour le D4 et le D8. Toutes les faces
 * visibles portent des points, comme sur un vrai dé.
 *
 * Dossier : `public/assets/dice/`. Si une planche manquait, un dé dessiné
 * prend le relais — rien ne casse, le chiffre reste lisible.
 */
export const DICE_DIR = "/assets/dice";

export function dieBodyUrl(die: DieSize): string {
  return `${DICE_DIR}/de-${die}.webp`;
}

export function dieFaceUrl(die: DieSize, value: number): string {
  return `${DICE_DIR}/de-${die}-${value}.webp`;
}

type Point = readonly [number, number];

/** Face visible : un parallélogramme (origine + deux côtés) ou un triangle, en % de l'image du corps. */
export type DieFace =
  | { kind: "quad"; origin: Point; u: Point; v: Point; shade: number }
  | { kind: "tri"; a: Point; b: Point; c: Point; shade: number };

export interface DieGeometry {
  /** Taille de la planche du corps, en pixels (recadrée à sa silhouette). */
  width: number;
  height: number;
  /** Faces visibles ; la PREMIÈRE porte le résultat du jet. */
  faces: DieFace[];
  /**
   * Faces triangulaires : taille du losange des points, en fraction des côtés
   * partant du sommet `a`. 1/3 tient exactement centré sur le barycentre ;
   * au-delà, seuls les coins (vides sur les planches du D4) débordent.
   */
  triScale?: number;
}

/**
 * Mesuré sur les planches du 06/10/2026 (grille en %), `shade` assombrit
 * légèrement les points d'une face moins éclairée.
 *   - D6, cube vu de trois quarts : dessus (le résultat), face gauche, face droite.
 *   - D8, octaèdre de face : facette haute gauche (le résultat), haute droite, basse gauche, basse droite.
 *   - D4, tétraèdre pointe en haut : face basse, tournée vers le joueur (le résultat), gauche, droite.
 */
export const DIE_GEOMETRY: Record<DieSize, DieGeometry> = {
  6: {
    width: 223,
    height: 256,
    faces: [
      { kind: "quad", origin: [49, 1], u: [48, 24], v: [-46, 24], shade: 1 },
      { kind: "quad", origin: [3, 25], u: [49, 24], v: [3, 52], shade: 0.9 },
      { kind: "quad", origin: [52, 49], u: [45, -24], v: [3, 50], shade: 0.8 },
    ],
  },
  8: {
    width: 225,
    height: 256,
    faces: [
      { kind: "tri", a: [50, 57], b: [50, 1], c: [1, 50], shade: 1 },
      { kind: "tri", a: [50, 57], b: [99, 50], c: [50, 1], shade: 0.9 },
      { kind: "tri", a: [50, 57], b: [1, 50], c: [50, 99], shade: 0.8 },
      { kind: "tri", a: [50, 57], b: [50, 99], c: [99, 50], shade: 0.75 },
    ],
    triScale: 0.36,
  },
  4: {
    width: 256,
    height: 243,
    faces: [
      { kind: "tri", a: [49, 55], b: [4, 90], c: [96, 90], shade: 1 },
      { kind: "tri", a: [49, 55], b: [50, 3], c: [4, 90], shade: 0.9 },
      { kind: "tri", a: [49, 55], b: [96, 90], c: [50, 3], shade: 0.85 },
    ],
    triScale: 0.42,
  },
};

/** Marge laissée autour des points dans une face carrée, par côté. */
const QUAD_MARGIN = 0.13;
/** Losange des faces triangulaires, par défaut (voir `DieGeometry.triScale`). */
const TRI_SCALE = 0.31;

/**
 * Matrice SVG (`matrix(a b c d e f)`) qui pose le carré unité des points sur
 * la face, en pixels de la planche du corps.
 */
export function faceMatrix(geometry: DieGeometry, face: DieFace): string {
  const px = ([x, y]: Point): [number, number] => [(x / 100) * geometry.width, (y / 100) * geometry.height];
  let origin: [number, number];
  let u: [number, number];
  let v: [number, number];
  if (face.kind === "quad") {
    const o = px(face.origin);
    const fu = px(face.u);
    const fv = px(face.v);
    origin = [o[0] + QUAD_MARGIN * (fu[0] + fv[0]), o[1] + QUAD_MARGIN * (fu[1] + fv[1])];
    u = [fu[0] * (1 - 2 * QUAD_MARGIN), fu[1] * (1 - 2 * QUAD_MARGIN)];
    v = [fv[0] * (1 - 2 * QUAD_MARGIN), fv[1] * (1 - 2 * QUAD_MARGIN)];
  } else {
    const a = px(face.a);
    const b = px(face.b);
    const c = px(face.c);
    const g: [number, number] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    const k = geometry.triScale ?? TRI_SCALE;
    u = [(b[0] - a[0]) * k, (b[1] - a[1]) * k];
    v = [(c[0] - a[0]) * k, (c[1] - a[1]) * k];
    origin = [g[0] - (u[0] + v[0]) / 2, g[1] - (u[1] + v[1]) / 2];
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return `matrix(${r(u[0])} ${r(u[1])} ${r(v[0])} ${r(v[1])} ${r(origin[0])} ${r(origin[1])})`;
}

/**
 * Valeurs portées par les faces visibles : le résultat sur la première, puis
 * des valeurs qu'un vrai dé montrerait à côté — jamais deux fois la même, ni
 * la face opposée (sur un D6 et un D8, deux faces opposées font N + 1).
 * `seed` (0 à 1) fait varier les voisines d'un jet à l'autre.
 */
export function visibleFaceValues(die: DieSize, value: number, count: number, seed: number): number[] {
  const opposite = (n: number) => die + 1 - n;
  const used = new Set<number>([value]);
  if (die !== 4) used.add(opposite(value));
  const pool = Array.from({ length: die }, (_, i) => i + 1).filter((n) => !used.has(n));
  const start = Math.floor(seed * pool.length);
  const values = [value];
  for (let i = 0; values.length < count && i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length]!;
    if (values.includes(candidate) || (die !== 4 && values.includes(opposite(candidate)))) continue;
    values.push(candidate);
  }
  // Le D8 montre quatre facettes : s'il manque de valeurs non opposées, on complète sans la contrainte.
  for (let i = 0; values.length < count && i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length]!;
    if (!values.includes(candidate)) values.push(candidate);
  }
  return values;
}
