"use client";

import { useState } from "react";
import { DECK_STYLES } from "@/game";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { SearchLine } from "@/features/shell/SearchLine";
import {
  hasActiveFilter,
  styleFilterLabel,
  type DeckFilterState,
  type StyleFilterId,
} from "@/features/decks/deckFilters";
import type { DeckCategory } from "@/features/decks/deckEntries";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import { playButtonClick } from "@/lib/sound";

export interface RailCategory {
  id: DeckCategory;
  label: string;
  count: number;
}

export interface RailShelf {
  id: string;
  label: string;
  count: number;
}

interface DeckRailProps {
  categories: readonly RailCategory[];
  category: DeckCategory;
  onCategory: (next: DeckCategory) => void;
  /** Étagères de « Mes decks » (construits, brouillons, corbeille) — absentes ailleurs. */
  shelves: readonly RailShelf[];
  shelf: string;
  onShelf: (next: string) => void;
  filters: DeckFilterState;
  onFilters: (next: DeckFilterState) => void;
  /** Les types réellement présents dans le rayon : une case qui ne filtre rien n'a rien à faire là. */
  availableStyles: ReadonlySet<StyleFilterId>;
  /** Idem pour les Navires, dans l'ordre d'apparition. */
  availableShips: readonly string[];
}

/**
 * LA COLONNE DE GAUCHE de l'écran Decks : où l'on est, et ce qu'on veut
 * voir.
 *
 * Deux blocs et rien d'autre. En haut le RAYON — mes decks, l'emprunt, les
 * préconstruits — qui change ce qu'on regarde. En dessous les FILTRES, qui
 * réduisent ce rayon sans jamais en changer. Un onglet qu'on quitte ne
 * remet pas les filtres à zéro : on compare deux rayons sous le même
 * critère, c'est tout l'intérêt de les avoir sortis de la grille.
 *
 * Les cases ne listent que ce qui EXISTE dans le rayon courant : proposer
 * « Combo » là où aucun deck n'est combo, c'est promettre un résultat vide.
 */
export function DeckRail({
  categories,
  category,
  onCategory,
  shelves,
  shelf,
  onShelf,
  filters,
  onFilters,
  availableStyles,
  availableShips,
}: DeckRailProps) {
  const styleOptions: StyleFilterId[] = [...DECK_STYLES.map((entry) => entry.id), "autre" as const].filter((id) =>
    availableStyles.has(id)
  );

  /*
   * LES FILTRES SE REPLIENT.
   *
   * Sur un téléphone couché, les deux listes de cases mangent la moitié de
   * la colonne et le rayon — où l'on est — se retrouve poussé hors champ.
   * Replié, on retrouve la carte du lieu d'un coup d'œil ; le nombre de
   * critères actifs reste affiché sur le titre, sinon on filtrerait sans
   * le savoir.
   */
  const [filtersOpen, setFiltersOpen] = useState(true);
  const activeCount = (filters.search.trim() === "" ? 0 : 1) + filters.styles.size + filters.ships.size;

  function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  return (
    <aside className={styles.rail} aria-label="Rayons et filtres">
      {/*
        La colonne NE DÉFILE PAS. Ce sont les listes qui défilent, chacune
        sous son propre titre : « Style de jeu » et « Navire » restent en
        place, et l'on sait toujours ce qu'on est en train de cocher.
      */}
      <div className={styles.railScroll}>
        <section className={styles.railGroup}>
          <p className={styles.railTitle}>
            <span className={styles.railTitleMark} aria-hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path d="M3 8.5L12 4l9 4.5-9 4.5-9-4.5z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
                <path d="M3 13l9 4.5L21 13M3 17l9 4.5L21 17" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
            </span>
            Decks
          </p>

          <ul className={styles.railList}>
            {categories.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.railItem}
                  data-active={category === entry.id || undefined}
                  aria-current={category === entry.id ? "true" : undefined}
                  onClick={() => {
                    if (category === entry.id) return;
                    playButtonClick();
                    onCategory(entry.id);
                  }}
                >
                  <span className={styles.railItemLabel}>{entry.label}</span>
                  <span className={styles.railItemCount}>{entry.count}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* Les étagères de « Mes decks » : un deck n'est que sur une seule,
              et la corbeille l'emporte sur le reste. */}
          {shelves.length > 0 && (
            <ul className={styles.railSubList}>
              {shelves.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={styles.railSubItem}
                    data-active={shelf === entry.id || undefined}
                    onClick={() => {
                      if (shelf === entry.id) return;
                      playButtonClick();
                      onShelf(entry.id);
                    }}
                  >
                    {entry.label}
                    <span className={styles.railItemCount}>{entry.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <hr className={game.rule} />

        <section className={styles.railGroup}>
          <button
            type="button"
            className={`${styles.railTitle} ${styles.railTitleToggle}`}
            aria-expanded={filtersOpen}
            onClick={() => {
              playButtonClick();
              setFiltersOpen((open) => !open);
            }}
          >
            <span className={styles.railTitleMark} aria-hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none">
                <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
              </svg>
            </span>
            Filtres
            {activeCount > 0 && (
              <span className={styles.railItemCount} aria-label={`${activeCount} critère${activeCount > 1 ? "s" : ""} actif${activeCount > 1 ? "s" : ""}`}>
                {activeCount}
              </span>
            )}
            <span className={styles.railTitleChevron} data-open={filtersOpen ? "true" : undefined} aria-hidden>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {filtersOpen && (
          <>
          <SearchLine
            value={filters.search}
            onChange={(search) => onFilters({ ...filters, search })}
            placeholder="Rechercher un deck…"
            label="Rechercher un deck"
          />

          {styleOptions.length > 0 && (
            <div className={styles.railFilter}>
              <p className={game.sectionTitle}>Style de jeu</p>
              <div className={styles.railChecks}>
                {styleOptions.map((id) => (
                  <label key={id} className={`${game.choice} ${styles.railCheck}`}>
                    <input
                      type="checkbox"
                      className={game.choiceInput}
                      checked={filters.styles.has(id)}
                      onChange={() => onFilters({ ...filters, styles: toggle(filters.styles, id) })}
                    />
                    <span className={game.choiceBox} aria-hidden />
                    {styleFilterLabel(id)}
                  </label>
                ))}
              </div>
            </div>
          )}

          {availableShips.length > 0 && (
            <div className={styles.railFilter}>
              <p className={game.sectionTitle}>Navire</p>
              <div className={styles.railChecks}>
                {availableShips.map((shipId) => (
                  <label key={shipId} className={`${game.choice} ${styles.railCheck}`}>
                    <input
                      type="checkbox"
                      className={game.choiceInput}
                      checked={filters.ships.has(shipId)}
                      onChange={() => onFilters({ ...filters, ships: toggle(filters.ships, shipId) })}
                    />
                    <span className={game.choiceBox} aria-hidden />
                    {shipNameOf(shipId)}
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className={`${game.secondary} ${game.buttonSm} ${styles.railReset}`}
            disabled={!hasActiveFilter(filters)}
            onClick={() => {
              playButtonClick();
              onFilters({ search: "", styles: new Set(), ships: new Set() });
            }}
          >
            Réinitialiser les filtres
          </button>
          </>
          )}
        </section>
      </div>

      {/* Le coin de table : lanterne, compas, carte marine. Purement décoratif,
          posé sous la colonne et jamais devant ce qui se lit. */}
      <span className={styles.railDecor} aria-hidden />
    </aside>
  );
}
