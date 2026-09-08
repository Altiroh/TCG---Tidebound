"use client";

import { useEffect, useRef, useState } from "react";
import {
  computeEffectiveStats,
  getCardDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type TideStateName,
} from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

interface CardTileProps {
  instance: CardInstance;
  tideState: TideStateName;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** Classe Tailwind de largeur (ex: "w-28", "w-72") — permet un rendu plus grand (vue détail). Défaut : "w-28". */
  widthClassName?: string;
}

const TYPE_BADGE_CLASSES: Record<string, string> = {
  marin: "bg-sky-900 text-sky-200",
  creature: "bg-rose-900 text-rose-200",
  equipement: "bg-amber-900 text-amber-200",
  structure: "bg-emerald-900 text-emerald-200",
  objet: "bg-violet-900 text-violet-200",
  anomalie: "bg-fuchsia-950 text-fuchsia-200",
};

/**
 * Position (en % de la carte, ancrée coin bas) des chiffres superposés sur
 * l'image — calée sur une annotation directe fournie sur l'export
 * "Cylindre flottant" (chiffre dessiné à la main juste après le mot
 * "Résistance", à sa hauteur). À réajuster si le gabarit diffère d'une
 * carte à l'autre, et une fois une Créature disponible pour caler la
 * Puissance à gauche (position non mesurée, symétrique par défaut).
 *
 * `PREVIEW_BOTTOM_OFFSET` : léger correctif vertical propre à la taille
 * "aperçu" (grille, `widthClassName` par défaut) — un même `bottom` en %
 * ne rend pas identique à toutes les échelles, la vue détail restant
 * calée sur l'annotation d'origine.
 */
const RESISTANCE_POSITION = { right: "10.5%", bottom: "6.5%" };
const ATTACK_POSITION = { left: "10.5%", bottom: "6.5%" };
const PREVIEW_BOTTOM_OFFSET = 2;
/** Taille du chiffre en % de la LARGEUR de la carte (container query : `cqw`),
 * pour rester proportionnée que la carte soit affichée petite (grille) ou
 * grande (détail) — un `text-*` Tailwind fixe ne s'adapte pas. */
const STAT_FONT_SIZE = "7cqw";
/**
 * Blanc + contour bleu nuit épais (8 directions, décalage en `cqw` pour
 * rester proportionné à `STAT_FONT_SIZE` quelle que soit la taille de la
 * carte), comme le chiffre du coût (Raison) en haut à gauche, plutôt qu'un
 * aplat de couleur.
 */
const STAT_TEXT_SHADOW = (() => {
  const d = 0.35; // cqw
  const offsets: Array<[number, number]> = [
    [-d, -d],
    [d, -d],
    [-d, d],
    [d, d],
    [0, -d],
    [0, d],
    [-d, 0],
    [d, 0],
  ];
  return (
    offsets.map(([x, y]) => `${x}cqw ${y}cqw 0 #022a58`).join(", ") + ", 0 0.3cqw 0.5cqw rgba(0,0,0,0.5)"
  );
})();

/** Précharge l'image finie d'une carte hors du DOM plutôt que de dépendre
 * de l'événement `onError` d'un `<img>` rendu — plus fiable quand beaucoup
 * de cartes se chargent en même temps (ex: la page Collection, 80
 * requêtes simultanées), où `onError` s'est révélé peu fiable dans les
 * tests. */
function useCardImageStatus(cardId: string): "loading" | "ok" | "error" {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setStatus("ok");
    };
    img.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    img.src = `/api/card-image/${cardId}`;
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  return status;
}

/** `true` le temps d'une animation, chaque fois que `value` diminue par rapport à son appel précédent. */
function useDecreaseFlash(value: number): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (value >= previous.current) {
      previous.current = value;
      return undefined;
    }
    setFlashing(true);
    previous.current = value;
    const timeout = setTimeout(() => setFlashing(false), 500);
    return () => clearTimeout(timeout);
  }, [value]);

  return flashing;
}

/**
 * Un chiffre de statistique superposé sur l'image de la carte, dans la
 * police/position dédiées. Blanc + contour bleu nuit (`STAT_TEXT_SHADOW`),
 * même traitement que le chiffre de coût (Raison) en haut à gauche, plutôt
 * qu'un aplat de couleur.
 */
