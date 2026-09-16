"use client";

import type { ReactNode } from "react";
import { GameSelect } from "@/components/game-ui/GameSelect";
import { COLLECTION_SORT_OPTIONS, type SortMode } from "@/features/collection/cardFilters";
import styles from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";

interface CollectionToolbarProps {
  count: number;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
  /** Ouvre le tiroir de filtres — rendu uniquement là où la colonne de gauche est repliée (petits écrans). */
  onOpenFilters: () => void;
  /** Nombre de filtres actifs, affiché sur le bouton du tiroir. */
  activeFilterCount: number;
  /** Contrôles propres à l'écran, après le tri (ex : bascule du panneau de deck). */
  extra?: ReactNode;
}

/**
 * Barre au-dessus de la grille : l'effectif courant à gauche, le tri à
 * droite. Rien d'autre.
 *
 * En particulier, AUCUNE rangée de puces (Toutes / Standard / Abyssales /
 * Possédées / Manquantes) : ces axes vivent dans la colonne de gauche et
 * nulle part ailleurs — deux endroits pour le même filtre, c'est deux
 * endroits à synchroniser et un doute permanent sur lequel fait foi.
 */
export function CollectionToolbar({
  count,
  sort,
  onSortChange,
  onOpenFilters,
  activeFilterCount,
  extra,
}: CollectionToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button type="button" className={`${game.chip} ${styles.filtersToggle}`} onClick={onOpenFilters}>
        <svg viewBox="0 0 24 24" fill="none" width="15" height="15" aria-hidden>
          <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        Filtres
        {activeFilterCount > 0 && <span className={game.badge}>{activeFilterCount}</span>}
      </button>

      <p className={styles.count}>
        <span className={styles.countValue}>{count}</span> carte{count > 1 ? "s" : ""}
      </p>

      <div className={styles.sort}>
        <span className={styles.sortLabel}>Trier par</span>
        <GameSelect value={sort} options={COLLECTION_SORT_OPTIONS} onChange={onSortChange} className={styles.sortSelect} aria-label="Trier par" />
      </div>
      {extra}
    </div>
  );
}
