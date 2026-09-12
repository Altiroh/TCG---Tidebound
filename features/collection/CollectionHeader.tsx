"use client";

import styles from "@/features/collection/CollectionScreen.module.css";
import { NavigationTab } from "@/features/collection/NavigationTab";

interface CollectionHeaderProps {
  active: "collection" | "decks";
  onNavigate: (tab: "collection" | "decks") => void;
}

/**
 * Bandeau du haut : Retour / Collection / Decks à gauche, panorama marin
 * décoratif au centre (rempli via `minmax(0, 1fr)`, jamais positionné en
 * dur), blason à droite. Chaque zone est un vrai conteneur indépendant —
 * aucune ne dépend de la résolution de l'écran.
 */
export function CollectionHeader({ active, onNavigate }: CollectionHeaderProps) {
  return (
    <header className={styles.header}>
      <NavigationTab href="/">
        <span className={styles.backArrow} aria-hidden>
          ‹
        </span>
        Retour
      </NavigationTab>

      <NavigationTab active={active === "collection"} onClick={() => onNavigate("collection")}>
        Collection
      </NavigationTab>

      <NavigationTab active={active === "decks"} onClick={() => onNavigate("decks")}>
        Decks
      </NavigationTab>

      <div className={styles.panorama} aria-hidden>
        <div className={styles.panoramaStars} />
        <div className={styles.panoramaPeaksFar} />
        <div className={styles.panoramaPeaks} />
        <div className={styles.panoramaWater} />
      </div>

      <div className={styles.emblem} aria-hidden>
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none">
          <path
            d="M12 2v13m0 0l-3-3m3 3l3-3M6 8h12M8 5h8M12 15v3a4 4 0 0 1-4 4M12 18a4 4 0 0 0 4 4"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </header>
  );
}
