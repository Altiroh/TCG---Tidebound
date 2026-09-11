"use client";

import { useEffect } from "react";
import type { CardInstance, TideStateName } from "@/game";
import { CardInfoPanel } from "@/features/match/CardInfoPanel";
import { CardTile } from "@/features/match/CardTile";

interface CardDetailModalProps {
  instance: CardInstance;
  tideState: TideStateName;
  onClose: () => void;
}

/**
 * Détail d'une carte de plateau — même composition que la fiche agrandie de
 * la Collection (`CollectionScreen`, carte + `CardInfoPanel`) mais sans le glow
 * coloré derrière le panneau (`showGlow={false}`) : ouvert au clic sur une
 * carte posée plutôt qu'au survol (plus de "hover scale" sur le plateau).
 */
export function CardDetailModal({ instance, tideState, onClose }: CardDetailModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center gap-8 bg-black/70 p-8 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-6 top-6 z-[60] flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] transition-colors hover:bg-white/10 hover:text-board-accent"
      >
        Fermer
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>

      <div onClick={(e) => e.stopPropagation()}>
        <CardTile instance={instance} tideState={tideState} widthClassName="w-80 sm:w-96" scaleOnHover={false} badgeSize={90} />
      </div>
      <div className="-my-8 hidden self-stretch sm:block" onClick={(e) => e.stopPropagation()}>
        <CardInfoPanel cardId={instance.cardId} showGlow={false} />
      </div>
    </div>
  );
}
