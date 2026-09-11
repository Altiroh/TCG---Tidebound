"use client";

import { useEffect, useState } from "react";

interface DragTargetingTrailProps {
  /** Point d'origine (centre de la carte glissée), coordonnées viewport — capturé au `dragstart`. `null` = pas de glissement de ciblage en cours. */
  anchor: { x: number; y: number } | null;
}

/**
 * Suivi pointillé du glisser-déposer d'attaque/effet : un trait en
 * pointillés relie l'origine de la carte glissée (qui reste en fantôme sur
 * place, cf. le style `opacity`/glow posé sur la carte elle-même dans
 * `MatchBoard`/`OnlineBoard`) au pointeur, avec un halo pulsant à la
 * position courante. Isolé dans son propre composant pour que le suivi
 * haute fréquence de la souris (`dragover` sur `window`, jusqu'à ~60/s) ne
 * déclenche pas un re-rendu de tout le plateau à chaque frame.
 */
export function DragTargetingTrail({ anchor }: DragTargetingTrailProps) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!anchor) {
      setCursor(null);
      return undefined;
    }
    function handleDragOver(e: DragEvent) {
      if (e.clientX === 0 && e.clientY === 0) return;
      setCursor({ x: e.clientX, y: e.clientY });
    }
    window.addEventListener("dragover", handleDragOver);
    return () => window.removeEventListener("dragover", handleDragOver);
  }, [anchor]);

  if (!anchor || !cursor) return null;

  return (
    <svg className="pointer-events-none fixed inset-0 z-40 h-full w-full" aria-hidden>
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={cursor.x}
        y2={cursor.y}
        stroke="rgba(125,211,252,0.85)"
        strokeWidth={2.5}
        strokeDasharray="9 7"
        strokeLinecap="round"
      />
      <circle cx={cursor.x} cy={cursor.y} r={14} fill="none" stroke="rgba(125,211,252,0.9)" strokeWidth={2}>
        <animate attributeName="r" values="10;17;10" dur="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.25;0.9" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
