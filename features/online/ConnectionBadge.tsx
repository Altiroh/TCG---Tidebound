"use client";

import { useEffect, useRef, useState } from "react";
import type { OpponentPresence } from "@/features/online/connection";

/**
 * Ce que la connexion fait à la partie, dit en une ligne — sous le chrono
 * (`TurnTimerBadge`), dans la même pastille.
 *
 *  - Hors ligne : la partie attend le réseau, et les coups joués avec elle.
 *  - Adversaire parti : il a quitté la table (onglet fermé, réseau perdu).
 *    Le chrono dit déjà ce que coûtera son absence ; ici on dit qu'il n'est
 *    plus là, pour qu'on n'attende pas un joueur qui réfléchit.
 *  - Adversaire revenu : annoncé brièvement, puis la pastille s'efface.
 *
 * Rien ici ne décide : la présence est un signal d'affichage
 * (`features/online/connection.ts`).
 */

interface ConnectionBadgeProps {
  offline: boolean;
  /** `unknown` contre le bot, ou tant que le canal n'a rien dit : rien à afficher. */
  opponent: OpponentPresence;
  /** Partie terminée : plus rien à attendre de personne. */
  finished: boolean;
}

/** Durée d'affichage de « L'adversaire est de retour ». */
const BACK_NOTICE_MS = 4_000;

export function ConnectionBadge({ offline, opponent, finished }: ConnectionBadgeProps) {
  const [backNotice, setBackNotice] = useState(false);
  const previous = useRef(opponent);
  useEffect(() => {
    const wasAway = previous.current === "away";
    previous.current = opponent;
    if (!wasAway || opponent !== "present") return;
    setBackNotice(true);
    const id = setTimeout(() => setBackNotice(false), BACK_NOTICE_MS);
    return () => clearTimeout(id);
  }, [opponent]);

  if (finished) return null;

  const message = offline
    ? { text: "Hors ligne — la partie reprendra au retour du réseau", style: "border-rose-300/50 bg-rose-950/85 text-rose-100" }
    : opponent === "away"
      ? { text: "L'adversaire a quitté la table", style: "border-amber-300/40 bg-amber-950/80 text-amber-100" }
      : backNotice
        ? { text: "L'adversaire est de retour", style: "border-emerald-300/40 bg-emerald-950/80 text-emerald-100" }
        : null;
  if (!message) return null;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-11 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-medium backdrop-blur-md ${message.style}`}
      role="status"
      aria-live="polite"
    >
      {message.text}
    </div>
  );
}
