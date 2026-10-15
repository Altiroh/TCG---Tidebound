"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/features/shell/ScrollArea.module.css";

interface ScrollAreaProps {
  children: ReactNode;
  /** La boîte qui défile : sa hauteur doit être contrainte par son parent (flex `min-height: 0`, hauteur fixe…). */
  className?: string;
  /** La mise en page du CONTENU (gap, grille…) : posée sur l'enveloppe intérieure, pas sur la boîte qui défile. */
  contentClassName?: string;
  style?: CSSProperties;
}

/** Hauteur minimale du curseur, pour qu'il reste saisissable sur une très longue liste. */
const MIN_THUMB_PX = 28;

/**
 * BARRE DE DÉFILEMENT DU JEU (15/10/2026) : un rail fin et un curseur cyan
 * à HALO, de la même famille que le halo des cartes prêtes à attaquer
 * (cœur clair, lueur, liseré qui vacille).
 *
 * Dessinée par-dessus le contenu plutôt que par le navigateur : la barre
 * native ne prend ni lueur ni animation partout (Firefox n'accepte qu'une
 * couleur, Safari iOS la cache). La barre native est masquée, le
 * défilement reste celui du navigateur (molette, doigt, clavier, inertie) ;
 * le curseur suit, se saisit et se glisse, et un clic sur le rail saute
 * d'une page.
 */
export function ScrollArea({ children, className, contentClassName, style }: ScrollAreaProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ size: number; offset: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startScroll: number } | null>(null);

  const measure = useCallback(() => {
    const box = viewport.current;
    if (!box) return;
    const { clientHeight, scrollHeight, scrollTop } = box;
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null);
      return;
    }
    const size = Math.max(MIN_THUMB_PX, (clientHeight / scrollHeight) * clientHeight);
    const offset = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - size);
    setThumb((current) => (current && Math.abs(current.size - size) < 0.5 && Math.abs(current.offset - offset) < 0.5 ? current : { size, offset }));
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [measure]);

  function onThumbDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !viewport.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startScroll: viewport.current.scrollTop };
    setDragging(true);
  }

  function onThumbMove(event: React.PointerEvent<HTMLDivElement>) {
    const box = viewport.current;
    if (!drag.current || !box || !thumb) return;
    const travel = box.clientHeight - thumb.size;
    if (travel <= 0) return;
    const ratio = (box.scrollHeight - box.clientHeight) / travel;
    box.scrollTop = drag.current.startScroll + (event.clientY - drag.current.startY) * ratio;
  }

  function onThumbUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  /** Clic sur le rail, hors du curseur : une page vers le haut ou vers le bas. */
  function onRailDown(event: React.PointerEvent<HTMLDivElement>) {
    const box = viewport.current;
    if (event.button !== 0 || !box || !thumb) return;
    const railTop = event.currentTarget.getBoundingClientRect().top;
    const direction = event.clientY - railTop < thumb.offset ? -1 : 1;
    box.scrollBy({ top: direction * box.clientHeight * 0.9, behavior: "smooth" });
  }

  return (
    <div className={`${styles.area} ${className ?? ""}`} style={style}>
      <div ref={viewport} className={styles.viewport} onScroll={measure}>
        <div ref={content} className={contentClassName}>
          {children}
        </div>
      </div>
      {thumb && (
        <div className={styles.rail} aria-hidden onPointerDown={onRailDown}>
          <div
            className={styles.thumb}
            data-dragging={dragging || undefined}
            style={{ height: thumb.size, transform: `translateY(${thumb.offset}px)` }}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={onThumbUp}
          />
        </div>
      )}
    </div>
  );
}
