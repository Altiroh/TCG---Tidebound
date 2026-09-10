"use client";

import { useMemo, useState } from "react";
import { CORE_SET, type CardInstance, type CardType } from "@/game";
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

/** Grille de consultation des 81 cartes du catalogue — pour vérifier les assets au fur et à mesure. */
export function CardBrowser() {
  const [filter, setFilter] = useState<CardType | "all">("all");
  const [search, setSearch] = useState("");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const cards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CORE_SET.filter((def) => {
      if (filter !== "all" && def.type !== filter) return false;
      if (query && !def.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [filter, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une carte..."
          className="w-full max-w-xs rounded-md border border-slate-700 bg-board-surface/80 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-board-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === type
                  ? "border-board-accent bg-board-accent/10 text-board-accent"
                  : "border-slate-700 text-slate-400 hover:border-slate-500"
              }`}
            >
              {type === "all" ? "Toutes" : CARD_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <span className="ml-auto self-center text-xs text-slate-500">{cards.length} carte(s) — cliquer pour agrandir</span>
      </div>
      {cards.length === 0 && (
        <p className="text-sm text-slate-500">Aucune carte ne correspond à cette recherche.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {cards.map((def) => (
          <CardTile
            key={def.id}
            instance={displayInstance(def.id)}
            tideState="calme"
            onClick={() => setDetailCardId(def.id)}
          />
        ))}
      </div>

      {detailCardId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setDetailCardId(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <CardTile
              instance={displayInstance(detailCardId)}
              tideState="calme"
              widthClassName="w-72 sm:w-80"
              onClick={() => setDetailCardId(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
