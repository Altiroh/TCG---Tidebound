"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardInstance } from "@/game";
import { CardTile } from "@/features/match/CardTile";

interface CardCarouselProps {
  cards: CardInstance[];
  /** Légende sous chaque carte (ex: cause de sortie du cimetière). */
  renderCaption?: (card: CardInstance) => ReactNode;
  /** Mode sélection : un clic choisit la carte (cadre lumineux sur la carte choisie). */
  selectedInstanceId?: string | null;
  onSelect?: (card: CardInstance) => void;
  emptyLabel?: string;
}

const SCROLL_STEP_PX = 420;

/**
 * Rangée horizontale de grandes cartes, faite pour "slider" sur le côté :
 * défilement à la molette (vertical converti en horizontal), glisser à la
 * souris ou au doigt, flèches latérales, et accroche douce sur chaque carte
 * (`scroll-snap`). Partagée par la vue du cimetière (`GraveyardViewer`) et le
 * choix d'une carte de défausse (`GraveyardPickPrompt`).
 */
export function CardCarousel({ cards, renderCaption, selectedInstanceId, onSelect, emptyLabel = "Aucune carte." }: CardCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });

  function updateEdges() {
    const el = trackRef.current;
    if (!el) return;
    setEdges({ atStart: el.scrollLeft <= 2, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return undefined;
    // `wheel` natif non passif : React enregistre ses gestionnaires en passif, qui ne peuvent pas empêcher le défilement vertical.
    function handleWheel(event: WheelEvent) {
      if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      el.scrollBy({ left: event.deltaY, behavior: "auto" });
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", updateEdges);
    };
  }, [cards.length]);

  function scrollByStep(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: "smooth" });
  }

  if (cards.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-sm text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={updateEdges}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = { startX: event.clientX, startScroll: trackRef.current?.scrollLeft ?? 0, moved: false };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          const el = trackRef.current;
          if (!state || !el) return;
          const dx = event.clientX - state.startX;
          if (Math.abs(dx) > 4) state.moved = true;
          if (state.moved) el.scrollLeft = state.startScroll - dx;
        }}
        onPointerUp={() => {
          // Laisse le `click` qui suit savoir s'il s'agissait d'un glissement (à ignorer) ou d'un vrai clic.
          setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => (drag.current = null)}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-12 pb-4 pt-2 [scrollbar-width:thin]"
        style={{ scrollPaddingInline: 48 }}
      >
        {cards.map((card) => {
          const selected = selectedInstanceId === card.instanceId;
          return (
            <div key={card.instanceId} className="flex w-44 shrink-0 snap-center flex-col items-center gap-2 text-center sm:w-52">
              <div
                className={`w-full rounded-xl transition-transform duration-150 ${onSelect ? "cursor-pointer hover:-translate-y-1" : ""} ${
                  selected ? "ring-2 ring-board-accent ring-offset-2 ring-offset-black/60" : ""
                }`}
                onClick={() => {
                  if (drag.current?.moved) return;
                  onSelect?.(card);
                }}
              >
                {/* `CardTile` sans `onClick` rend un bouton désactivé, qui avalerait clics et glissements : on les capte
                    sur ce conteneur (les badges de statut restent survolables, ils réactivent leurs propres pointer-events). */}
                <div className="pointer-events-none">
                  <CardTile instance={card} tideState="calme" widthClassName="w-full" scaleOnHover={false} badgeSize={44} />
                </div>
              </div>
              {renderCaption?.(card)}
            </div>
          );
        })}
      </div>

      {!edges.atStart && (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          aria-label="Cartes précédentes"
          className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-slate-200 shadow-lg transition-colors hover:border-board-accent hover:text-board-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {!edges.atEnd && (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          aria-label="Cartes suivantes"
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/70 text-slate-200 shadow-lg transition-colors hover:border-board-accent hover:text-board-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
