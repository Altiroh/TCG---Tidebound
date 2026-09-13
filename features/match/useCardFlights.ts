"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import { playCardDraw } from "@/lib/sound";

export interface CardFlight {
  id: number;
  playerId: PlayerId;
  /** "draw" : pioche → main. "play" : main → plateau (carte posée). "toGraveyard" : plateau/main → cimetière (défausse, Sabordage, destruction). */
  kind: "draw" | "play" | "toGraveyard";
  /** Carte piochée (`DRAW_CARD`) — tant que son vol n'a pas atterri, elle reste masquée dans la main (cf. `hiddenDrawIds`). */
  instanceId?: string;
  /** Attente avant le départ : les pioches d'un même lot partent l'une après l'autre. */
  delayMs: number;
}

/** Doit rester cohérente avec la durée de transition posée sur `CardFlightLayer`. */
export const FLIGHT_DURATION_MS = 650;
/** Écart entre deux pioches d'un même lot (main de départ, pioche multiple). */
const DRAW_STAGGER_MS = 260;

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
 * Point de départ du journal au montage : une partie déjà engagée (au moins
 * une fin de tour — ex: rechargement d'une partie en ligne) ne rejoue pas son
 * historique ; une partie qui commence anime sa main de départ, pioche par
 * pioche.
 */
function initialSeenLength(state: GameState): number {
  return state.eventLog.some((event) => event.type === "END_TURN") ? state.eventLog.length : 0;
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
  const lastSeenLength = useRef(initialSeenLength(state));
  const nextId = useRef(0);
  const dealtStartingHands = useRef(false);

  // Main de départ : `createGameState` la distribue sans événement `DRAW_CARD`. Pour une partie qui commence
  // (aucune fin de tour encore), on la pioche visuellement carte par carte au montage, comme une pioche normale.
  useEffect(() => {
    if (dealtStartingHands.current || state.eventLog.some((event) => event.type === "END_TURN")) return;
    dealtStartingHands.current = true;
    const dealt: CardFlight[] = state.players.flatMap((player) =>
      player.hand.map((card, index) => ({
        id: nextId.current++,
        playerId: player.id,
        kind: "draw" as const,
        instanceId: card.instanceId,
        delayMs: 250 + index * DRAW_STAGGER_MS,
      }))
    );
    if (dealt.length === 0) return;
    setFlights((current) => [...current, ...dealt]);
    const viewerCount = Math.max(...state.players.map((player) => player.hand.length));
    for (let i = 0; i < viewerCount; i++) setTimeout(playCardDraw, 250 + i * DRAW_STAGGER_MS);
    dealt.forEach((flight) => {
      setTimeout(() => setFlights((current) => current.filter((f) => f.id !== flight.id)), FLIGHT_DURATION_MS + flight.delayMs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- distribution unique, au montage d'une partie qui commence.
  }, []);

  useEffect(() => {
    const newEvents = state.eventLog.slice(lastSeenLength.current);
    lastSeenLength.current = state.eventLog.length;
    if (newEvents.length === 0) return;

    const created: CardFlight[] = [];
    const drawsByPlayer = new Map<PlayerId, number>();
    for (const event of newEvents) {
      if (event.type === "DRAW_CARD") {
        const index = drawsByPlayer.get(event.playerId) ?? 0;
        drawsByPlayer.set(event.playerId, index + 1);
        const delayMs = index * DRAW_STAGGER_MS;
        created.push({ id: nextId.current++, playerId: event.playerId, kind: "draw", instanceId: event.instanceId, delayMs });
        setTimeout(playCardDraw, delayMs);
      } else if (event.type === "SUMMON") {
        created.push({ id: nextId.current++, playerId: event.playerId, kind: "play", delayMs: 0 });
      } else if (event.type === "SABORDED") {
        created.push({ id: nextId.current++, playerId: event.playerId, kind: "toGraveyard", delayMs: 0 });
      } else if (event.type === "CARD_MOVED" && event.toZone === "graveyard") {
        const ownerId = findCardOwner(state, event.instanceId);
        if (ownerId) created.push({ id: nextId.current++, playerId: ownerId, kind: "toGraveyard", delayMs: 0 });
      } else if (event.type === "DESTROY") {
        const ownerId = findCardOwner(state, event.instanceId);
        if (ownerId) created.push({ id: nextId.current++, playerId: ownerId, kind: "toGraveyard", delayMs: 0 });
      }
    }
    if (created.length === 0) return;

    setFlights((current) => [...current, ...created]);
    created.forEach((flight) => {
      setTimeout(() => {
        setFlights((current) => current.filter((f) => f.id !== flight.id));
      }, FLIGHT_DURATION_MS + flight.delayMs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit se déclencher que sur une nouvelle longueur de journal, pas à chaque nouvelle référence de `state`.
  }, [state.eventLog.length]);

  return flights;
}

/** Nombre de cartes de `playerId` encore "en vol" vers sa main — à retirer de l'affichage de la main jusqu'à l'atterrissage. */
export function pendingDrawCount(flights: CardFlight[], playerId: PlayerId): number {
  return flights.filter((flight) => flight.kind === "draw" && flight.playerId === playerId).length;
}

/** Instances piochées par `playerId` pas encore arrivées en main. */
export function pendingDrawIds(flights: CardFlight[], playerId: PlayerId): Set<string> {
  return new Set(
    flights.filter((flight) => flight.kind === "draw" && flight.playerId === playerId && flight.instanceId).map((flight) => flight.instanceId!)
  );
}
