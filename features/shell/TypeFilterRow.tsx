"use client";

import type { CardType } from "@/game";
import styles from "@/features/shell/ScreenShell.module.css";
import { TYPE_FILTERS } from "@/features/collection/cardFilters";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { playButtonClick } from "@/lib/sound";

interface TypeFilterRowProps {
  activeType: CardType | null;
  onChange: (type: CardType | null) => void;
}

/**
 * Rangée de filtres de type — « Toutes », un séparateur de laiton, puis une
 * icône compacte par type. Plus de médaillon rond à anneau de laiton : la
 * zone de clic est transparente au repos, c'est l'icône (quasi monochrome
 * et peu contrastée) qui porte l'état, cf. `.filterButton`/`.filterIcon`.
 *
 * Partagée par la Collection et le sélecteur de cartes de l'éditeur de
 * deck : les deux écrans filtrent la même chose, ils doivent le faire avec
 * exactement les mêmes signes.
 */
export function TypeFilterRow({ activeType, onChange }: TypeFilterRowProps) {
  return (
    <div className={styles.filterGroup}>
      <FilterButton active={activeType === null} onClick={() => onChange(null)} />
      <span className={styles.filterRule} aria-hidden />
      {TYPE_FILTERS.map((type) => (
        <FilterButton
          key={type}
          active={activeType === type}
          onClick={() => onChange(activeType === type ? null : type)}
          type={type}
        />
      ))}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  /** Icône de type — omis pour le filtre « Toutes » (libellé texte). */
  type?: CardType;
}

function FilterButton({ active, onClick, type }: FilterButtonProps) {
  const label = type ? CARD_TYPE_LABELS[type] : "Toutes";

  return (
    <button
      type="button"
      aria-pressed={active}
      title={label}
      aria-label={label}
      onClick={() => {
        playButtonClick();
        onClick();
      }}
      className={active ? styles.filterButtonActive : styles.filterButton}
    >
      {type ? (
        <span
          aria-hidden
          className={styles.filterIcon}
          style={{ backgroundImage: `url(/assets/cards/icons/TYPE_${type.toUpperCase()}_STANDARD.png)` }}
        />
      ) : (
        label
      )}
    </button>
  );
}
