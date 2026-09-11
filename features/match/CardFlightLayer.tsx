"use client";

import { useEffect, useState } from "react";
import { CARD_BACK_SRC } from "@/features/match/CardBack";
import { FLIGHT_DURATION_MS, type CardFlight } from "@/features/match/useCardFlights";

interface Point {
  x: number;
  y: number;
}

/** Même gabarit que les cartes en main (`HandFan.BASE_WIDTH`, `w-36` = 144px, ratio 5/7) — trop petite (46×64) auparavant pour bien voir une carte se déplacer vers/depuis la défausse ou la pioche. */
const FLIGHT_CARD_WIDTH = 144;
const FLIGHT_CARD_HEIGHT = Math.round((FLIGHT_CARD_WIDTH * 7) / 5);

interface CardFlightLayerProps {
  flights: CardFlight[];
  /** Résout les coordonnées (repère local de `BoardStage`) d'un vol donné — dépend de la mise en page propre à `MatchBoard`/`OnlineBoard` (qui joueur, quelle zone). `null` = vol ignoré (zone inconnue). */
  getCoords: (flight: CardFlight) => { from: Point; to: Point } | null;
}

function FlyingCard({ from, to }: { from: Point; to: Point }) {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const pos = arrived ? to : from;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 ease-out"
      style={{
        left: pos.x,
        top: pos.y,
        width: FLIGHT_CARD_WIDTH,
        height: FLIGHT_CARD_HEIGHT,
        transform: `translate(-50%, -50%) scale(${arrived ? 0.7 : 1})`,
        opacity: arrived ? 0 : 1,
        transition: `left ${FLIGHT_DURATION_MS}ms, top ${FLIGHT_DURATION_MS}ms, transform ${FLIGHT_DURATION_MS}ms, opacity ${FLIGHT_DURATION_MS}ms`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte, toujours identique, jamais la face (une pioche adverse ne doit pas révéler la carte) */}
      <img
        src={CARD_BACK_SRC}
        alt=""
        draggable={false}
        className="h-full w-full rounded-xl border border-slate-600 object-cover shadow-[0_8px_28px_rgba(0,0,0,0.7)]"
      />
    </div>
  );
}

/**
 * Rend les vols de carte actifs (`useCardFlights`) — une carte dos visible
 * qui glisse physiquement d'une zone à l'autre (pioche → main, plateau/
 * main → cimetière), pour les DEUX joueurs. Rendu À L'INTÉRIEUR de
 * `BoardStage` (repère 1672×941, pas le viewport) : les coordonnées
 * fournies par `getCoords` sont donc directement les mêmes que celles déjà
 * utilisées pour positionner `CargoCluster`/les mains — pas de conversion
 * de repère nécessaire, contrairement à `DragTargetingTrail`/`StatusBadge`
 * qui doivent au contraire échapper à ce repère mis à l'échelle.
 */
export function CardFlightLayer({ flights, getCoords }: CardFlightLayerProps) {
  return (
    <>
      {flights.map((flight) => {
        const coords = getCoords(flight);
        if (!coords) return null;
        return <FlyingCard key={flight.id} from={coords.from} to={coords.to} />;
      })}
    </>
  );
}
