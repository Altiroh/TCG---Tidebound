"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game";
import { formatEvent } from "@/features/match/formatEvent";

export interface ActionToast {
  id: number;
  text: string;
}

/** Doit rester synchronisée avec la durée de l'animation `toast-in` (`tailwind.config.ts`). */
const TOAST_DURATION_MS = 2200;

/**
 * Types d'événements qui n'ont sinon AUCUNE trace visuelle immédiate à
 * l'écran — particulièrement les actions de l'ADVERSAIRE (sa main/son
 * cimetière changent silencieusement sinon, contrairement à ses propres
 * cartes qu'on voit physiquement se déplacer) : pioche, défausse/
 * Sabordage/destruction (toutes trois via `CARD_MOVED`/`SABORDED`/
 * `DESTROY`, qui rejoignent le cimetière).
 */
const RELEVANT_TYPES = new Set(["DRAW_CARD", "CARD_MOVED", "SABORDED", "DESTROY"]);

/**
 * Notifications éphémères dérivées de `state.eventLog` (déjà utilisé par
 * `EventFeed` pour le fil de lecture texte) plutôt qu'un flux d'événements
 * séparé — ce fil restait trop discret dans un coin de l'écran pour que le
 * joueur remarque une pioche/défausse/Sabordage adverse en pratique.
 */
export function useActionToasts(state: GameState): ActionToast[] {
  const [toasts, setToasts] = useState<ActionToast[]>([]);
  const lastSeenLength = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    const newEvents = state.eventLog.slice(lastSeenLength.current);
    lastSeenLength.current = state.eventLog.length;
    if (newEvents.length === 0) return;

    const relevant = newEvents.filter((event) => RELEVANT_TYPES.has(event.type));
    if (relevant.length === 0) return;

    const created = relevant.map((event) => ({ id: nextId.current++, text: formatEvent(state, event) }));
    setToasts((current) => [...current, ...created]);

    created.forEach((toast) => {
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== toast.id));
      }, TOAST_DURATION_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit se déclencher que sur une nouvelle longueur de journal, pas à chaque nouvelle référence de `state`.
  }, [state.eventLog.length]);

  useEffect(() => {
    lastSeenLength.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialisation volontaire au (re)montage uniquement.
  }, []);

  return toasts;
}
