"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "@/features/progression/GiftOpening.module.css";

/** Durée de la scène avant la révélation des récompenses. */
export const GIFT_OPEN_MS = 1900;

/**
 * Le colis d'un mécène, ouvert au centre de l'écran : le coffret arrive
 * dans la lumière de SA couleur, tremble, le couvercle saute (vue éclatée
 * `mecenes/coffret/`, caisse + couvercle), puis la révélation prend le
 * relais. Rien à cliquer : la scène dure moins de deux secondes.
 */
export function GiftOpening({ color, name, onDone }: { color?: string; name?: string | null; onDone: () => void }) {
  const [phase, setPhase] = useState<"arrive" | "shake" | "burst">("arrive");
  // Le portail vise `document.body` : rien côté serveur, sans quoi l'hydratation diverge.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("shake"), 380),
      setTimeout(() => setPhase("burst"), 1000),
      // Un souffle de plus que la révélation : elle se pose par-dessus, sans trou.
      setTimeout(onDone, GIFT_OPEN_MS + 300),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className={styles.scene} data-color={color} data-phase={phase} role="status" aria-label={`Un colis${name ? ` de ${name}` : ""} s'ouvre`}>
      <div className={styles.box}>
        <span className={styles.glow} aria-hidden />
        {phase === "burst" && <span className={styles.rays} aria-hidden />}
        {/* eslint-disable @next/next/no-img-element -- calques du coffret, animés séparément */}
        {phase === "burst" ? (
          <>
            <img className={styles.base} src="/assets/mecenes/coffret/coffret-caisse.webp" alt="" draggable={false} />
            <img className={styles.lid} src="/assets/mecenes/coffret/coffret-couvercle.webp" alt="" draggable={false} />
          </>
        ) : (
          <img className={styles.closed} src="/assets/mecenes/coffret/coffret-ferme.webp" alt="" draggable={false} />
        )}
        {/* eslint-enable @next/next/no-img-element */}
      </div>
      {name && <p className={styles.caption}>Un colis de {name}</p>}
    </div>,
    document.body
  );
}
