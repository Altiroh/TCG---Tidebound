"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import type { Gesture } from "@/features/board-preview/useTableGestures";

/** Couleur du trait : `attack` rouge, `effect` turquoise (Équipement), `sabotage` gris cendre. */
export type AimTone = "attack" | "effect" | "sabotage";

interface DragLayerProps {
  gesture: Gesture | null;
  /** Une cible valide est-elle survolée ? (le réticule se referme dessus). */
  onTarget: boolean;
  tone: AimTone;
  /** Rendu du fantôme pendant une pose (la carte en main). */
  renderGhost: (sourceId: string) => ReactNode;
}

/**
 * Couche de glisser, au-dessus de tout et en `pointer-events: none` (le
 * test de dépôt lit ce qu'il y a SOUS le pointeur) :
 *   - POSE : la carte suit le pointeur, à plat, légèrement agrandie ;
 *   - CIBLAGE : un trait en tirets relie la carte au pointeur, terminé par un
 *     réticule — même langage visuel que `DragTargetingTrail` : rouge pour
 *     une attaque, turquoise pour un effet, gris au-dessus du crâne.
 *
 * Suit le pointeur avec son PROPRE état : le plateau ne se re-rend pas à
 * chaque mouvement de souris, seulement quand la cible survolée change.
 */
export function DragLayer({ gesture, onTarget, tone, renderGhost }: DragLayerProps) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!gesture) {
      setPointer(null);
      return undefined;
    }
    setPointer(gesture.pointer);
    function onMove(e: PointerEvent) {
      setPointer({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [gesture]);

  if (!gesture || !pointer) return null;

  if (gesture.kind === "place") {
    return (
      <div
        aria-hidden
        className={styles.dragGhost}
        style={{ left: pointer.x, top: pointer.y, width: gesture.origin.width }}
      >
        {renderGhost(gesture.sourceId)}
      </div>
    );
  }

  const { x, y } = gesture.origin;
  // Carte armée au toucher, pointeur encore sur elle : pas de trait à dessiner.
  const still = Math.hypot(pointer.x - x, pointer.y - y) < 12;

  return (
    <svg aria-hidden className={`${styles.aimLayer} ${styles[`tone_${tone}`]}`}>
      {!still && (
        <>
          <line x1={x} y1={y} x2={pointer.x} y2={pointer.y} className={styles.aimLineShadow} />
          <line x1={x} y1={y} x2={pointer.x} y2={pointer.y} className={styles.aimLine} />
          <circle cx={pointer.x} cy={pointer.y} r={onTarget ? 11 : 8} className={styles.aimReticle} />
          <circle cx={pointer.x} cy={pointer.y} r={2} className={styles.aimDot} />
        </>
      )}
      <circle cx={x} cy={y} r={5} className={styles.aimDot} />
    </svg>
  );
}
