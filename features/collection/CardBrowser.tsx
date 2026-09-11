"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CORE_SET, getCardDefinition, getMaxCopies, UNIT_CARD_TYPES, type CardInstance, type CardType } from "@/game";
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

/** Panneau à largeur fixe (w-80) — paliers en rem par longueur, pour ne jamais passer sur 2 lignes (calibré/vérifié sur les 87 noms du catalogue). */
function panelTitleFontSizeRem(name: string): number {
  if (name.length <= 14) return 1.4;
  if (name.length <= 18) return 1.25;
  if (name.length <= 22) return 1.1;
  if (name.length <= 26) return 0.98;
  if (name.length <= 30) return 0.93;
  if (name.length <= 34) return 0.9;
  return 0.85;
}

/** Jeton stat (Coût/Puissance/Résistance) — verre dépoli, grosse valeur + légende. */
function StatChip({ value, label, accentClassName }: { value: number; label: string; accentClassName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-white/15 bg-white/10 py-2.5 backdrop-blur-md">
      <span className={`text-xl font-bold [font-family:var(--font-card-title)] ${accentClassName}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300/80">{label}</span>
    </div>
  );
}

/** Panneau d'informations affiché à côté de la carte agrandie — verre liquide (glow coloré diffus + carte dépolie + reflet), inspiré des fiches de carte Hearthstone mais limité aux données réelles du modèle Tidebound (pas de rareté/artiste/poussière, absents de `CardDefinition`). */
function CardInfoPanel({ cardId }: { cardId: string }) {
  const def = getCardDefinition(cardId);
  const isAbyssal = def.subtype === "abyssal";
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const otherSubtype = def.subtype && def.subtype !== "abyssal" ? def.subtype : null;
  const showAttack = isUnit || def.attack !== undefined;
  const showHealth = def.health !== undefined;

  return (
    <div className="relative h-full w-80 shrink-0 [font-family:var(--font-card-body)]">
      {/* Glow diffus derrière le verre — teinte selon la famille de la carte */}
      <div aria-hidden className={`absolute -inset-8 opacity-50 blur-3xl ${isAbyssal ? "bg-fuchsia-700" : "bg-sky-500"}`} />

      <div className="relative flex h-full flex-col justify-center overflow-hidden border border-white/15 bg-white/[0.07] shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        {/* Reflet du haut, façon verre liquide */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/25 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -left-10 top-0 h-full w-16 -rotate-12 bg-white/10 blur-md" />

        <div className="relative p-6">
          <div className="flex flex-wrap items-center gap-2">
            {/* Puce blanche, toujours visible : le type reste lisible même si
                l'icône seule est ambiguë (ex: Marin vs Créature). */}
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- asset local, icône de type */}
              <img
                src={`/assets/cards/icons/TYPE_${def.type.toUpperCase()}_STANDARD.png`}
                alt=""
                className="h-4 w-auto object-contain"
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-800">
                {CARD_TYPE_LABELS[def.type]}
              </span>
            </span>
            {isAbyssal && (
              <span className="rounded-full border border-white/15 bg-fuchsia-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200 backdrop-blur-md">
                Abyssal
              </span>
            )}
            {otherSubtype && (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-md">
                {otherSubtype}
              </span>
            )}
          </div>

          <h2
            className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-white [font-family:var(--font-card-title)]"
            style={{ fontSize: `${panelTitleFontSizeRem(def.name)}rem` }}
          >
            {def.name}
          </h2>

          <div className="mt-4 flex gap-2">
            <StatChip value={def.cost} label="Coût" accentClassName="text-sky-300" />
            {showAttack && <StatChip value={def.attack ?? 0} label="Puissance" accentClassName="text-orange-300" />}
            {showHealth && <StatChip value={def.health ?? 0} label="Résistance" accentClassName="text-emerald-300" />}
          </div>

          {def.text && (
            <p className="mt-4 rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-2.5 text-[15px] leading-relaxed text-slate-200 backdrop-blur-md">
              {def.text}
            </p>
          )}

          {def.keywords && def.keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {def.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-sky-200 backdrop-blur-md"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-white/10 pt-3 text-right text-xs text-slate-400">
            {getMaxCopies(def)} exemplaire{getMaxCopies(def) > 1 ? "s" : ""} max / deck
          </div>
        </div>
      </div>
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
  const [search, setSearch] = useState("");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const cards = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return CORE_SET.filter((def) => {
      if (filter !== "all" && def.type !== filter) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    });
  }, [filter, search]);

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
          <div className="-my-8 hidden self-stretch sm:block" onClick={(e) => e.stopPropagation()}>
            <CardInfoPanel cardId={detailCardId} />
          </div>
        </div>
      )}
    </div>
  );
}
