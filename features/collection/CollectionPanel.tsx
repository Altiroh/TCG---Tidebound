"use client";

import type { CardDefinition } from "@/game";
import styles from "@/features/collection/CollectionScreen.module.css";
import { CardGrid } from "@/features/collection/CardGrid";
import { SortControl } from "@/features/collection/SortControl";
import type { SortMode } from "@/features/collection/cardFilters";

interface CollectionPanelProps {
  cards: CardDefinition[];
  hasAnyCards: boolean;
  onCardClick: (cardId: string) => void;
  sort: SortMode;
  onSortChange: (sort: SortMode) => void;
}

/**
 * Grand panneau parchemin central. `DecorativeFrame` porte le cadre laiton
 * (anneaux de `box-shadow`, cf. module CSS) autour de `CollectionContent`,
 * qui porte lui-même la texture et sert d'ancre `position:relative` au
 * `SortControl` — jamais positionné par rapport à l'écran entier.
 */
export function CollectionPanel({ cards, hasAnyCards, onCardClick, sort, onSortChange }: CollectionPanelProps) {
  return (
    <div className={styles.panelOuter}>
      <div className={styles.panelFrameWrap}>
        <div className={styles.decorativeFrame}>
          <span className={`${styles.rivet} ${styles.rivetTL}`} />
          <span className={`${styles.rivet} ${styles.rivetTR}`} />
          <span className={`${styles.rivet} ${styles.rivetBL}`} />
          <span className={`${styles.rivet} ${styles.rivetBR}`} />

          <div className={styles.collectionContent}>
            <svg className={styles.compassRose} viewBox="0 0 100 100" fill="none" aria-hidden>
              <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth={1} />
              <circle cx="50" cy="50" r="2" fill="currentColor" />
              <path d="M50 6L50 94M6 50L94 50M18 18L82 82M82 18L18 82" stroke="currentColor" strokeWidth={0.6} />
              <path d="M50 12L56 50L50 88L44 50Z" fill="currentColor" opacity={0.5} />
              <path d="M12 50L50 44L88 50L50 56Z" fill="currentColor" opacity={0.5} />
            </svg>

            <div className={styles.coastCornerLeft} aria-hidden />
            <div className={styles.coastCornerRight} aria-hidden />

            <SortControl value={sort} onChange={onSortChange} />
            <CardGrid cards={cards} onCardClick={onCardClick} hasAnyCards={hasAnyCards} />
          </div>
        </div>
      </div>
    </div>
  );
}
