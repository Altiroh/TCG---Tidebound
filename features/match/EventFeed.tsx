"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "@/game";
import { formatEvent } from "@/features/match/formatEvent";

const VISIBLE_COUNT = 10;
/** Événements trop bavards/redondants pour un fil de lecture — déjà visibles ailleurs à l'écran (jauges, bannière de phase). */
const SKIPPED_TYPES = new Set(["TURN_STARTED", "PHASE_CHANGED"]);

/**
 * Fil des événements récents (Notion "Moteur de partie", section
 * "Lisibilité de la chaîne") : traduit `state.eventLog` en une liste
 * lisible, pour que le joueur comprenne toujours "pourquoi quelque chose
 * vient de se produire" sans avoir à deviner l'enchaînement d'effets
 * automatiques/réactions qui vient de se résoudre. Défilement automatique
 * vers le dernier événement.
 */
export function EventFeed({ state }: { state: GameState }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const recent = state.eventLog.filter((e) => !SKIPPED_TYPES.has(e.type)).slice(-VISIBLE_COUNT);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.eventLog.length]);

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col gap-1 overflow-y-auto rounded-md border border-white/10 bg-black/70 p-2 text-[10px] leading-snug text-slate-300"
    >
      {recent.length === 0 ? (
        <p className="text-slate-600">Aucun événement pour l&apos;instant.</p>
      ) : (
        recent.map((event, i) => (
          <p key={`${event.timestamp}-${i}`} className="truncate">
            {formatEvent(state, event)}
          </p>
        ))
      )}
    </div>
  );
}
