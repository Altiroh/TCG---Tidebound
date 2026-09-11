"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CORE_SET, type CardDefinition, type CardInstance, type CardType } from "@/game";
import { CardInfoPanel } from "@/features/match/CardInfoPanel";
import { CardTile } from "@/features/match/CardTile";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

const EMPTY_SLOT_SRC = "/assets/collection/card_empty_placeholder.png";

const TYPE_FILTERS: CardType[] = ["marin", "creature", "equipement", "structure", "objet", "anomalie"];

type SortMode = "name" | "cost" | "power";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "name", label: "Nom" },
  { value: "cost", label: "Raison" },
  { value: "power", label: "Puissance" },
];

/** Insensible aux accents (ex: "epave" retrouve "Épave") et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Comparateur de tri. `cost` et `power` départagent toujours les égalités
 * (et, pour `power`, l'absence de Puissance — Équipement/Structure/Objet/
 * Anomalie) par ordre alphabétique, comme demandé : jamais d'ordre
 * arbitraire résiduel.
 */
function compareCards(a: CardDefinition, b: CardDefinition, sort: SortMode): number {
  if (sort === "cost") {
    return a.cost !== b.cost ? a.cost - b.cost : a.name.localeCompare(b.name, "fr");
  }
  if (sort === "power") {
    const aHasPower = a.attack !== undefined;
    const bHasPower = b.attack !== undefined;
    if (aHasPower && bHasPower && a.attack !== b.attack) return (a.attack as number) - (b.attack as number);
    if (aHasPower !== bHasPower) return aHasPower ? -1 : 1;
    return a.name.localeCompare(b.name, "fr");
  }
  return a.name.localeCompare(b.name, "fr");
}

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

/** Icône de type rognée depuis `TYPE_*_STANDARD.png` (icône + mot-clé accolés sur un même visuel) : le conteneur carré n'affiche que le premier tiers gauche de l'image (où vit l'icône) via `background-size`/`background-position`, sans dupliquer l'asset. */
function TypeIcon({ type, active }: { type: CardType; active: boolean }) {
  return (
    <span
      aria-hidden
      className="block h-full w-full transition-[filter,opacity] duration-150"
      style={{
        backgroundImage: `url(/assets/cards/icons/TYPE_${type.toUpperCase()}_STANDARD.png)`,
        backgroundSize: "auto 100%",
        backgroundPosition: "left center",
        backgroundRepeat: "no-repeat",
        filter: active ? "none" : "grayscale(0.7) opacity(0.55)",
      }}
    />
  );
}

export const NAUTICAL_LABEL_CLASS = "[font-family:var(--font-menu)] uppercase tracking-wider text-amber-100";
export const NAUTICAL_CONTROL_CLASS =
  "rounded-md border border-amber-600/60 bg-slate-950/85 text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.5)] backdrop-blur-sm";

interface CardCollectionPanelProps {
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. */
  ownedCardIds: string[];
  /**
   * `browse` (défaut) : clic = ouvre la fiche agrandie (usage Collection).
   * `pick` : clic ou glisser-déposer = `onPick(cardId)`, pas de fiche
   * agrandie — usage éditeur de deck, où cliquer une carte l'ajoute.
   */
  mode?: "browse" | "pick";
  onPick?: (cardId: string) => void;
}

/**
 * Bloc réutilisable filtre + tri + recherche + grille scrollable, partagé
 * entre `CollectionScreen` (page Collection) et `DeckEditorScreen` (colonne
 * du milieu, cartes possédées à ajouter au deck) — même disposition que le
 * gabarit fourni par l'utilisateur pour les deux écrans. Remplit tout
 * l'espace de son parent (flex-col en pleine hauteur) ; c'est au parent de
 * positionner/dimensionner ce conteneur.
 */
