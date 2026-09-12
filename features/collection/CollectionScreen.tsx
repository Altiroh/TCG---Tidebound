"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CORE_SET, type CardType } from "@/game";
import styles from "@/features/collection/CollectionScreen.module.css";
import { CollectionHeader } from "@/features/collection/CollectionHeader";
import { CollectionPanel } from "@/features/collection/CollectionPanel";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { compareCards, normalizeSearch, type SortMode } from "@/features/collection/cardFilters";
import { useDebouncedValue } from "@/features/collection/useDebouncedValue";
import { GameModal } from "@/components/game-ui/GameModal";
import { CardInfoPanel } from "@/features/match/CardInfoPanel";
import { CardTile } from "@/features/match/CardTile";

/** Catalogue complet — utilisé quand personne n'est connecté : pas encore de compte, mais on doit quand même pouvoir feuilleter toutes les cartes ("pour l'instant"). */
const ALL_CARD_IDS = CORE_SET.map((def) => def.id);

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées par le joueur connecté (`player_cards.card_id`, quantité > 0) — la grille n'affiche que celles-ci. Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
}

/**
 * Écran Collection — reconstruction en zones indépendantes (Header / Panel /
 * Toolbar via CSS Grid, cf. `CollectionScreen.module.css`) de l'ambiance
 * maritime/parchemin/laiton de la maquette fournie. Aucune coordonnée n'est
 * calée sur une résolution donnée : chaque zone est responsive et calcule sa
 * propre taille via `clamp()`/`minmax()`/`1fr`.
 */
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  const router = useRouter();
  const ownedSet = useMemo(() => new Set(isSignedIn ? ownedCardIds : ALL_CARD_IDS), [isSignedIn, ownedCardIds]);

  const [activeType, setActiveType] = useState<CardType | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  // Le champ de recherche reste réactif à chaque frappe ; seul le filtrage réel (potentiellement coûteux
  // sur un grand catalogue) attend une pause de frappe avant de se recalculer.
  const debouncedSearch = useDebouncedValue(search, 200);

  const filteredCards = useMemo(() => {
    const query = normalizeSearch(debouncedSearch.trim());
    return CORE_SET.filter((def) => {
      if (!ownedSet.has(def.id)) return false;
      if (activeType && def.type !== activeType) return false;
      if (query && !normalizeSearch(def.name).includes(query)) return false;
      return true;
    }).sort((a, b) => compareCards(a, b, sort));
  }, [ownedSet, activeType, debouncedSearch, sort]);

  const detailIndex = detailCardId ? filteredCards.findIndex((def) => def.id === detailCardId) : -1;

  function showRelative(delta: number) {
    if (detailIndex === -1 || filteredCards.length === 0) return;
    const nextIndex = (detailIndex + delta + filteredCards.length) % filteredCards.length;
    const nextCard = filteredCards[nextIndex];
    if (nextCard) setDetailCardId(nextCard.id);
  }

  useEffect(() => {
    if (!detailCardId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailCardId(null);
      if (event.key === "ArrowLeft") showRelative(-1);
      if (event.key === "ArrowRight") showRelative(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailCardId]);

  return (
    <div className={styles.screen}>
      <CollectionHeader
        active="collection"
        onNavigate={(tab) => {
          if (tab === "decks") router.push("/decks");
        }}
      />

      <CollectionPanel
        cards={filteredCards}
        hasAnyCards={filteredCards.length > 0}
        onCardClick={setDetailCardId}
        sort={sort}
        onSortChange={setSort}
      />

      <CollectionToolbar activeType={activeType} onTypeChange={setActiveType} search={search} onSearchChange={setSearch} />

      {detailCardId && (
        <GameModal onClose={() => setDetailCardId(null)} className="!bg-transparent !shadow-none !p-0">
          <div className="flex items-center gap-8" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setDetailCardId(null)}
              className="fixed right-6 top-6 z-[60] flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-slate-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] transition-colors hover:bg-white/10 hover:text-amber-300"
            >
              Fermer
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </svg>
            </button>

            {filteredCards.length > 1 && (
              <button
                type="button"
                onClick={() => showRelative(-1)}
                aria-label="Carte précédente"
                className="fixed left-6 top-1/2 z-[60] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-amber-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {filteredCards.length > 1 && (
              <button
                type="button"
                onClick={() => showRelative(1)}
                aria-label="Carte suivante"
                className="fixed right-6 top-1/2 z-[60] flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-amber-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <div>
              <CardTile
                instance={{
                  instanceId: detailCardId,
                  cardId: detailCardId,
                  ownerId: "collection",
                  damageMarked: 0,
                  modifiers: [],
                  summoningSick: false,
                  hasAttackedThisTurn: false,
                }}
                tideState="calme"
                widthClassName="w-80 sm:w-96"
                onClick={() => setDetailCardId(null)}
              />
            </div>
            <div className="-my-8 hidden self-stretch sm:block">
              <CardInfoPanel cardId={detailCardId} />
            </div>
          </div>
        </GameModal>
      )}
    </div>
  );
}
