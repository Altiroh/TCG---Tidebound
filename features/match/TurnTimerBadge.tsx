"use client";

import { useEffect, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import { nextTimeoutEndsGame } from "@/game";

/**
 * Le temps qui reste — affichage seul.
 *
 * Ce composant ne décide RIEN. L'échéance vient du serveur
 * (`GameState.turnTimer.deadlineAt`, posée par `game/rules/turnTimer.ts`) et
 * c'est le serveur qui, l'heure en main, constate qu'elle est passée. Ici on
 * se contente de soustraire deux nombres une fois par seconde : une horloge
 * de navigateur en avance ou en retard change ce qui est dessiné, jamais ce
 * qui se produit.
 *
 * Discret tant qu'il reste du temps, et franc quand il n'en reste plus
 * beaucoup : c'est à ce moment-là qu'un joueur a besoin de le voir.
 */

/** Sous ce seuil, le compteur passe en alerte. */
const WARNING_MS = 15_000;

interface TurnTimerBadgeProps {
  state: GameState;
  /** Le joueur qui regarde — « À toi de jouer » ne se dit pas à l'adversaire. */
  viewerId: PlayerId;
}

export function TurnTimerBadge({ state, viewerId }: TurnTimerBadgeProps) {
  const timer = state.turnTimer;
  const deadlineAt = timer?.deadlineAt;
  const [remaining, setRemaining] = useState(() => (deadlineAt ? deadlineAt - Date.now() : 0));

  useEffect(() => {
    if (deadlineAt === undefined) return;
    setRemaining(deadlineAt - Date.now());
    const id = setInterval(() => setRemaining(deadlineAt - Date.now()), 500);
    return () => clearInterval(id);
  }, [deadlineAt]);

  if (!timer || state.status !== "active") return null;

  const mine = timer.awaitingPlayerId === viewerId;
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const warning = remaining <= WARNING_MS;
  // Prévenir AVANT, jamais après : un joueur qui risque la partie au
  // prochain délai manqué doit le savoir tant qu'il peut encore agir.
  const fatal = nextTimeoutEndsGame(state, timer.awaitingPlayerId);

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-md transition-colors ${
        warning ? "border-rose-300/40 bg-rose-950/70 text-rose-100" : "border-white/20 bg-slate-950/60 text-slate-200"
      }`}
      role="timer"
      aria-live={warning ? "polite" : "off"}
    >
      {mine ? "À toi de jouer" : "Tour de l'adversaire"} · {formatRemaining(seconds)}
      {fatal && mine && <span className="ml-1.5 text-rose-200">— dernier délai</span>}
    </div>
  );
}

function formatRemaining(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
  return `${seconds} s`;
}
