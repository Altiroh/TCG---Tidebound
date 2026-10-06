import type { DieSize } from "@/game";

/**
 * DÉS EN VOLUME (CSS 3D) — géométrie.
 *
 * Chaque dé est un vrai solide : un cube (D6), un tétraèdre (D4), un
 * octaèdre (D8), décrit par ses sommets et ses faces. Chaque face est une
 * tuile plate (texture du dé + points de sa valeur), placée dans l'espace
 * par une matrice calculée ici à partir de trois de ses sommets.
 *
 * Les matrices sont des `Mat4` en colonnes, dans l'ordre de `matrix3d`. On
 * compose tout en JS (repos · roulis · face) et chaque tuile reçoit SA
 * matrice finale, sous un simple parent à perspective : pas de
 * `transform-style: preserve-3d`, dont les couches imbriquées sont
 * rastérisées sans tenir compte de la densité de l'écran (faces floues).
 *
 * Repère : celui du CSS — x vers la droite, y vers le BAS, z vers le
 * joueur. Le solide est centré sur l'origine.
 */

export type Vec3 = readonly [number, number, number];

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a));

/** Une face : ses sommets (3 pour un triangle, 4 pour un carré, dans l'ordre du tour) et la valeur qu'elle porte. */
interface FaceDef {
  vertices: number[];
  value: number;
}

interface Solid {
  vertices: Vec3[];
  faces: FaceDef[];
  /** Forme de la tuile : carrée (D6) ou triangulaire (D4, D8). */
  shape: "square" | "triangle";
}

/**
 * Solides de côté 1, centrés. Les valeurs suivent les dés réels : sur le D6
 * et le D8, deux faces opposées font N + 1.
 */
const SOLIDS: Record<DieSize, Solid> = (() => {
  const h = 0.5;
  // Cube : sommets ±0.5.
  const cube: Vec3[] = [
    [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], // avant (z+)
    [-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], // arrière (z-)
  ];
  // Octaèdre : sommets sur les axes, arête 1 → demi-diagonale 1/√2.
  const o = Math.SQRT1_2;
  const octa: Vec3[] = [[o, 0, 0], [-o, 0, 0], [0, o, 0], [0, -o, 0], [0, 0, o], [0, 0, -o]];
  // Tétraèdre régulier inscrit dans un cube : arête √8·k = 1.
  const k = 1 / Math.sqrt(8);
  const tetra: Vec3[] = [[k, k, k], [k, -k, -k], [-k, k, -k], [-k, -k, k]];
  return {
    6: {
      vertices: cube,
      shape: "square",
      faces: [
        { vertices: [0, 1, 2, 3], value: 1 }, // avant
        { vertices: [5, 4, 7, 6], value: 6 }, // arrière
        { vertices: [1, 5, 6, 2], value: 3 }, // droite
        { vertices: [4, 0, 3, 7], value: 4 }, // gauche
        { vertices: [4, 5, 1, 0], value: 2 }, // haut
        { vertices: [3, 2, 6, 7], value: 5 }, // bas
      ],
    },
    8: {
      vertices: octa,
      shape: "triangle",
      // Indices : 0 x+, 1 x-, 2 y+ (bas), 3 y- (haut), 4 z+, 5 z-. Opposées : 1-8, 2-7, 3-6, 4-5.
      faces: [
        { vertices: [3, 1, 4], value: 1 },
        { vertices: [2, 0, 5], value: 8 },
        { vertices: [3, 4, 0], value: 2 },
        { vertices: [2, 5, 1], value: 7 },
        { vertices: [2, 4, 1], value: 3 },
        { vertices: [3, 0, 5], value: 6 },
        { vertices: [2, 0, 4], value: 4 },
        { vertices: [3, 5, 1], value: 5 },
      ],
    },
    4: {
      vertices: tetra,
      shape: "triangle",
      faces: [
        { vertices: [1, 2, 3], value: 1 },
        { vertices: [0, 3, 2], value: 2 },
        { vertices: [0, 1, 3], value: 3 },
        { vertices: [0, 2, 1], value: 4 },
      ],
    },
  };
})();

/** Matrice 4 × 4 en colonnes, dans l'ordre des arguments de `matrix3d`. */
export type Mat4 = number[];

export interface PlacedFace {
  value: number;
  shape: "square" | "triangle";
  /** Taille de la tuile en px (largeur, hauteur). */
  width: number;
  height: number;
  /** Pose la tuile (origine en haut à gauche) sur sa face, solide centré sur l'origine. */
  matrix: Mat4;
  /** Normale sortante, pour l'éclairage. */
  normal: Vec3;
}

/** Normale sortante d'une face (le solide est centré sur l'origine). */
function outward(points: Vec3[]): Vec3 {
  const c = scale(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length);
  let n = norm(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
  if (dot(n, c) < 0) n = scale(n, -1);
  return n;
}

function frame(u: Vec3, v: Vec3, n: Vec3, origin: Vec3): Mat4 {
  return [...u, 0, ...v, 0, ...n, 0, ...origin, 1];
}

/** `a · b` : `b` s'applique d'abord, comme dans une liste de `transform` CSS (« a b »). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const r: Mat4 = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!;
  return r;
}

/** Une rotation appliquée à un vecteur (partie 3 × 3, sans translation). */
export function rotate(m: Mat4, v: Vec3): Vec3 {
  return [m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2], m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2], m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2]];
}

