"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game";
import { abyssalArrivals } from "@/features/match/abyssalArrival";
import { ARRIVAL_DELAY_MS } from "@/features/match/effectPresentation";
import { findElement } from "@/features/match/AttackImpactLayer";
import { orbAura } from "@/features/match/cardFx";
import { reducedMotion } from "@/features/match/FxCanvas";
import { playTideChange } from "@/lib/sound";

/** Le labo d'animations rejoue l'arrivée sur une carte du plateau (`FxLabPanel`). */
export const ABYSSAL_LAB_EVENT = "tb:abyssal-arrival";

/** Durée du voile des Abysses sur l'écran. */
const VEIL_MS = 1500;
/** Durée du tremblement de la table. */
const QUAKE_MS = 720;

/**
 * Mise en scène de l'arrivée d'une Abyssale (`abyssalArrival.ts`) : une fois
 * la carte posée, la TABLE TREMBLE (toute la fenêtre de jeu, amplitude qui
 * décroît), un voile des profondeurs — bords sombres et pourpres, une onde
 * qui part de la carte — passe sur l'écran, et la carte s'entoure du halo
 * d'orbe pourpre. Sous « réduire les animations », le voile seul, sans
 * tremblement.
 */
export function AbyssalArrivalFx({ state }: { state: GameState }) {
  const seen = useRef(state.eventLog.length);
  const [veils, setVeils] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const nextId = useRef(0);

  function play(arrivals: string[]) {
    const card = findElement("unit", arrivals[0]!);
    const rect = card?.getBoundingClientRect();
    const id = nextId.current++;
    setVeils((current) => [
      ...current,
      { id, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2 },
    ]);
    window.setTimeout(() => setVeils((current) => current.filter((veil) => veil.id !== id)), VEIL_MS);
    playTideChange();
    for (const instanceId of arrivals) {
      const el = findElement("unit", instanceId);
      if (el) orbAura(el, "malus", { durationMs: VEIL_MS, sparks: true });
    }
    if (reducedMotion()) return;
    const viewport = document.querySelector<HTMLElement>("[data-game-viewport]");
    viewport?.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: "translate(-7px, 4px) rotate(-0.25deg)", offset: 0.08 },
        { transform: "translate(6px, -5px) rotate(0.25deg)", offset: 0.18 },
        { transform: "translate(-5px, 3px)", offset: 0.3 },
        { transform: "translate(4px, -3px)", offset: 0.42 },
        { transform: "translate(-3px, 2px)", offset: 0.55 },
        { transform: "translate(2px, -1px)", offset: 0.7 },
        { transform: "translate(-1px, 1px)", offset: 0.85 },
        { transform: "translate(0, 0)" },
      ],
      { duration: QUAKE_MS, easing: "linear" }
    );
  }

  useEffect(() => {
    const log = state.eventLog;
    // Un journal plus court : nouvelle partie, ou retour en arrière de l'affichage — on repart d'ici.
    if (log.length < seen.current) seen.current = log.length;
    const fresh = log.slice(seen.current);
    seen.current = log.length;
    const arrivals = abyssalArrivals(fresh);
    if (arrivals.length === 0) return undefined;
    // La carte atterrit d'abord (glissé de pose), puis les Abysses répondent.
    const timer = window.setTimeout(() => play(arrivals), ARRIVAL_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `play` ne lit que des refs et des setters.
  }, [state.eventLog]);

  useEffect(() => {
    const onLab = (event: Event) => play([(event as CustomEvent<string>).detail]);
    window.addEventListener(ABYSSAL_LAB_EVENT, onLab);
    return () => window.removeEventListener(ABYSSAL_LAB_EVENT, onLab);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- branché une fois.
  }, []);

  return (
    <>
      {veils.map((veil) => (
        <AbyssVeil key={veil.id} x={veil.x} y={veil.y} />
      ))}
    </>
  );
}

/** Le voile : les bords de l'écran s'assombrissent de pourpre, et une onde part de la carte. */
function AbyssVeil({ x, y }: { x: number; y: number }) {
  const shade = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const animations = [
      shade.current?.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.8, offset: 0.55 }, { opacity: 0 }],
        { duration: VEIL_MS, easing: "ease-out", fill: "forwards" }
      ),
      ring.current?.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.1)", opacity: 0.9 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
        ],
        { duration: VEIL_MS * 0.75, easing: "cubic-bezier(.15,.7,.35,1)", fill: "forwards" }
      ),
    ];
    return () => animations.forEach((animation) => animation?.cancel());
  }, []);
  const reach = Math.hypot(window.innerWidth, window.innerHeight);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[44] overflow-hidden">
      <div
        ref={shade}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          background:
            `radial-gradient(ellipse at ${x}px ${y}px, rgba(112,26,117,0) 30%, rgba(76,29,149,0.28) 62%, rgba(10,4,30,0.72) 100%)`,
        }}
      />
      <div
        ref={ring}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: reach,
          height: reach,
          borderRadius: "50%",
          opacity: 0,
          border: "3px solid rgba(232,121,249,0.75)",
          boxShadow: "0 0 40px 10px rgba(168,85,247,0.45), inset 0 0 60px 14px rgba(112,26,117,0.45)",
        }}
      />
    </div>
  );
}
