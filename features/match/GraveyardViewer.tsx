"use client";

import { useEffect } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
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
 * (`CardInstance.graveyardCause`). N'est jamais une action de jeu : ne
 * consomme rien, n'interrompt aucune résolution en cours — un simple
 * overlay de lecture, fermé sur clic du fond, Échap, ou le bouton Fermer.
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
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Cimetière — {playerLabel} ({cards.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-white/10 hover:text-board-accent"
          >
            Fermer
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {cards.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Ce cimetière est vide.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {cards.map((card) => {
                const def = getCardDefinition(card.cardId);
                return (
                  <div
                    key={card.instanceId}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 p-2"
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element -- vignette locale, une par carte */}
                      <img
                        src={`/assets/cards/illustrations/${card.cardId}.png`}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-100">{def.name}</p>
                      {card.graveyardCause && (
                        <p className={`text-[10px] font-semibold uppercase tracking-wide ${GRAVEYARD_CAUSE_COLORS[card.graveyardCause]}`}>
                          {GRAVEYARD_CAUSE_LABELS[card.graveyardCause]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
