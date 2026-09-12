"use client";

import Link from "next/link";
import type { CardType } from "@/game";
import styles from "@/features/collection/CollectionScreen.module.css";
import { TYPE_FILTERS } from "@/features/collection/cardFilters";
import { FilterButton } from "@/features/collection/FilterButton";
import { SearchBar } from "@/features/collection/SearchBar";
import { playButtonClick } from "@/lib/sound";

interface CollectionToolbarProps {
  activeType: CardType | null;
  onTypeChange: (type: CardType | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

/**
 * Barre basse : Créer / médaillons de filtre / recherche — plus de
 * pagination (la collection défile désormais verticalement dans le
 * panneau). La recherche récupère l'espace libéré, cf. `.toolbar` dans le
 * module CSS.
 */
export function CollectionToolbar({ activeType, onTypeChange, search, onSearchChange }: CollectionToolbarProps) {
  return (
    <footer className={styles.toolbar}>
      <Link href="/decks/nouveau" className={styles.createButton} onClick={() => playButtonClick()}>
        Créer
      </Link>

      <div className={styles.filterGroup}>
        <FilterButton active={activeType === null} onClick={() => onTypeChange(null)} />
        {TYPE_FILTERS.map((type) => (
          <FilterButton key={type} active={activeType === type} onClick={() => onTypeChange(activeType === type ? null : type)} type={type} />
        ))}
      </div>

      <SearchBar value={search} onChange={onSearchChange} />
    </footer>
  );
}
