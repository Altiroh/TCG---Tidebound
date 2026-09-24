"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

/** Échantillons le long du trait : assez pour une ondulation lisse, peu pour un tracé par image. */
const SAMPLES = 36;

interface Rope {
  /** Point de courbure, qui suit le milieu du trait avec un ressort (inertie). */
  bend: { x: number; y: number };
  velocity: { x: number; y: number };
  /** Vitesse lissée du pointeur (px/image) : l'ondulation s'amplifie quand on bouge vite. */
  speed: number;
  /** Phase de l'onde, qui court de la source vers la cible. */
  phase: number;
  last: { x: number; y: number };
}

/**
 * Tracé du trait de visée : une Bézier quadratique de la source au pointeur,
 * courbée par un point qui TRAÎNE derrière le mouvement (ressort amorti), et
 * parcourue d'une onde perpendiculaire — nulle aux deux bouts, plus ample
 * quand le pointeur file. Au repos, elle ondule à peine : le trait serpente,
 * il ne tremble pas.
 */
function ropePath(origin: { x: number; y: number }, pointer: { x: number; y: number }, rope: Rope, calm: boolean): string {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  // Nombre de vagues selon la longueur : une vague tous les ~170 px.
  const waves = Math.max(1, length / 170);
  const amplitude = calm ? 0 : Math.min(24, 7 + rope.speed * 0.9) * Math.min(1, length / 160);
  let d = "";
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const u = 1 - t;
    const bx = u * u * origin.x + 2 * u * t * rope.bend.x + t * t * pointer.x;
    const by = u * u * origin.y + 2 * u * t * rope.bend.y + t * t * pointer.y;
    const offset = amplitude * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * waves * t - rope.phase);
    d += `${i === 0 ? "M" : "L"}${(bx + nx * offset).toFixed(1)} ${(by + ny * offset).toFixed(1)}`;
  }
  return d;
}

/**
 * Couche de glisser, au-dessus de tout et en `pointer-events: none` (le
 * test de dépôt lit ce qu'il y a SOUS le pointeur) :
 *   - POSE : la carte suit le pointeur, à plat, légèrement agrandie ;
 *   - CIBLAGE : un trait épais en tirets relie la carte au pointeur, terminé
 *     par un réticule — rouge pour une attaque, turquoise pour un effet,
 *     gris au-dessus du crâne. Le trait SERPENTE : il se courbe dans le
 *     sillage du mouvement (inertie), ondule d'autant plus qu'on bouge vite,
 *     et ses tirets défilent vers la cible.
 *
 * Suit le pointeur avec son PROPRE état : le plateau ne se re-rend pas à
 * chaque mouvement de souris, seulement quand la cible survolée change. Le
 * trait, lui, est retracé à chaque image directement dans le DOM (refs),
 * sans rendu React.
 */
export function DragLayer({ gesture, onTarget, tone, renderGhost }: DragLayerProps) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const shadowRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const aiming = gesture !== null && gesture.kind !== "place";

  useEffect(() => {
    if (!gesture) {
      setPointer(null);
      pointerRef.current = null;
      return undefined;
    }
    setPointer(gesture.pointer);
    pointerRef.current = gesture.pointer;
    function onMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      setPointer(pointerRef.current);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [gesture]);

  // Animation du trait : ressort du point de courbure, vitesse lissée, phase de l'onde, défilement des tirets.
  useEffect(() => {
    if (!aiming || !gesture) return undefined;
    const origin = gesture.origin;
    const calm = typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    const start = pointerRef.current ?? gesture.pointer;
    const rope: Rope = {
      bend: { x: (origin.x + start.x) / 2, y: (origin.y + start.y) / 2 },
      velocity: { x: 0, y: 0 },
      speed: 0,
      phase: 0,
      last: start,
    };
    let dash = 0;
    let frame = 0;
    const tick = () => {
      const p = pointerRef.current;
      if (p) {
        const moved = Math.hypot(p.x - rope.last.x, p.y - rope.last.y);
        rope.last = p;
        rope.speed += (moved - rope.speed) * 0.18;
        // Le point de courbure vise le milieu du trait, mais avec du retard :
        // un geste rapide laisse le trait arqué derrière lui, puis il se tend.
        const tx = (origin.x + p.x) / 2;
        const ty = (origin.y + p.y) / 2;
        rope.velocity.x = (rope.velocity.x + (tx - rope.bend.x) * 0.09) * 0.8;
        rope.velocity.y = (rope.velocity.y + (ty - rope.bend.y) * 0.09) * 0.8;
        rope.bend.x += rope.velocity.x;
        rope.bend.y += rope.velocity.y;
        if (!calm) {
          rope.phase += 0.12 + Math.min(0.35, rope.speed * 0.02);
          dash -= 1.1;
        }
        const d = ropePath(origin, p, rope, calm);
        shadowRef.current?.setAttribute("d", d);
        lineRef.current?.setAttribute("d", d);
        lineRef.current?.setAttribute("stroke-dashoffset", dash.toFixed(1));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [aiming, gesture]);

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
      {/* Le trait reste monté même immobile (tracé à chaque image par l'effet) ; seul son affichage suit `still`. */}
      <g style={{ display: still ? "none" : undefined }}>
        <path ref={shadowRef} className={styles.aimLineShadow} />
        <path ref={lineRef} className={styles.aimLine} />
      </g>
      {!still && (
        <>
          <circle cx={pointer.x} cy={pointer.y} r={onTarget ? 13 : 9} className={styles.aimReticle} />
          <circle cx={pointer.x} cy={pointer.y} r={2.5} className={styles.aimDot} />
        </>
      )}
      <circle cx={x} cy={y} r={6} className={styles.aimDot} />
    </svg>
  );
}
