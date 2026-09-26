"use client";

import { useEffect, useState, type CSSProperties } from "react";
import styles from "@/features/match/VictoryConfetti.module.css";

/**
 * LES CONFETTIS DE LA VICTOIRE — une pluie de feuilles d'or et de papier
 * rouge qui tombe proprement quelques secondes sur l'écran de victoire, puis
 * s'efface.
 *
 * Une seule image : la planche peinte (`confettis.webp`). Chaque pièce y a
 * été repérée (tache opaque isolée, 26/09/2026) et se découpe à l'affichage
 * en sprite : `[x, y, largeur, hauteur]`, en % de la planche — des
 * coordonnées qui tiennent quelle que soit la taille de l'image servie.
 */
const SHEET = "/assets/match-end/victoire/confettis.webp";
/** Proportions de la planche (2172 × 724) : elles donnent celles de chaque pièce. */
const SHEET_RATIO = 2172 / 724;

const PIECES: ReadonlyArray<readonly [number, number, number, number]> = [
  [13.03, 1.52, 11.05, 33.98], [28.18, 1.93, 7.27, 93.92], [36.28, 2.21, 5.2, 13.54], [52.03, 2.49, 7.92, 27.76],
  [81.81, 2.62, 3.18, 10.36], [1.2, 2.76, 10.59, 71.69], [46.55, 2.9, 3.36, 10.77], [72.7, 5.25, 4.37, 13.12],
  [93.6, 7.6, 2.49, 7.87], [42.08, 8.01, 5.99, 20.44], [67.36, 12.71, 2.62, 8.56], [61.19, 14.5, 3.64, 11.74],
  [93.42, 15.75, 4.56, 17.13], [85.87, 16.3, 3.59, 11.19], [70.81, 17.82, 1.8, 8.01], [78.64, 19.61, 5.11, 13.95],
  [37.57, 20.58, 2.67, 3.73], [14.18, 21.13, 16.11, 73.9], [45.21, 23.9, 8.93, 13.54], [76.29, 25.97, 1.8, 7.87],
  [36.28, 27.35, 7.41, 21.13], [69.75, 29.14, 2.81, 8.84], [61.46, 29.56, 5.66, 17.27], [90.42, 31.08, 1.61, 7.6],
  [54.79, 32.46, 7.87, 32.04], [80.76, 34.53, 5.99, 13.67], [6.58, 36.6, 14.96, 58.43], [42.4, 37.71, 3.27, 9.94],
  [76.47, 39.09, 2.21, 9.81], [95.17, 41.57, 1.66, 6.08], [66.48, 41.85, 2.72, 8.98], [71.41, 45.58, 2.95, 8.15],
  [49.45, 45.99, 4.14, 11.05], [40.01, 48.34, 8.66, 25.55], [63.21, 49.31, 6.68, 20.3], [85.27, 49.45, 2.9, 9.12],
  [89.18, 50.14, 2.62, 8.01], [92.27, 50.69, 5.43, 8.01], [75.83, 51.1, 3.31, 9.12], [35.91, 51.52, 4.56, 13.81],
  [69.8, 52.35, 1.84, 6.08], [82.37, 59.12, 1.98, 7.18], [73.99, 59.53, 1.66, 5.39], [94.01, 59.67, 3.96, 12.85],
  [71.27, 61.33, 3.31, 11.05], [89.23, 61.6, 3.22, 9.12], [47.93, 62.57, 6.12, 17.13], [84.94, 64.5, 2.58, 8.7],
  [62.15, 65.75, 2.76, 8.98], [78.91, 66.16, 2.72, 9.25], [54.65, 66.3, 3.68, 10.77], [69.66, 69.61, 8.93, 22.65],
  [83.06, 71.41, 2.72, 10.5], [65.79, 71.55, 4.42, 13.4], [91.76, 72.51, 5.48, 14.23], [36.37, 72.79, 7.32, 21.82],
  [53.27, 74.31, 10.22, 21.41], [44.29, 74.59, 3.64, 11.88], [79.14, 79.14, 2.72, 10.64], [63.9, 84.81, 2.3, 7.32],
  [93, 84.81, 2.35, 8.15], [88.35, 85.91, 2.58, 8.56],
];

