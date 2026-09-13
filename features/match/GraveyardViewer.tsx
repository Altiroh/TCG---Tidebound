"use client";

import { useEffect } from "react";
import type { CardInstance } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { GRAVEYARD_CAUSE_COLORS, GRAVEYARD_CAUSE_LABELS } from "@/features/match/cardDisplay";

interface GraveyardViewerProps {
  playerLabel: string;
  cards: CardInstance[];
  onClose: () => void;
}

/**
 * Vue de consultation du cimetière (Notion "Moteur de partie", section
 * "Défausse — consultation et traçabilité") : liste toutes les cartes
 * ayant quitté le jeu pour ce joueur, avec leur cause de sortie
 * (`CardInstance.graveyardCause`), en grandes cartes sur une rangée qui défile
 * sur le côté (`CardCarousel` : molette, glisser, flèches). N'est jamais une action de jeu : ne consomme rien,
 * n'interrompt aucune résolution en cours — un simple overlay de
 * lecture, fermé sur clic du fond, Échap, ou le bouton Fermer. Ouvrable
 * pour soi comme pour l'adversaire (`onOpenGraveyard` sur `CargoCluster`).
 */
export function GraveyardViewer({ playerLabel, cards, onClose }: GraveyardViewerProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-md"
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

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        {/* Reflet du haut, façon verre liquide (même traitement que CardInfoPanel/Collection) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />

        <div className="relative flex flex-col items-center gap-1 px-6 pb-4 pt-8 text-center">
          <h2 className="text-2xl font-semibold uppercase tracking-wider text-white [font-family:var(--font-card-title)]">
            Cimetière
          </h2>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {playerLabel}
            {cards.length > 0 ? ` · ${cards.length} carte${cards.length > 1 ? "s" : ""}` : ""}
          </p>
        </div>

        <div className="relative pb-6">
          <CardCarousel
            // Les plus récentes d'abord : la dernière carte partie au cimetière est la première visible.
            cards={[...cards].reverse()}
            emptyLabel="Ce cimetière est vide."
            renderCaption={(card) =>
              card.graveyardCause ? (
                <p className={`text-xs font-semibold uppercase tracking-wide ${GRAVEYARD_CAUSE_COLORS[card.graveyardCause]}`}>
                  {GRAVEYARD_CAUSE_LABELS[card.graveyardCause]}
                </p>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  );
}
