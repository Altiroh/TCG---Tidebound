"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/features/match/NewMatch.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckCarouselProps {
  label: string;
  /** Une tuile par deck — chacune se cale sur la grille d'accroche du carrousel. */
  children: ReactNode;
  /** Change quand la liste change (onglet) : le carrousel revient au début. */
  resetKey: string;
}

/** Au-delà de ce déplacement, un appui devient un glisser et n'est plus un clic. */
const DRAG_THRESHOLD_PX = 6;

/**
 * Rangée de decks qui défile de droite à gauche.
 *
 * Tous les gestes attendus d'un client de jeu : flèches de part et d'autre,
 * molette (verticale comprise — la souris la plus courante n'a pas de
 * molette horizontale), glisser à la souris ou au doigt, flèches du clavier.
 * Chaque tuile s'accroche au bord gauche (`scroll-snap`) : on ne s'arrête
 * jamais sur une tuile coupée en deux.
 *
 * Un glisser ne doit pas sélectionner la tuile sous le pointeur au moment où
 * on la relâche : le clic qui suit un glisser est avalé.
 */
export function DeckCarousel({ label, children, resetKey }: DeckCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const drag = useRef<{ x: number; scroll: number; moved: boolean; id: number } | null>(null);
  const swallowClick = useRef(false);

  const update = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanPrev(track.scrollLeft > 2);
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollLeft = 0;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [resetKey, update]);

  // Molette : défilement horizontal. Écouteur natif non passif, pour pouvoir
  // empêcher la page de défiler pendant qu'on parcourt la rangée.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    function onWheel(event: WheelEvent) {
      if (!track || track.scrollWidth <= track.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const atStart = track.scrollLeft <= 0 && delta < 0;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1 && delta > 0;
      if (atStart || atEnd) return;
      event.preventDefault();
      track.scrollBy({ left: delta, behavior: "auto" });
    }
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, []);

  function page(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;
    playButtonClick();
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className={styles.carousel}>
      <button type="button" className={styles.carouselArrow} data-side="prev" onClick={() => page(-1)} disabled={!canPrev} aria-label="Decks précédents">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        ref={trackRef}
        className={styles.carouselTrack}
        role="listbox"
        aria-label={label}
        aria-orientation="horizontal"
        onScroll={update}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") trackRef.current?.scrollBy({ left: 240, behavior: "smooth" });
          if (event.key === "ArrowLeft") trackRef.current?.scrollBy({ left: -240, behavior: "smooth" });
        }}
        onPointerDown={(event) => {
          // Le doigt défile nativement ; seul le glisser à la souris est pris en charge ici.
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = { x: event.clientX, scroll: trackRef.current?.scrollLeft ?? 0, moved: false, id: event.pointerId };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          const track = trackRef.current;
          if (!state || !track || state.id !== event.pointerId) return;
          const dx = event.clientX - state.x;
          if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          if (!state.moved) {
            state.moved = true;
            track.setPointerCapture(event.pointerId);
            track.dataset.dragging = "true";
          }
          track.scrollLeft = state.scroll - dx;
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          const track = trackRef.current;
          drag.current = null;
          if (!state || !track) return;
          if (state.moved) {
            swallowClick.current = true;
            track.releasePointerCapture(event.pointerId);
            delete track.dataset.dragging;
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (trackRef.current) delete trackRef.current.dataset.dragging;
        }}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>

      <button type="button" className={styles.carouselArrow} data-side="next" onClick={() => page(1)} disabled={!canNext} aria-label="Decks suivants">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