/** Les longs rubans (plus d'un quart de la hauteur de la planche) : rares, sinon ils mangent l'écran. */
const RIBBONS = PIECES.map((piece, index) => ({ piece, index })).filter(({ piece }) => piece[3] > 25).map(({ index }) => index);
const FLAKES = PIECES.map((_, index) => index).filter((index) => !RIBBONS.includes(index));

/** Nombre de pièces, départ après l'impact du titre, et durée de la pluie. */
const COUNT = 72;
const START_MS = 350;
/** Largeur d'écran (vw) d'un pixel de planche : les pièces gardent leurs tailles relatives. */
const VW_PER_SHEET_PX = 0.014;

interface Flake {
  key: number;
  style: CSSProperties;
  spriteStyle: CSSProperties;
}

const between = (min: number, max: number) => min + Math.random() * (max - min);

function makeFlakes(): { flakes: Flake[]; lastsMs: number } {
  let lastsMs = 0;
  const flakes = Array.from({ length: COUNT }, (_, key) => {
    const index = Math.random() < 0.12 ? RIBBONS[Math.floor(Math.random() * RIBBONS.length)]! : FLAKES[Math.floor(Math.random() * FLAKES.length)]!;
    const [x, y, w, h] = PIECES[index]!;
    const widthPx = (w / 100) * 2172;
    const aspect = (w / h) * SHEET_RATIO;
    // Les rubans, longs de nature, restent un cran sous les éclats.
    const scale = between(0.75, 1.25) * (RIBBONS.includes(index) ? 0.7 : 1);
    const delay = START_MS + between(0, 1900);
    const duration = between(3200, 5200);
    lastsMs = Math.max(lastsMs, delay + duration);
    return {
      key,
      style: {
        left: `${between(-2, 100)}%`,
        width: `max(12px, ${(widthPx * VW_PER_SHEET_PX * scale).toFixed(2)}vw)`,
        aspectRatio: String(aspect),
        animationDelay: `${delay.toFixed(0)}ms`,
        animationDuration: `${duration.toFixed(0)}ms`,
        "--drift": `${between(-10, 10).toFixed(1)}vw`,
        "--sway": `${between(1.5, 4.5).toFixed(1)}vw`,
        "--spin": `${between(-540, 540).toFixed(0)}deg`,
      } as CSSProperties,
      spriteStyle: {
        backgroundImage: `url("${SHEET}")`,
        backgroundSize: `${(10000 / w).toFixed(2)}% ${(10000 / h).toFixed(2)}%`,
        backgroundPosition: `${((x / (100 - w)) * 100).toFixed(2)}% ${((y / (100 - h)) * 100).toFixed(2)}%`,
        animationDuration: `${between(700, 1600).toFixed(0)}ms`,
        animationDelay: `${(-between(0, 1600)).toFixed(0)}ms`,
        "--axis": between(-1, 1).toFixed(2),
      } as CSSProperties,
    };
  });
  return { flakes, lastsMs };
}

export function VictoryConfetti() {
  const [flakes, setFlakes] = useState<Flake[] | null>(null);

  // Tirées au montage (côté client), puis la couche se retire une fois la dernière pièce tombée.
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const { flakes: drawn, lastsMs } = makeFlakes();
    setFlakes(drawn);
    const timer = window.setTimeout(() => setFlakes(null), lastsMs + 200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!flakes) return null;
  return (
    <div className={styles.layer} aria-hidden>
      {flakes.map((flake) => (
        <span key={flake.key} className={styles.flake} style={flake.style}>
          <span className={styles.sprite} style={flake.spriteStyle} />
        </span>
      ))}
    </div>
  );
}
