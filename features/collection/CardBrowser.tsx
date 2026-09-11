"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CORE_SET, type CardInstance, type CardType } from "@/game";
import { CardInfoPanel } from "@/features/match/CardInfoPanel";
import { CardTile } from "@/features/match/CardTile";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

/** Insensible aux accents (ex: "epave" retrouve "Épave") et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

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

interface CardBrowserProps {
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. */
  ownedCardIds: string[];
}

/** Grille de la collection du joueur — ne montre que les cartes qu'il possède réellement. */
export function CardBrowser({ ownedCardIds }: CardBrowserProps) {
  const [filter, setFilter] = useState<CardType | "all">("all");
  const [search, setSearch] = useState("");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const ownedSet = useMemo(() => new Set(ownedCardIds), [ownedCardIds]);

  const cards = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return CORE_SET.filter((def) => {
      if (!ownedSet.has(def.id)) return false;
      if (filter !== "all" && def.type !== filter) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    });
  }, [ownedSet, filter, search]);

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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une carte..."
            className="h-14 w-56 rounded-md border border-slate-700 bg-slate-200/90 px-4 text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-board-accent"
          />
          <span className="self-center whitespace-nowrap text-xs text-slate-400">{cards.length} carte(s) — cliquer pour agrandir</span>
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-300 backdrop-blur-md">
          Aucune carte ne correspond à ces filtres.
        </p>
      ) : (
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
      )}

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
              onClick={() => setDetailCardId(null)}
            />
          </div>
          <div className="-my-8 hidden self-stretch sm:block" onClick={(e) => e.stopPropagation()}>
            <CardInfoPanel cardId={detailCardId} />
          </div>
        </div>
      )}
    </div>
  );
}