export function CardCollectionPanel({ ownedCardIds, mode = "browse", onPick }: CardCollectionPanelProps) {
  const [activeType, setActiveType] = useState<CardType | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const ownedSet = useMemo(() => new Set(ownedCardIds), [ownedCardIds]);

  const cards = useMemo(() => {
    const query = normalizeSearch(search.trim());
    return CORE_SET.filter((def) => {
      if (!ownedSet.has(def.id)) return false;
      if (activeType && def.type !== activeType) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    }).sort((a, b) => compareCards(a, b, sort));
  }, [ownedSet, activeType, search, sort]);

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
    if (mode !== "browse" || !detailCardId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailCardId(null);
      if (event.key === "ArrowLeft") showRelative(-1);
      if (event.key === "ArrowRight") showRelative(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, detailCardId, showRelative]);

  function handleCardClick(cardId: string) {
    if (mode === "pick") onPick?.(cardId);
    else setDetailCardId(cardId);
  }

  return (
    <div className="flex h-full flex-col" style={{ fontSize: "1.05cqw" }}>
      <div className="flex justify-end pb-[1cqw]">
        <div className={`relative flex items-center ${NAUTICAL_CONTROL_CLASS}`}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className={`appearance-none bg-transparent py-[0.55em] pl-[1em] pr-[2.2em] font-semibold outline-none ${NAUTICAL_LABEL_CLASS}`}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-amber-100 normal-case">
                Trier : {opt.label}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute right-[0.7em] h-[0.9em] w-[0.9em]">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-[0.5%]">
        {cards.length === 0 ? (
          <EmptyState hasAnyCards={ownedCardIds.length > 0} />
        ) : (
          <div className="grid gap-[1.4cqw]" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(9.5cqw, 1fr))" }}>
            {cards.map((def) => (
              <CardTile
                key={def.id}
                instance={displayInstance(def.id)}
                tideState="calme"
                widthClassName="w-full"
                onClick={() => handleCardClick(def.id)}
                draggable={mode === "pick"}
                onDragStart={
                  mode === "pick"
                    ? (event: React.DragEvent) => event.dataTransfer.setData("text/tidebound-card-id", def.id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-[1cqw] pt-[1cqw]">
        <div className="flex items-center gap-[0.6cqw]">
          <button
            type="button"
            onClick={() => setActiveType(null)}
            className={`flex h-[3.1cqw] items-center rounded-full border px-[1.3cqw] font-bold transition-colors ${NAUTICAL_LABEL_CLASS} ${
              activeType === null
                ? "border-board-accent bg-board-accent/25 text-white ring-2 ring-board-accent"
                : "border-amber-600/50 bg-slate-950/80 hover:bg-slate-800/80"
            }`}
          >
            Tout
          </button>
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType((current) => (current === type ? null : type))}
              title={CARD_TYPE_LABELS[type]}
              aria-label={CARD_TYPE_LABELS[type]}
              aria-pressed={activeType === type}
              className={`flex h-[3.1cqw] w-[3.1cqw] items-center justify-center overflow-hidden rounded-full border-2 bg-amber-50 p-[0.55cqw] transition-shadow ${
                activeType === type ? "border-board-accent shadow-[0_0_0.6cqw_rgba(62,166,255,0.75)]" : "border-amber-700/60"
              }`}
            >
              <TypeIcon type={type} active={activeType === type} />
            </button>
          ))}
        </div>

        <div className={`flex h-[3.1cqw] items-center gap-[0.6cqw] px-[1cqw] ${NAUTICAL_CONTROL_CLASS}`} style={{ width: "min(60%, 22cqw)" }}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[1.1em] w-[1.1em] shrink-0 text-amber-200/70">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2} />
            <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une carte..."
            className="w-full bg-transparent text-amber-50 placeholder:text-amber-200/50 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
              className="shrink-0 text-amber-200/70 hover:text-amber-100"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-[1em] w-[1em]">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {mode === "browse" && detailCardId && (
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

/** État vide : quelques emplacements de carte factices (asset fourni par l'utilisateur) plutôt qu'un simple message sec. */
function EmptyState({ hasAnyCards }: { hasAnyCards: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1.2cqw] text-center">
      <div className="grid grid-cols-3 gap-[1.4cqw] opacity-60 sm:grid-cols-6" style={{ width: "min(100%, 60cqw)" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, simple silhouette décorative
          <img key={i} src={EMPTY_SLOT_SRC} alt="" className="aspect-[5/7] w-full rounded-md object-cover shadow-md" />
        ))}
      </div>
      <p className="max-w-md text-[1.1em] text-amber-100/90 [font-family:var(--font-card-body)]" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
        {hasAnyCards
          ? "Aucune carte ne correspond à ces filtres."
          : "Tu ne possèdes encore aucune carte : joue avec un deck préconstruit en attendant d'ouvrir des boosters."}
      </p>
    </div>
  );
}
