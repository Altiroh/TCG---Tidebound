"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import type { Gesture } from "@/features/match/table/useTableGestures";

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

/** Longueur de la pointe de flèche, en px. */
const HEAD = 22;

/**
 * Géométrie de la flèche de visée, à la Hearthstone : un ARC régulier de la
 * source au pointeur, bombé vers le haut de l'écran d'autant plus que le
 * trait est long, et une grande pointe orientée selon la courbe. Rien ne
 * bouge de soi-même : la flèche ne suit que le pointeur.
 */
function aimArrow(origin: { x: number; y: number }, pointer: { x: number; y: number }) {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  // Normale au trait, tournée vers le HAUT de l'écran : l'arc bombe toujours vers le haut.
  let nx = -dy / length;
  let ny = dx / length;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(150, length * 0.3);
  const control = { x: (origin.x + pointer.x) / 2 + nx * bulge, y: (origin.y + pointer.y) / 2 + ny * bulge };
  // Tangente à l'arrivée (dérivée de la Bézier en t = 1) : c'est l'axe de la pointe.
  const tx = pointer.x - control.x;
  const ty = pointer.y - control.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  // Le trait s'arrête à la base de la pointe, qui le prolonge.
  const base = { x: pointer.x - ux * HEAD * 0.8, y: pointer.y - uy * HEAD * 0.8 };
  const half = HEAD * 0.55;
  const head = [
    `${pointer.x},${pointer.y}`,
    `${pointer.x - ux * HEAD - uy * half},${pointer.y - uy * HEAD + ux * half}`,
    `${pointer.x - ux * HEAD * 0.72},${pointer.y - uy * HEAD * 0.72}`,
    `${pointer.x - ux * HEAD + uy * half},${pointer.y - uy * HEAD - ux * half}`,
  ].join(" ");
  return { path: `M${origin.x} ${origin.y} Q${control.x} ${control.y} ${base.x} ${base.y}`, head };
}

/**
 * Couche de glisser, au-dessus de tout et en `pointer-events: none` (le
 * test de dépôt lit ce qu'il y a SOUS le pointeur) :
 *   - POSE : la carte suit le pointeur, à plat, légèrement agrandie ;
 *   - CIBLAGE : une flèche en arc, à la Hearthstone — tirets fins, pointe
 *     marquée — de la carte au pointeur ; rouge pour une attaque, turquoise
 *     pour un effet, gris au-dessus du crâne. Elle ne s'anime pas d'elle-même
 *     (retour du 24/09 : un trait qui ondule en permanence fatigue l'œil).
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
  // Carte armée au toucher, pointeur encore sur elle (ou trop près pour une flèche) : rien à dessiner.
  const still = Math.hypot(pointer.x - x, pointer.y - y) < HEAD * 1.5;
  const arrow = still ? null : aimArrow(gesture.origin, pointer);

  return (
    <svg aria-hidden className={`${styles.aimLayer} ${styles[`tone_${tone}`]}`}>
      {arrow && (
        <>
          <path d={arrow.path} className={styles.aimLineShadow} />
          <path d={arrow.path} className={styles.aimLine} />
          <polygon points={arrow.head} className={styles.aimHead} />
          {onTarget && <circle cx={pointer.x} cy={pointer.y} r={16} className={styles.aimReticle} />}
        </>
      )}
      <circle cx={x} cy={y} r={6} className={styles.aimDot} />
    </svg>
  );
}
