"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import type { Gesture } from "@/features/match/table/useTableGestures";

/** Couleur du trait : `attack` rouge, `effect` turquoise (Équipement), `sabotage` gris cendre. */
/** `effect` : effet nuisible (rouge orangé) ; `boon` : effet bienfaisant (bleu). */
export type AimTone = "attack" | "effect" | "boon" | "sabotage";

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
/**
 * LA CARTE QUI FLOTTE (retour du 12/10/2026) : la carte glissée ne colle plus
 * au pointeur comme un tampon. Elle le suit avec un soupçon de retard, et
 * BASCULE selon sa vitesse — penchée dans le sens du mouvement, inclinée en
 * profondeur, puis elle se remet d'aplomb quand le geste ralentit. Calculé à
 * chaque image et écrit directement sur l'élément : aucun rendu React par
 * mouvement.
 */
function useFloatingGhost(active: boolean, start: { x: number; y: number } | null) {
  const anchor = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !start) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let target = { ...start };
    let pos = { ...start };
    let last = { ...start };
    let vel = { x: 0, y: 0 };
    let angle = { z: 0, x: 0, y: 0 };
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      target = { x: e.clientX, y: e.clientY };
    };
    const step = () => {
      // Suivi amorti : la carte rattrape le pointeur, elle ne s'y téléporte pas.
      pos = reduce ? target : { x: pos.x + (target.x - pos.x) * 0.38, y: pos.y + (target.y - pos.y) * 0.38 };
      const instant = { x: pos.x - last.x, y: pos.y - last.y };
      last = pos;
      vel = { x: vel.x + (instant.x - vel.x) * 0.25, y: vel.y + (instant.y - vel.y) * 0.25 };
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      const want = reduce ? { z: 0, x: 0, y: 0 } : { z: clamp(vel.x * 1.1, 16), y: clamp(vel.x * 1.6, 24), x: clamp(-vel.y * 1.6, 24) };
      angle = { z: angle.z + (want.z - angle.z) * 0.18, x: angle.x + (want.x - angle.x) * 0.18, y: angle.y + (want.y - angle.y) * 0.18 };
      if (anchor.current) anchor.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      if (tilt.current) tilt.current.style.transform = `perspective(700px) rotateX(${angle.x.toFixed(2)}deg) rotateY(${angle.y.toFixed(2)}deg) rotateZ(${angle.z.toFixed(2)}deg)`;
      frame = window.requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", onMove);
    frame = window.requestAnimationFrame(step);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
    // `start` est lu une fois, à la prise de la carte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return { anchor, tilt };
}

export function DragLayer({ gesture, onTarget, tone, renderGhost }: DragLayerProps) {
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const floating = useFloatingGhost(gesture?.kind === "place", gesture?.pointer ?? null);

  useEffect(() => {
    if (!gesture) {
      setPointer(null);
      return undefined;
    }
    setPointer(gesture.pointer);
    // Un rendu par image, pas par événement : un écran tactile en envoie
    // bien plus que la souris, et chacun re-rendait la carte fantôme.
    let frame: number | null = null;
    let latest = gesture.pointer;
    function onMove(e: PointerEvent) {
      latest = { x: e.clientX, y: e.clientY };
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        setPointer(latest);
      });
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [gesture]);

  if (!gesture || !pointer) return null;

  if (gesture.kind === "place") {
    return (
      // Le pointeur déplace l'ANCRE par `transform` (composité, sans mise en
      // page) ; la carte et son ombre, dessous, ne changent pas d'une image
      // à l'autre — le navigateur n'a plus à repeindre son flou.
      <div ref={floating.anchor} aria-hidden className={styles.dragGhostAnchor} style={{ transform: `translate3d(${gesture.pointer.x}px, ${gesture.pointer.y}px, 0)` }}>
        <div
          // Au doigt, la carte flotte AU-DESSUS du pouce, agrandie : centrée
          // dessous, le pouce cachait à la fois la carte et l'emplacement visé.
          className={gesture.touch ? `${styles.dragGhost} ${styles.dragGhostTouch}` : styles.dragGhost}
          style={{ width: gesture.origin.width }}
        >
          {/* La bascule, à part de la position : la carte penche dans le sens du geste. */}
          <div ref={floating.tilt} className={styles.dragTilt}>
            {renderGhost(gesture.sourceId)}
          </div>
        </div>
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
