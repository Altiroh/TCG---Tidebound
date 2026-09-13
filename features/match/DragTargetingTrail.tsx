"use client";

import { useEffect, useState } from "react";

interface DragTargetingTrailProps {
  /** Point d'origine (centre de la carte glissée), coordonnées viewport — capturé au `dragstart`. `null` = pas de glissement de ciblage en cours. */
  anchor: { x: number; y: number } | null;
}

/**
 * Suivi du glisser-déposer d'attaque/effet/Sabordage : un trait fin en
 * tirets relie l'origine de la carte glissée (qui reste en fantôme sur
 * place, cf. le style `opacity`/glow posé sur la carte elle-même dans
 * `MatchBoard`/`OnlineBoard`) au pointeur, terminé par un petit réticule
 * fixe. Isolé dans son propre composant pour que le suivi
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
      {/* Liseré sombre sous les tirets : garde le trait lisible sur les zones claires du plateau sans l'épaissir. */}
      <line x1={anchor.x} y1={anchor.y} x2={cursor.x} y2={cursor.y} stroke="rgba(2,6,23,0.45)" strokeWidth={3.5} />
      {/* Tirets rectangulaires (`butt`), fins et d'un bleu sobre — demande du retour de test du 13/09. */}
      <line
        x1={anchor.x}
        y1={anchor.y}
        x2={cursor.x}
        y2={cursor.y}
        stroke="rgba(147,197,253,0.8)"
        strokeWidth={1.5}
        strokeDasharray="12 6"
        strokeLinecap="butt"
      />
      <circle cx={cursor.x} cy={cursor.y} r={7} fill="rgba(2,6,23,0.35)" stroke="rgba(147,197,253,0.85)" strokeWidth={1.5} />
      <circle cx={cursor.x} cy={cursor.y} r={1.75} fill="rgba(191,219,254,0.95)" />
    </svg>
  );
}
