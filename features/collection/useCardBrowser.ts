"use client";

import { useCallback, useMemo, useState } from "react";
import { CORE_SET, type CardDefinition } from "@/game";
import { compareCards, type SortMode } from "@/features/collection/cardFilters";
import {
  EMPTY_FILTERS,
  matchesFilters,
  type CollectionFilterState,
} from "@/features/collection/collectionFilters";
import { useDebouncedValue } from "@/features/collection/useDebouncedValue";

interface UseCardBrowserOptions {
  /** Cartes possédées ; `null` = possession inconnue (visiteur). */
  owned: ReadonlySet<string> | null;
  /** Filtres de départ — le Deck Builder ouvre sur les cartes possédées, la Collection sur tout. */
  initialFilters?: Partial<CollectionFilterState>;
}

/**
 * Tout ce qu'un écran qui FEUILLETTE le catalogue a en commun : l'état des
 * filtres, la recherche débouncée, le tri, le tiroir de filtres des petits
 * écrans, et la navigation carte précédente / suivante dans la sélection.
 *
 * Partagé entre la Collection et le Deck Builder : les deux écrans sont le
 * même navigateur de cartes, le second ajoutant seulement une colonne de
 * deck à droite. Un filtre qui se comporterait différemment d'un écran à
 * l'autre serait un bug — d'où un seul hook plutôt que deux copies.
 */
export function useCardBrowser({ owned, initialFilters }: UseCardBrowserOptions) {
  /** Ensemble utilisé par les filtres : vide plutôt que `null`, pour ne pas avoir à tester partout. */
  const ownedForFilters = useMemo(() => owned ?? new Set<string>(), [owned]);

  const [filters, setFilters] = useState<CollectionFilterState>(() => ({ ...EMPTY_FILTERS, ...initialFilters }));
  const [sort, setSort] = useState<SortMode>("name");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Le champ reste réactif à chaque frappe ; seul le filtrage réel attend
  // une pause de frappe.
  const debouncedSearch = useDebouncedValue(filters.search, 200);
  const appliedFilters = useMemo<CollectionFilterState>(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const cards = useMemo<CardDefinition[]>(
    () =>
      CORE_SET.filter((def) => matchesFilters(def, appliedFilters, ownedForFilters)).sort((a, b) =>
        compareCards(a, b, sort)
      ),
    [appliedFilters, ownedForFilters, sort]
  );

  const patchFilters = useCallback((patch: Partial<CollectionFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS, ...initialFilters });
    // `initialFilters` est un objet littéral côté appelant : le recréer à
    // chaque rendu re-déclencherait tout ; on ne dépend donc que de son contenu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialFilters ?? {})]);

  /** Identifiant de la carte à `delta` positions de `currentId` dans la sélection courante, en boucle. */
  const relativeCardId = useCallback(
    (currentId: string, delta: number): string => {
      if (cards.length === 0) return currentId;
      const index = cards.findIndex((def) => def.id === currentId);
      if (index === -1) return currentId;
      return cards[(index + delta + cards.length) % cards.length]?.id ?? currentId;
    },
    [cards]
  );

  const activeFilterCount =
    (filters.variant !== "all" ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.ownership !== "all" ? 1 : 0) +
    (filters.costs.length > 0 ? 1 : 0) +
    (filters.boosters.length > 0 ? 1 : 0);

  return {
    filters,
    patchFilters,
    resetFilters,
    sort,
    setSort,
    cards,
    ownedForFilters,
    activeFilterCount,
    drawerOpen,
    setDrawerOpen,
    relativeCardId,
  };
}
