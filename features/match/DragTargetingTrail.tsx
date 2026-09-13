"use client";

import { useEffect, useState } from "react";

/** "attack" : unité glissée vers une cible en Phase de combat (rouge). "effect" : carte d'effet, Bris ou Sabordage (bleu). */
export type TrailTone = "attack" | "effect";

const TONE_COLORS: Record<TrailTone, { line: string; ring: string; dot: string }> = {
  attack: { line: "rgba(248,113,113,0.85)", ring: "rgba(248,113,113,0.9)", dot: "rgba(254,202,202,0.95)" },
  effect: { line: "rgba(147,197,253,0.8)", ring: "rgba(147,197,253,0.85)", dot: "rgba(191,219,254,0.95)" },
};

interface DragTargetingTrailProps {
  /** Point d'origine (centre de la carte glissée), coordonnées viewport — capturé au `dragstart`. `null` = pas de glissement de ciblage en cours. */
  anchor: { x: number; y: number } | null;
  tone?: TrailTone;
}

/**
 * Suivi du glisser-déposer d'attaque/effet/Sabordage : un trait fin en
 * tirets relie l'origine de la carte glissée (qui reste en fantôme sur
 * place, cf. le style `opacity`/glow posé sur la carte elle-même dans
 * `MatchBoard`/`OnlineBoard`) au pointeur, terminé par un petit réticule
 * fixe — rouge pour une attaque, bleu pour un effet.
 *
 * Se masque de lui-même à la fin du glisser (`drop`/`dragend` écoutés en
 * CAPTURE sur `window`) : quand la carte glissée quitte le DOM à la
 * résolution (Sabordage, attaquant détruit), son `dragend` ne se déclenche
 * jamais et l'ancre du plateau n'était donc jamais remise à zéro — le trait
 * restait affiché. Isolé dans son propre composant pour que le suivi haute
 * fréquence de la souris ne re-rende pas tout le plateau à chaque frame.
 */
export function DragTargetingTrail({ anchor, tone = "effect" }: DragTargetingTrailProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    setEnded(false);
    if (!anchor) {
      setCursor(null);
      return undefined;
    }
    function handleDragOver(e: DragEvent) {
      if (e.clientX === 0 && e.clientY === 0) return;
      setCursor({ x: e.clientX, y: e.clientY });
    }
    function handleEnd() {
      setEnded(true);
      setCursor(null);
    }
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleEnd, true);
    window.addEventListener("dragend", handleEnd, true);
    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleEnd, true);
      window.removeEventListener("dragend", handleEnd, true);
    };
  }, [anchor]);

  if (!anchor || !cursor || ended) return null;
  const colors = TONE_COLORS[tone];

  return (
    <svg className="pointer-events-none fixed inset-0 z-40 h-full w-full" aria-hidden>
      {/* Liseré sombre sous les tirets : garde le trait lisible sur les zones claires du plateau sans l'épaissir. */}
      <line x1={anchor.x} y1={anchor.y} x2={cursor.x} y2={cursor.y} stroke="rgba(2,6,23,0.45)" strokeWidth={3.5} />
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={cursor.x}
        y2={cursor.y}
        stroke={colors.line}
        strokeWidth={1.5}
        strokeDasharray="12 6"
        strokeLinecap="butt"
      />
      <circle cx={cursor.x} cy={cursor.y} r={7} fill="rgba(2,6,23,0.35)" stroke={colors.ring} strokeWidth={1.5} />
      <circle cx={cursor.x} cy={cursor.y} r={1.75} fill={colors.dot} />
    </svg>
  );
}
