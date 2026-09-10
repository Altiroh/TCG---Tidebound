"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { useImageLoadStatus } from "@/features/match/useImageLoadStatus";

const TYPE_BADGE_CLASSES: Record<string, string> = {
  marin: "bg-sky-900 text-sky-200",
  creature: "bg-rose-900 text-rose-200",
  equipement: "bg-amber-900 text-amber-200",
  structure: "bg-emerald-900 text-emerald-200",
  objet: "bg-violet-900 text-violet-200",
  anomalie: "bg-fuchsia-950 text-fuchsia-200",
};

interface CardHoverPreviewProps {
  cardId: string;
  /** Rectangle de l'élément survolé (`getBoundingClientRect()`), pour ancrer l'aperçu à côté sans le masquer. */
  anchorRect: DOMRect;
}

const WIDTH = 224; // px — w-56
const GAP = 12;

/**
 * Aperçu agrandi d'une carte au survol : image en grand + texte de règles
 * TOUJOURS visible (contrairement à `CardTile`, où le texte complet n'existe
 * qu'en `title` HTML natif — lent à apparaître, sans mise en forme). Ancré à
 * côté de la carte survolée plutôt que sur le curseur, pour rester stable
 * même si la souris continue de bouger légèrement. `pointer-events-none` :
 * ne doit jamais intercepter le glisser-déposer ni les clics.
 */
export function CardHoverPreview({ cardId, anchorRect }: CardHoverPreviewProps) {
  const def = getCardDefinition(cardId);
  const illustrationUrl = `/assets/cards/illustrations/${cardId}.png`;
  const imageStatus = useImageLoadStatus(illustrationUrl);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Hauteur réellement mesurée du panneau (le texte de règles fait varier sa
  // hauteur d'une carte à l'autre) — sans ça, le clamp vertical se basait sur
  // une estimation fixe qui laissait le panneau déborder sous l'écran pour
  // les cartes à texte long. `useLayoutEffect` mesure et corrige la position
  // AVANT le paint du navigateur : pas de flash à la position provisoire.
  const [height, setHeight] = useState(340);

  useEffect(() => {
    function update() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    if (panelRef.current) setHeight(panelRef.current.offsetHeight);
  }, [cardId, imageStatus]);

  if (!viewport) return null;

  const spaceRight = viewport.w - anchorRect.right;
  const placeRight = spaceRight >= WIDTH + GAP || spaceRight >= anchorRect.left;
  const left = placeRight ? anchorRect.right + GAP : Math.max(GAP, anchorRect.left - WIDTH - GAP);

  let top = anchorRect.top + anchorRect.height / 2 - height / 2;
  top = Math.max(GAP, Math.min(top, viewport.h - height - GAP));

  return (
    <div
      ref={panelRef}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-lg border border-slate-700 bg-board-surface shadow-2xl shadow-black/60"
      style={{ left, top, width: WIDTH }}
    >
      {imageStatus === "ok" && (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu flottant, hors du flux normal de CardTile
        <img src={illustrationUrl} alt={def.name} className="aspect-[5/7] w-full object-cover" />
      )}
      <div className="flex flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_BADGE_CLASSES[def.type] ?? "bg-slate-800"}`}>
            {CARD_TYPE_LABELS[def.type]}
            {def.subtype === "abyssal" ? " — Abyssale" : ""}
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-board-accent">
            Coût {def.cost}
          </span>
        </div>
        <span className="text-sm font-semibold leading-tight text-slate-100">{def.name}</span>
        {(def.attack !== undefined || def.health !== undefined) && (
          <div className="flex items-center gap-3 text-xs font-semibold">
            {def.attack !== undefined && <span className="text-orange-300">⚔ Puissance {def.attack}</span>}
            {def.health !== undefined && <span className="text-emerald-300">♥ Résistance {def.health}</span>}
          </div>
        )}
        <p className="text-xs leading-snug text-slate-300">{def.text ?? "Aucun effet — carte volontairement vanilla."}</p>
        {def.keywords && def.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {def.keywords.map((kw) => (
              <span key={kw} className="rounded bg-board-accent/10 px-1.5 py-0.5 text-[10px] uppercase text-board-accent">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
