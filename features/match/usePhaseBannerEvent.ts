"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, PlayerId } from "@/game";
import { playCombatPhase, playTurnStart } from "@/lib/sound";

export interface PhaseBannerEvent {
  id: number;
  kind: "turnStart" | "combatPhase" | "mainPhase2";
  playerId: PlayerId;
}

const BANNER_DURATION_MS = 1600;

/**
 * Détecte les transitions de tour/phase par comparaison avec l'état
 * précédent (pas par abonnement aux `GameEvent`), pour rester indépendant
 * de ce qui a produit le changement — hot-seat, bot ou partie en ligne.
 * L'événement retourné s'efface automatiquement après `BANNER_DURATION_MS` ;
 * `id` change à chaque nouvelle occurrence pour permettre à `PhaseBanner`
 * de rejouer son animation même si le texte affiché est identique au
 * précédent.
 */
export function usePhaseBannerEvent(state: GameState, viewerId: PlayerId): PhaseBannerEvent | null {
  const [event, setEvent] = useState<PhaseBannerEvent | null>(null);
  const prev = useRef<{ turnNumber: number; phase: GameState["phase"]; activePlayerId: PlayerId } | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // En hot-seat le joueur qui regarde suit le joueur actif : on lit sa valeur du moment, sans relancer l'effet.
  const viewerIdRef = useRef(viewerId);
  viewerIdRef.current = viewerId;

  useEffect(() => {
    const previous = prev.current;
    prev.current = { turnNumber: state.turnNumber, phase: state.phase, activePlayerId: state.activePlayerId };
    if (!previous) return;

    let next: Omit<PhaseBannerEvent, "id"> | null = null;
    if (previous.activePlayerId !== state.activePlayerId) {
      next = { kind: "turnStart", playerId: state.activePlayerId };
    } else if (previous.phase !== state.phase && state.phase === "combatPhase") {
      next = { kind: "combatPhase", playerId: state.activePlayerId };
    } else if (previous.phase !== state.phase && state.phase === "mainPhase2") {
      next = { kind: "mainPhase2", playerId: state.activePlayerId };
    }
    if (!next) return;

    // La bannière s'entend aussi : début de tour (le sien ou celui d'en face), passage en combat.
    if (next.kind === "turnStart") playTurnStart(next.playerId === viewerIdRef.current);
    else if (next.kind === "combatPhase") playCombatPhase();

    nextId.current += 1;
    setEvent({ ...next, id: nextId.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setEvent(null), BANNER_DURATION_MS);
  }, [state.turnNumber, state.phase, state.activePlayerId]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return event;
}
