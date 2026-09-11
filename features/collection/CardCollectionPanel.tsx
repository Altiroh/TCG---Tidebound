"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CORE_SET, type CardDefinition, type CardInstance, type CardType } from "@/game";
import { FilterChip } from "@/components/game-ui/FilterChip";
import { GameModal } from "@/components/game-ui/GameModal";
import { GameSelect } from "@/components/game-ui/GameSelect";
import { SearchField } from "@/components/game-ui/SearchField";
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
      className="fixed top-1/2 z-[60] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-[var(--accent)]"
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
        backgroundSize: "auto 180%",
        backgroundPosition: "left center",
        backgroundRepeat: "no-repeat",
        filter: active ? "none" : "grayscale(0.7) opacity(0.6)",
      }}
    />
  );
}

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
 * entre `CollectionScreen` et `DeckEditorScreen`. Un seul cluster de
 * contrôle discret en haut (filtres à gauche, recherche/tri à droite,
 * repliés tant qu'ils ne servent pas) plutôt que deux blocs opposés qui se
 * disputaient l'attention avec la grille — la grille elle-même est le seul
 * élément qui doit dominer l'écran.
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
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={activeType === null} onClick={() => setActiveType(null)}>
            Tout
          </FilterChip>
          {TYPE_FILTERS.map((type) => (
            <FilterChip
              key={type}
              active={activeType === type}
              onClick={() => setActiveType((current) => (current === type ? null : type))}
              title={CARD_TYPE_LABELS[type]}
              aria-label={CARD_TYPE_LABELS[type]}
              className="!h-8 !w-8 overflow-hidden !rounded-full !p-0"
            >
              <TypeIcon type={type} active={activeType === type} />
            </FilterChip>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Rechercher une carte..." />
          <GameSelect
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: `Trier : ${o.label}` }))}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {cards.length === 0 ? (
          <EmptyState hasAnyCards={ownedCardIds.length > 0} />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
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

      {mode === "browse" && detailCardId && (
        <GameModal onClose={() => setDetailCardId(null)} className="!bg-transparent !shadow-none !p-0">
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setDetailCardId(null)}
              className="fixed right-6 top-6 z-[60] flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] transition-colors hover:bg-white/10 hover:text-[var(--accent)]"
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
        </GameModal>
      )}
    </div>
  );
}

/** État vide : quelques emplacements de carte factices (asset fourni par l'utilisateur) plutôt qu'un simple message sec. */
function EmptyState({ hasAnyCards }: { hasAnyCards: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="grid grid-cols-3 gap-4 opacity-50 sm:grid-cols-6" style={{ width: "min(100%, 640px)" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, simple silhouette décorative
          <img key={i} src={EMPTY_SLOT_SRC} alt="" className="aspect-[5/7] w-full rounded-md object-cover shadow-md" />
        ))}
      </div>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">
        {hasAnyCards
          ? "Aucune carte ne correspond à ces filtres."
          : "Tu ne possèdes encore aucune carte : joue avec un deck préconstruit en attendant d'ouvrir des boosters."}
      </p>
    </div>
  );
}
