"use client";

import { useCallback, useMemo, useState } from "react";
import { CORE_SET } from "@/game";
import { compareCards, type SortMode } from "@/features/collection/cardFilters";
import {
  EMPTY_FILTERS,
  matchesFilters,
  type CollectionFilterState,
} from "@/features/collection/collectionFilters";
import { useDebouncedValue } from "@/features/collection/useDebouncedValue";
import { CardGrid } from "@/features/collection/CardGrid";
import { CollectionSidebar } from "@/features/collection/CollectionSidebar";
import { CollectionToolbar } from "@/features/collection/CollectionToolbar";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { SearchLine } from "@/features/shell/SearchLine";
import styles from "@/features/collection/CollectionScreen.module.css";
import shell from "@/features/shell/ScreenShell.module.css";

interface CollectionScreenProps {
  isSignedIn: boolean;
  /** Cartes possédées (`player_cards.card_id`, quantité > 0). Ignoré si `isSignedIn` est `false`. */
  ownedCardIds: string[];
}

/**
 * Écran Collection.
 *
 * Trois plans : le décor maritime en plein écran
 * (`collection/collection_background_2.webp`, posé par le module CSS), la
 * colonne de filtres à gauche, la grille de cartes à droite. Le bandeau de
 * navigation reste celui de la coquille partagée, simplement privé de son
 * panorama pour se fondre dans ce décor-ci.
 *
 * Changement de fond par rapport à la version précédente : la grille montre
 * désormais TOUT le catalogue, les cartes non possédées estompées, au lieu
 * de masquer purement et simplement ce qui manque. C'est ce qui donne un
 * sens au filtre « Manquantes » — et à une collection en général.
 *
 * Un visiteur non connecté n'a pas de possession connue : il feuillette le
 * catalogue entier sans estompage ni section « Statut de collection »,
 * plutôt que de se voir annoncer qu'il possède tout.
 */
export function CollectionScreen({ isSignedIn, ownedCardIds }: CollectionScreenProps) {
  const owned = useMemo(() => (isSignedIn ? new Set(ownedCardIds) : null), [isSignedIn, ownedCardIds]);
  /** Ensemble utilisé par les filtres : vide plutôt que `null`, pour ne pas avoir à tester partout. */
  const ownedForFilters = useMemo(() => owned ?? new Set<string>(), [owned]);

  const [filters, setFilters] = useState<CollectionFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortMode>("name");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Le champ reste réactif à chaque frappe ; seul le filtrage réel attend
  // une pause de frappe.
  const debouncedSearch = useDebouncedValue(filters.search, 200);
  const appliedFilters = useMemo<CollectionFilterState>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const filteredCards = useMemo(
    () =>
      CORE_SET.filter((def) => matchesFilters(def, appliedFilters, ownedForFilters)).sort((a, b) =>
        compareCards(a, b, sort)
      ),
    [appliedFilters, ownedForFilters, sort]
  );

  const patchFilters = useCallback((patch: Partial<CollectionFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  // La navigation de la fiche tourne en boucle sur la SÉLECTION COURANTE,
  // pas sur le catalogue entier : les flèches suivent ce qu'on a sous les yeux.
  const showRelative = useCallback(
    (delta: number) => {
      setDetailCardId((currentId) => {
        if (!currentId || filteredCards.length === 0) return currentId;
        const index = filteredCards.findIndex((def) => def.id === currentId);
        if (index === -1) return currentId;
        const next = filteredCards[(index + delta + filteredCards.length) % filteredCards.length];
        return next ? next.id : currentId;
      });
    },
    [filteredCards]
  );

  const activeFilterCount =
    (filters.variant !== "all" ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.ownership !== "all" ? 1 : 0) +
    (filters.costs.length > 0 ? 1 : 0);

  return (
    <div className={`${shell.screen} ${styles.screen}`}>
      <ScreenHeader
        active="collection"
        // L'écran peint déjà sa propre scène marine : un second panorama
        // dans le bandeau ferait deux horizons l'un au-dessus de l'autre.
        showPanorama={false}
        actions={
          <div className={styles.headerSearch}>
            <SearchLine
              value={filters.search}
              onChange={(search) => patchFilters({ search })}
              placeholder="Rechercher une carte…"
              label="Rechercher une carte"
            />
          </div>
        }
      />

      <div className={styles.workspace} data-drawer={drawerOpen ? "open" : "closed"}>
        {/* Voile du tiroir : ferme les filtres au clic à côté, sur les
            formats où la colonne passe par-dessus la grille. */}
        <button
          type="button"
          className={styles.drawerScrim}
          aria-label="Fermer les filtres"
          onClick={() => setDrawerOpen(false)}
        />

        <aside className={`${styles.panel} ${styles.sidebar}`} aria-label="Filtres de la collection">
          <CollectionSidebar
            filters={filters}
            onChange={patchFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
            owned={ownedForFilters}
            showOwnership={isSignedIn}
          />
        </aside>

        <main className={`${styles.panel} ${styles.main}`}>
          <CollectionToolbar
            count={filteredCards.length}
            sort={sort}
            onSortChange={setSort}
            onOpenFilters={() => setDrawerOpen((open) => !open)}
            activeFilterCount={activeFilterCount}
          />

          <CardGrid
            cards={filteredCards}
            onCardClick={setDetailCardId}
            // Ce que le joueur possède, PAS ce que le filtre laisse passer :
            // sinon une recherche sans résultat afficherait « tu ne possèdes
            // aucune carte » à un joueur qui en a.
            hasAnyCards={!isSignedIn || ownedCardIds.length > 0}
            owned={owned}
          />
        </main>
      </div>

      {detailCardId && (
        <CardDetailModal
          cardId={detailCardId}
          onClose={() => setDetailCardId(null)}
          onPrevious={filteredCards.length > 1 ? () => showRelative(-1) : undefined}
          onNext={filteredCards.length > 1 ? () => showRelative(1) : undefined}
          onShowCard={setDetailCardId}
        />
      )}
    </div>
  );
}
