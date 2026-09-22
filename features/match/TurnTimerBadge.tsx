"use client";

import { useEffect, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import { RULES, allowanceFor } from "@/game";

/**
 * Le temps qui reste avant que l'inactivité n'arrête la partie.
 *
 * Ce composant ne décide RIEN. L'échéance vient du serveur
 * (`GameState.turnTimer.deadlineAt`, posée par `game/rules/turnTimer.ts`) et
 * c'est le serveur qui, l'heure en main, constate qu'elle est passée. Ici on
 * se contente de soustraire deux nombres une fois par seconde : une horloge
 * de navigateur en avance ou en retard change ce qui est dessiné, jamais ce
 * qui se produit.
 *
 * Trois minutes, c'est long : un compteur qui hurlerait dès la première
 * seconde serait du bruit. Il reste donc DISCRET tant qu'il n'y a rien à
 * craindre, et ne prend la parole qu'aux paliers d'alerte
 * (`RULES.INACTIVITY_WARNINGS_MS`, une minute puis deux) — c'est à ce
 * moment-là qu'un joueur a besoin de le voir.
 */

interface TurnTimerBadgeProps {
  state: GameState;
  /** Le joueur qui regarde — « À toi de jouer » ne se dit pas à l'adversaire. */
  viewerId: PlayerId;
}

/** Niveau d'alerte du chrono : discret, attention, urgence. */
type Palier = "calme" | "attention" | "urgence";

/**
 * À quel palier on en est, d'après le temps ÉCOULÉ depuis le dernier geste.
 * Les paliers sont ceux du moteur : le joueur voit exactement l'échelle sur
 * laquelle il est jugé.
 */
function palierPour(ecoule: number): Palier {
  const paliers = [...RULES.INACTIVITY_WARNINGS_MS].sort((a, b) => a - b);
  const dernier = paliers[paliers.length - 1];
  if (dernier !== undefined && ecoule >= dernier) return "urgence";
  if (paliers[0] !== undefined && ecoule >= paliers[0]) return "attention";
  return "calme";
}

const STYLES: Record<Palier, string> = {
  calme: "border-white/15 bg-slate-950/50 text-slate-300/80",
  attention: "border-amber-300/40 bg-amber-950/70 text-amber-100",
  urgence: "border-rose-300/50 bg-rose-950/80 text-rose-100",
};

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
  const palier = palierPour(allowanceFor(state) - remaining);

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-md transition-colors ${STYLES[palier]}`}
      role="timer"
      aria-live={palier === "calme" ? "off" : "polite"}
    >
      {mine ? "À toi de jouer" : "Tour de l'adversaire"} · {formatRemaining(seconds)}
      {palier !== "calme" && (
        <span className="ml-1.5 font-semibold">
          {mine
            ? palier === "urgence"
              ? "— joue, ou la partie s'arrête"
              : "— sans geste, la partie s'arrêtera"
            : palier === "urgence"
              ? "— sans réponse, la partie s'arrête"
              : "— l'adversaire ne joue plus"}
        </span>
      )}
    </div>
  );
}

function formatRemaining(seconds: number): string {
  if (seconds >= 60) return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")}`;
  return `${seconds} s`;
}
