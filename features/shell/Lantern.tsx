"use client";

import { useState, type CSSProperties } from "react";
import styles from "@/features/shell/Lantern.module.css";

/** Volutes de fumée de la lanterne soufflée : dérive (%), taille (%), départ (s). */
const SMOKE = [
  { dx: -18, size: 30, delay: 0 },
  { dx: 12, size: 26, delay: 0.08 },
  { dx: -6, size: 36, delay: 0.18 },
  { dx: 22, size: 30, delay: 0.3 },
  { dx: -24, size: 24, delay: 0.42 },
  { dx: 4, size: 40, delay: 0.55 },
  { dx: 14, size: 22, delay: 0.75 },
];

interface LanternProps {
  lit: boolean;
  onToggle: () => void;
  /** La lanterne allumée et la même, soufflée — au même cadrage. */
  litSrc: string;
  outSrc: string;
  /** Place et taille dans la scène (le composant ne se positionne pas lui-même). */
  className?: string;
}

/**
 * UNE LANTERNE qu'on souffle et qu'on rallume (Mécènes, écran Jouer) : elle
 * se balance, sa flamme vacille, un halo chaud respire derrière le verre.
 * Un clic la souffle — la flamme hésite puis meurt, une fumée monte des
 * évents du chapeau ; un autre la rallume dans un éclat. La LUMIÈRE qu'elle
 * jette sur la scène, et l'obscurité quand elle s'éteint, restent à la
 * scène (elle connaît son décor) : elle lit `lit`, qu'elle possède.
 */
export function Lantern({ lit, onToggle, litSrc, outSrc, className }: LanternProps) {
  // Chaque extinction remonte la fumée (nouvelle clé), pour qu'elle rejoue.
  const [puff, setPuff] = useState(0);
  return (
    <button
      type="button"
      className={`${styles.lantern}${className ? ` ${className}` : ""}`}
      data-lit={lit || undefined}
      aria-pressed={lit}
      aria-label={lit ? "Souffler la lanterne" : "Rallumer la lanterne"}
      onClick={() => {
        if (lit) setPuff((value) => value + 1);
        onToggle();
      }}
    >
      <span className={styles.swing}>
        <span className={styles.glow} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.off} src={outSrc} alt="" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
        <img className={styles.on} src={litSrc} alt="" draggable={false} />
        {puff > 0 && !lit && (
          <span key={puff} className={styles.smoke} aria-hidden>
            {SMOKE.map((wisp, index) => (
              <span
                key={index}
                className={styles.wisp}
                style={{ "--dx": `${wisp.dx}%`, "--size": `${wisp.size}%`, animationDelay: `${wisp.delay}s` } as CSSProperties}
              />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