export function toCss(m: Mat4): string {
  return `matrix3d(${m.map((x) => Math.round(x * 10000) / 10000).join(",")})`;
}

/** `rotateX(x) rotateY(y) rotateZ(z)`, en degrés — comme la liste CSS du même nom. */
export function eulerMatrix(x: number, y: number, z: number): Mat4 {
  const [cx, sx, cy, sy, cz, sz] = [x, y, z].flatMap((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]) as [number, number, number, number, number, number];
  const rx = [1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1];
  const ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
  const rz = [cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return multiply(rx, multiply(ry, rz));
}

/**
 * Toutes les faces d'un dé de `size` px d'arête, posées dans l'espace.
 *
 * Tuile carrée : (0,0) → 1er sommet, (w,0) → 2e, (0,h) → 4e.
 * Tuile triangulaire (pointe en haut, `clip-path`) : (w/2,0) → 1er sommet,
 * (0,h) → 2e, (w,h) → 3e. Les sommets sont réordonnés pour que la tuile soit
 * vue de l'extérieur, et non à l'envers.
 */
export function placeFaces(die: DieSize, size: number): PlacedFace[] {
  const solid = SOLIDS[die];
  return solid.faces.map((face) => {
    let points = face.vertices.map((i) => scale(solid.vertices[i]!, size));
    const n = outward(points);
    // Le tour des sommets doit tourner dans le bon sens vu de l'extérieur
    // (u × v dans le sens de la normale), sinon la tuile apparaît en miroir.
    if (solid.shape === "square") {
      const [p0, p1, , p3] = points as [Vec3, Vec3, Vec3, Vec3];
      if (dot(cross(sub(p1, p0), sub(p3, p0)), n) < 0) points = [points[0]!, points[3]!, points[2]!, points[1]!];
      const [a, b, , d] = points as [Vec3, Vec3, Vec3, Vec3];
      const u = scale(sub(b, a), 1 / size);
      const v = scale(sub(d, a), 1 / size);
      return { value: face.value, shape: "square", width: size, height: size, matrix: frame(u, v, n, a), normal: n };
    }
    const width = size;
    const height = (size * Math.sqrt(3)) / 2;
    const [apex, b, c] = points as [Vec3, Vec3, Vec3];
    const poser = (left: Vec3, right: Vec3) => {
      const u = scale(sub(right, left), 1 / width);
      const origin = sub(apex, scale(u, width / 2));
      const v = scale(sub(left, origin), 1 / height);
      return { u, v, origin };
    };
    // Vue de l'extérieur, u × v doit pointer comme la normale : sinon on échange les deux pieds.
    let pose = poser(b, c);
    if (dot(cross(pose.u, pose.v), n) < 0) pose = poser(c, b);
    const { u, v, origin } = pose;
    return { value: face.value, shape: "triangle", width, height, matrix: frame(u, v, n, origin), normal: n };
  });
}

/**
 * Rotation qui amène la face portant `value` FACE AU JOUEUR, pointe ou bord
 * haut vers le haut de l'écran, puis l'incline légèrement (on voit le
 * volume, la face obtenue reste celle qu'on lit).
 */
export function restMatrix(die: DieSize, value: number, tilt: { x: number; y: number }): Mat4 {
  const solid = SOLIDS[die];
  const face = solid.faces.find((f) => f.value === value) ?? solid.faces[0]!;
  const points = face.vertices.map((i) => solid.vertices[i]!);
  const n = outward(points);
  const centre = scale(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length);
  // « Haut » de la face : vers sa pointe (triangle) ou vers son premier bord (carré).
  const haut = solid.shape === "triangle" ? norm(sub(points[0]!, centre)) : norm(sub(scale(add(points[0]!, points[1]!), 0.5), centre));
  // Repère direct de l'écran : x = z × (−y), d'où droite = n × haut.
  const droite = norm(cross(n, haut));
  // Base de la face (droite, haut, n) → base de l'écran ((1,0,0), (0,-1,0), (0,0,1)) :
  // les LIGNES de R sont droite, −haut, n ; en colonnes, on transpose.
  const R: Mat4 = [droite[0], -haut[0], n[0], 0, droite[1], -haut[1], n[1], 0, droite[2], -haut[2], n[2], 0, 0, 0, 0, 1];
  return multiply(eulerMatrix(0, tilt.y, 0), multiply(eulerMatrix(tilt.x, 0, 0), R));
}

type Quat = [number, number, number, number];

function toQuat(m: Mat4): Quat {
  const [m00, m10, m20, , m01, m11, m21, , m02, m12, m22] = m as [number, number, number, number, number, number, number, number, number, number, number];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
}

function fromQuat([x, y, z, w]: Quat): Mat4 {
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
}

/** Entre deux rotations, par le plus court chemin (le dé roule d'une face à l'autre). */
export function slerp(a: Mat4, b: Mat4, t: number): Mat4 {
  const qa = toQuat(a);
  let qb = toQuat(b);
  let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (d < 0) {
    qb = qb.map((x) => -x) as Quat;
    d = -d;
  }
  if (d > 0.9995) {
    const q = qa.map((x, i) => x + (qb[i]! - x) * t) as Quat;
    const l = Math.hypot(...q);
    return fromQuat(q.map((x) => x / l) as Quat);
  }
  const theta = Math.acos(d);
  const k0 = Math.sin((1 - t) * theta) / Math.sin(theta);
  const k1 = Math.sin(t * theta) / Math.sin(theta);
  return fromQuat(qa.map((x, i) => x * k0 + qb[i]! * k1) as Quat);
}

/** Rotation d'angle `angle` (radians) autour de l'axe unitaire `axis` (Rodrigues). */
export function axisAngle(axis: Vec3, angle: number): Mat4 {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    0, 0, 0, 1,
  ];
}

