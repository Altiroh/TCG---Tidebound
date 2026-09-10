"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CORE_SET, getCardDefinition, getMaxCopies, UNIT_CARD_TYPES, type CardInstance, type CardType } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

const TYPE_FILTERS: Array<CardType | "all"> = [
  "all",
  "marin",
  "creature",
  "equipement",
  "structure",
  "objet",
  "anomalie",
];

/** Instance factice, pour afficher une carte hors de toute partie (stats de base, aucun état vivant). */
function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: cardId,
    cardId,
    ownerId: "collection",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/** Panneau d'informations affiché à côté de la carte agrandie — inspiré des fiches de carte Hearthstone, mais limité aux données réelles du modèle Tidebound (pas de rareté/artiste/poussière, absents de `CardDefinition`). */
function CardInfoPanel({ cardId }: { cardId: string }) {
  const def = getCardDefinition(cardId);
  const isAbyssal = def.subtype === "abyssal";
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const otherSubtype = def.subtype && def.subtype !== "abyssal" ? def.subtype : null;

  const rows: Array<[string, string]> = [
    ["Carte", `${CARD_TYPE_LABELS[def.type]}${isAbyssal ? " (Abyssal)" : ""}`],
    ["Coût", `${def.cost} Raison`],
  ];
  if (isUnit || def.attack !== undefined) rows.push(["Puissance", `${def.attack ?? 0}`]);
  if (def.health !== undefined) rows.push(["Résistance", `${def.health}`]);
  if (otherSubtype) rows.push(["Sous-type", otherSubtype]);
  if (def.keywords?.length) rows.push(["Mots-clés", def.keywords.join(", ")]);
  rows.push(["Exemplaires max", `${getMaxCopies(def)} par deck`]);

  return (
    <div className="w-80 shrink-0 rounded-xl border border-slate-700/60 bg-board-surface/90 p-7 shadow-2xl [font-family:var(--font-card-body)]">
      <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">{def.name}</h2>
      {def.text && <p className="mt-3 text-[15px] leading-relaxed text-slate-300">{def.text}</p>}
      <ul className="mt-6 space-y-3 text-[15px]">
        {rows.map(([label, value]) => (
          <li key={label} className="flex gap-2.5 text-slate-300">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-board-accent/70" />
            <span>
              <span className="font-semibold text-board-accent">{label} :</span> {value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavArrow({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={direction === "left" ? "Carte précédente" : "Carte suivante"}
      className="fixed top-1/2 z-[60] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-board-accent"
      style={direction === "left" ? { left: "1.5rem" } : { right: "1.5rem" }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path
          d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Grille de consultation des 80 cartes du catalogue — pour vérifier les assets au fur et à mesure. */
export function CardBrowser() {
  const [filter, setFilter] = useState<CardType | "all">("all");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const cards = useMemo(
    () => CORE_SET.filter((def) => filter === "all" || def.type === filter),
    [filter]
  );

  const showRelative = useCallback(
    (delta: number) => {
      setDetailCardId((current) => {
        if (!current) return current;
        const index = cards.findIndex((def) => def.id === current);
        if (index === -1) return current;
        const nextIndex = (index + delta + cards.length) % cards.length;
        return cards[nextIndex]?.id ?? current;
      });
    },
    [cards]
  );

  useEffect(() => {
    if (!detailCardId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailCardId(null);
      if (event.key === "ArrowLeft") showRelative(-1);
      if (event.key === "ArrowRight") showRelative(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailCardId, showRelative]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilter(type)}
            title={type === "all" ? "Toutes" : CARD_TYPE_LABELS[type]}
            className={`flex h-14 items-center justify-center rounded-md border px-5 transition-colors ${
              filter === type
                ? "border-board-accent bg-slate-100 ring-2 ring-board-accent"
                : "border-slate-700 bg-slate-200/90 hover:bg-slate-100"
            }`}
          >
            {type === "all" ? (
              <span className="text-lg font-bold uppercase tracking-wide text-slate-800 [font-family:var(--font-card-title)]">
                Toutes
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- asset local, icône + libellé de type déjà réunis dans l'asset
              <img src={`/assets/cards/icons/TYPE_${type.toUpperCase()}_STANDARD.png`} alt={CARD_TYPE_LABELS[type]} className="h-8 w-auto object-contain" />
            )}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-400">{cards.length} carte(s) — cliquer pour agrandir</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((def) => (
          <CardTile
            key={def.id}
            instance={displayInstance(def.id)}
            tideState="calme"
            widthClassName="w-full"
            onClick={() => setDetailCardId(def.id)}
          />
        ))}
      </div>

      {detailCardId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center gap-8 bg-black/70 p-8 backdrop-blur-md"
          onClick={() => setDetailCardId(null)}
        >
          <button
            type="button"
            onClick={() => setDetailCardId(null)}
            className="fixed right-6 top-6 z-[60] flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] transition-colors hover:bg-white/10 hover:text-board-accent"
          >
            Fermer
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>

          {cards.length > 1 && <NavArrow direction="left" onClick={() => showRelative(-1)} />}
          {cards.length > 1 && <NavArrow direction="right" onClick={() => showRelative(1)} />}

          <div onClick={(e) => e.stopPropagation()}>
            <CardTile
              instance={displayInstance(detailCardId)}
              tideState="calme"
              widthClassName="w-80 sm:w-96"
              variant="detail"
              onClick={() => setDetailCardId(null)}
            />
          </div>
          <div className="hidden sm:block" onClick={(e) => e.stopPropagation()}>
            <CardInfoPanel cardId={detailCardId} />
          </div>
        </div>
      )}
    </div>
  );
}