function StatOverlay({
  value,
  position,
  bottomOffset,
  flashing,
}: {
  value: number;
  position: { left?: string; right?: string; bottom: string };
  bottomOffset: number;
  flashing: boolean;
}) {
  const bottom = `calc(${position.bottom} - ${bottomOffset}%)`;
  return (
    <span
      className={`absolute font-extrabold leading-none text-white [font-family:var(--font-card-stat)] ${
        flashing ? "animate-stat-hit" : ""
      }`}
      style={{ ...position, bottom, fontSize: STAT_FONT_SIZE, textShadow: STAT_TEXT_SHADOW }}
    >
      {value}
    </span>
  );
}

/**
 * Une carte compacte. Composant "bête" : affiche l'image finie de la carte
 * si un asset existe (`/api/card-image/<cardId>`, voir
 * `public/assets/cards/README.md`), avec les chiffres de Puissance/
 * Résistance superposés en live dans l'emplacement réservé par l'export
 * (jamais gravés dans l'image — ils changent en cours de partie). Une
 * courte animation signale une baisse de Résistance. Retombe sur le rendu
 * HTML/CSS complet tant qu'aucun asset n'existe pour cette carte (ou
 * pendant le chargement).
 */
export function CardTile({ instance, tideState, selected, disabled, onClick, widthClassName = "w-28" }: CardTileProps) {
  const def = getCardDefinition(instance.cardId);
  const stats = computeEffectiveStats(instance, tideState);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const hasResistance = isUnit || def.health !== undefined;
  const imageStatus = useCardImageStatus(instance.cardId);
  const resistanceRemaining = Math.max(0, stats.health - instance.damageMarked);
  const resistanceFlashing = useDecreaseFlash(resistanceRemaining);

  const ringClasses = selected
    ? "border-board-accent bg-board-accent/10"
    : "border-slate-700 bg-board-surface hover:border-slate-500";
  // Correctif vertical propre à la taille "aperçu" (voir PREVIEW_BOTTOM_OFFSET) ;
  // la vue détail (toute autre largeur) reste calée sur l'annotation d'origine.
  const bottomOffset = widthClassName === "w-28" ? PREVIEW_BOTTOM_OFFSET : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || disabled}
      title={def.text}
      className={`${widthClassName} overflow-hidden rounded-md border text-left text-xs transition-colors ${ringClasses} ${
        disabled ? "opacity-40" : ""
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      {imageStatus === "ok" ? (
        <div className="relative aspect-[5/7] w-full bg-board-surface" style={{ containerType: "inline-size" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- asset local, taille variable selon la carte */}
          <img src={`/api/card-image/${instance.cardId}`} alt={def.name} className="h-full w-full object-cover" />
          {(stats.inactive || (instance.summoningSick && isUnit) || instance.turnsRemaining !== undefined) && (
            <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1 bg-black/60 px-1 py-0.5">
              {stats.inactive && <span className="text-[9px] text-amber-300">Inactive</span>}
              {instance.summoningSick && isUnit && <span className="text-[9px] text-slate-300">Malade</span>}
              {instance.turnsRemaining !== undefined && (
                <span className="text-[9px] text-slate-300">Durée {instance.turnsRemaining}</span>
              )}
            </div>
          )}
          {isUnit && (
            <StatOverlay value={stats.attack} position={ATTACK_POSITION} bottomOffset={bottomOffset} flashing={false} />
          )}
          {hasResistance && (
            <StatOverlay
              value={resistanceRemaining}
              position={RESISTANCE_POSITION}
              bottomOffset={bottomOffset}
              flashing={resistanceFlashing}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1 p-2">
          <div className="flex items-center justify-between gap-1">
            <span className={`rounded px-1 py-0.5 text-[10px] ${TYPE_BADGE_CLASSES[def.type] ?? "bg-slate-800"}`}>
              {CARD_TYPE_LABELS[def.type]}
            </span>
            <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-board-accent">
              {def.cost}
            </span>
          </div>
          <span className="line-clamp-2 font-medium leading-tight text-slate-100">{def.name}</span>
          {stats.inactive && <span className="text-[10px] text-amber-400">Inactive</span>}
          {instance.summoningSick && isUnit && (
            <span className="text-[10px] text-slate-500">Malade d&apos;invocation</span>
          )}
          {instance.turnsRemaining !== undefined && (
            <span className="text-[10px] text-slate-500">Durée : {instance.turnsRemaining}</span>
          )}
          {(isUnit || hasResistance) && (
            <div className="mt-auto flex items-center gap-2 text-[11px] font-semibold">
              {isUnit && <span className="text-orange-300">⚔ {stats.attack}</span>}
              <span className="text-emerald-300">
                ♥ {resistanceRemaining}/{stats.health}
              </span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}
