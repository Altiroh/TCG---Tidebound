"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardInstance, GraveyardCause } from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { GRAVEYARD_CAUSE_LABELS } from "@/features/match/cardDisplay";
import sheet from "@/features/match/table/TableSheet.module.css";

interface GraveyardViewerProps {
  playerLabel: string;
  cards: CardInstance[];
  onClose: () => void;
  /** Clic droit sur une carte : sa fiche détaillée. */
  onInspect?: (card: CardInstance) => void;
}

const CAUSE_ORDER: readonly GraveyardCause[] = ["destroyed", "scuttled", "discarded", "expired"];

/**
 * Consultation du cimetière (Notion "Moteur de partie", section "Défausse —
 * consultation et traçabilité") : toutes les cartes sorties du jeu pour ce
 * joueur, en VRAIES cartes, comme sur la table, chacune avec la cause de sa
 * sortie. Les plus récentes d'abord ; un filtre par cause quand il y a de
 * quoi trier.
 *
 * Jamais une action de jeu : ne consomme rien, n'interrompt aucune
 * résolution. Fermé sur clic du fond, Échap, ou la croix. Ouvrable pour soi
 * comme pour l'adversaire.
 */
export function GraveyardViewer({ playerLabel, cards, onClose, onInspect }: GraveyardViewerProps) {
  const [cause, setCause] = useState<GraveyardCause | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const counts = useMemo(() => {
    const map = new Map<GraveyardCause, number>();
    for (const card of cards) if (card.graveyardCause) map.set(card.graveyardCause, (map.get(card.graveyardCause) ?? 0) + 1);
    return map;
  }, [cards]);

  // Les plus récentes d'abord : la dernière carte partie est la première visible.
  const shown = useMemo(() => [...cards].reverse().filter((card) => !cause || card.graveyardCause === cause), [cards, cause]);

  return (
    <div className={sheet.backdrop} onClick={onClose} role="presentation">
      <div className={sheet.sheet} role="dialog" aria-modal aria-label={`Cimetière — ${playerLabel}`} onClick={(event) => event.stopPropagation()}>
        <header className={sheet.head}>
          {/* eslint-disable-next-line @next/next/no-img-element -- le crâne de la défausse du plateau */}
          <img src="/assets/board/graveyard-skull.webp" alt="" aria-hidden className={sheet.headIcon} />
          <div className={sheet.headText}>
            <h2 className={sheet.title}>Cimetière</h2>
            <p className={sheet.subtitle}>
              {playerLabel} · {cards.length} carte{cards.length > 1 ? "s" : ""}
              {onInspect && cards.length > 0 ? " · clic droit : fiche" : ""}
            </p>
          </div>
          <button type="button" className={sheet.close} onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {counts.size > 1 && (
          <div className={sheet.filters} role="group" aria-label="Filtrer par cause">
            <button type="button" className={sheet.filter} aria-pressed={cause === null} onClick={() => setCause(null)}>
              Toutes <span className={sheet.filterCount}>{cards.length}</span>
            </button>
            {CAUSE_ORDER.filter((entry) => counts.has(entry)).map((entry) => (
              <button key={entry} type="button" className={sheet.filter} aria-pressed={cause === entry} onClick={() => setCause(cause === entry ? null : entry)}>
                <span className={sheet.cause} data-cause={entry}>
                  {GRAVEYARD_CAUSE_LABELS[entry]}
                </span>
                <span className={sheet.filterCount}>{counts.get(entry)}</span>
              </button>
            ))}
          </div>
        )}

        <div className={sheet.body}>
          {cards.length === 0 ? (
            <div className={sheet.empty}>
              {/* eslint-disable-next-line @next/next/no-img-element -- icône décorative */}
              <img src="/assets/board/graveyard-skull.webp" alt="" aria-hidden className={sheet.emptySkull} />
              Aucune carte n&apos;a encore quitté le jeu.
            </div>
          ) : (
            <CardCarousel
              cards={shown}
              emptyLabel="Aucune carte pour cette cause."
              onInspect={onInspect}
              renderCaption={(card) =>
                card.graveyardCause ? (
                  <span className={sheet.cause} data-cause={card.graveyardCause}>
                    {GRAVEYARD_CAUSE_LABELS[card.graveyardCause]}
                  </span>
                ) : null
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