function transpose(m: Mat4): Mat4 {
  return [m[0]!, m[4]!, m[8]!, 0, m[1]!, m[5]!, m[9]!, 0, m[2]!, m[6]!, m[10]!, 0, 0, 0, 0, 1];
}

/** Une bascule d'une face à sa voisine, par-dessus leur arête commune. */
export interface RollStep {
  /** Arête commune (repère du dé, unitaire). */
  axis: Vec3;
  /** Angle de la bascule (radians) : `orientation · axisAngle(axis, angle)` amène la face suivante devant. */
  angle: number;
  /** Direction du déplacement à l'écran (unitaire), et distance en arêtes. */
  dir: [number, number];
  distance: number;
}

export interface RollPath {
  /** Orientation au premier contact avec la table, puis après chaque bascule ; la dernière est le repos. */
  orientations: Mat4[];
  steps: RollStep[];
}

/**
 * LE ROULEMENT d'un dé sur la table, à rebours depuis la face obtenue.
 *
 * Un dé réel ne pivote pas sur place : il bascule d'une face à une face
 * VOISINE, autour de leur arête commune — d'un quart de tour pour le cube,
 * de 70,5° pour l'octaèdre (il roule loin), de 109,5° pour le tétraèdre (il
 * se plante). On part de la pose de repos et on remonte `rolls` bascules,
 * en préférant celles qui avancent dans le sens du lancer (`throwDir`) ;
 * `random` (0 → 1, stable) départage. Le chemin rejoué à l'endroit finit
 * EXACTEMENT sur la pose de repos.
 */
export function rollPath(die: DieSize, value: number, tilt: { x: number; y: number }, rolls: number, throwDir: [number, number], random: () => number): RollPath {
  const solid = SOLIDS[die];
  const faceOf = (v: number) => solid.faces.find((f) => f.value === v) ?? solid.faces[0]!;
  const normalOf = (v: number) => outward(faceOf(v).vertices.map((i) => solid.vertices[i]!));
  const inradius = (v: number) => dot(solid.vertices[faceOf(v).vertices[0]!]!, normalOf(v));
  const orientations: Mat4[] = [restMatrix(die, value, tilt)];
  const steps: RollStep[] = [];
  let current = faceOf(value).value;
  let previous: number | null = null;
  for (let k = 0; k < rolls; k++) {
    const after = orientations[0]!;
    const candidates = solid.faces
      .filter((f) => f.value !== current && f.value !== previous && f.vertices.filter((i) => faceOf(current).vertices.includes(i)).length === 2)
      .map((f) => {
        const shared = f.vertices.filter((i) => faceOf(current).vertices.includes(i));
        const axis = norm(sub(solid.vertices[shared[1]!]!, solid.vertices[shared[0]!]!));
        const from = normalOf(f.value);
        const to = normalOf(current);
        let angle = Math.acos(Math.max(-1, Math.min(1, dot(from, to))));
        // La bascule doit amener `to` là où était `from`.
        if (dot(rotate(axisAngle(axis, angle), to), from) < 0.999) angle = -angle;
        const before = multiply(after, transpose(axisAngle(axis, angle)));
        const n = rotate(before, to);
        const len = Math.hypot(n[0], n[1]) || 1;
        const dir: [number, number] = [n[0] / len, n[1] / len];
        const distance = 2 * inradius(current) * Math.tan(Math.abs(angle) / 2);
        return { value: f.value, before, step: { axis, angle, dir, distance }, score: dir[0] * throwDir[0] + dir[1] * throwDir[1] + random() * 0.9 };
      });
    if (candidates.length === 0) break;
    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
    orientations.unshift(best.before);
    steps.unshift(best.step);
    previous = current;
    current = best.value;
  }
  return { orientations, steps };
}

/** Valeurs portées par un dé (pour vérifier qu'aucune ne manque ni ne se répète). */
export function faceValues(die: DieSize): number[] {
  return SOLIDS[die].faces.map((f) => f.value);
}
