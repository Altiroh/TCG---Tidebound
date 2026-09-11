"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game";

export interface CardFlight {
  id: number;
  playerId: PlayerId;
  /** "draw" : pioche → main. "toGraveyard" : plateau/main → cimetière (défausse, Sabordage, destruction). */
  kind: "draw" | "toGraveyard";
}

/** Doit rester cohérente avec la durée de transition posée sur `CardFlightLayer`. */
export const FLIGHT_DURATION_MS = 650;

/** Cherche le propriétaire d'une instance de carte dans TOUTES les zones des deux joueurs — `CARD_MOVED`/`DESTROY` ne portent pas de `playerId` contrairement à `DRAW_CARD`/`SABORDED`. */
function findCardOwner(state: GameState, instanceId: string): PlayerId | undefined {
  for (const player of state.players) {
    if (
      player.hand.some((c) => c.instanceId === instanceId) ||
      player.board.some((c) => c.instanceId === instanceId) ||
      player.graveyard.some((c) => c.instanceId === instanceId) ||
      player.deck.some((c) => c.instanceId === instanceId)
    ) {
      return player.id;
    }
  }
  return undefined;
}

/**
 * Anime le DÉPLACEMENT des cartes entre zones (pioche → main, plateau/main →
 * cimetière) — dérivé de `state.eventLog` comme `useActionToasts`, mais
 * pour un effet visuel de "carte qui vole" plutôt qu'une notification
 * texte : le joueur voit une carte se déplacer physiquement à l'écran,
 * aussi bien pour ses propres pioches/défausses/Sabordages que pour ceux
 * de l'adversaire (dos de carte uniquement, jamais la face — l'info
 * cachée d'une pioche adverse ne doit jamais fuiter par l'animation).
 */
export function useCardFlights(state: GameState): CardFlight[] {
  const [flights, setFlights] = useState<CardFlight[]>([]);
  const lastSeenLength = useRef(0);
  const nextId = useRef(0);

  useEffect(() => {
    const newEvents = state.eventLog.slice(lastSeenLength.current);
    lastSeenLength.current = state.eventLog.length;
    if (newEvents.length === 0) return;

    const created: CardFlight[] = [];
    for (const event of newEvents) {
      if (event.type === "DRAW_CARD") {
        created.push({ id: nextId.current++, playerId: event.playerId, kind: "draw" });
      } else if (event.type === "SABORDED") {
        created.push({ id: nextId.current++, playerId: event.playerId, kind: "toGraveyard" });
      } else if (event.type === "CARD_MOVED" && event.toZone === "graveyard") {
        const ownerId = findCardOwner(state, event.instanceId);
        if (ownerId) created.push({ id: nextId.current++, playerId: ownerId, kind: "toGraveyard" });
      } else if (event.type === "DESTROY") {
        const ownerId = findCardOwner(state, event.instanceId);
        if (ownerId) created.push({ id: nextId.current++, playerId: ownerId, kind: "toGraveyard" });
      }
    }
    if (created.length === 0) return;

    setFlights((current) => [...current, ...created]);
    created.forEach((flight) => {
      setTimeout(() => {
        setFlights((current) => current.filter((f) => f.id !== flight.id));
      }, FLIGHT_DURATION_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit se déclencher que sur une nouvelle longueur de journal, pas à chaque nouvelle référence de `state`.
  }, [state.eventLog.length]);

  useEffect(() => {
    lastSeenLength.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- réinitialisation volontaire au (re)montage uniquement.
  }, []);

  return flights;
}
