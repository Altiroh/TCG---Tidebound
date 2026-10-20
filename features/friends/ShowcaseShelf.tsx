"use client";

import { useMemo } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { editionLabel, isClassicEdition } from "@/game/cosmetics/editions";
import { CardTile } from "@/features/match/CardTile";
import type { Showcase, ShowcaseCard } from "@/features/friends/showcaseRules";
import styles from "@/features/friends/Social.module.css";

/** Instance factice : une carte hors de toute partie (comme la grille de la Collection). */
function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: `vitrine-${cardId}`,
    cardId,
    ownerId: "vitrine",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/** Une carte exposée, dans son édition ; cliquable avec `onClick`. */
export function ShowcaseTile({ card, onClick }: { card: ShowcaseCard; onClick?: () => void }) {
  const instance = useMemo(() => displayInstance(card.cardId), [card.cardId]);
  return (
    <CardTile
      instance={instance}
      tideState="calme"
      widthClassName="w-full"
      scaleOnHover={false}
      showStatusBadges={false}
      finish={card.finish !== "classique" ? card.finish : undefined}
      artwork={card.artwork !== "classique" ? card.artwork : undefined}
      artworkOwned
      onClick={onClick}
    />
  );
}

interface ShowcaseShelfProps {
  showcase: Showcase;
  /** Format serré (écran de présentation) : six cartes sur une ligne, sans légende. */
  compact?: boolean;
  /** Emplacement choisi dans l'éditeur, cliquable. */
  selectedSlot?: number | null;
  onSelectSlot?: (slot: number) => void;
  /** Texte d'un emplacement vide. */
  emptyLabel?: string;
}

/**
 * VITRINE : six cartes mises en avant, dans l'édition choisie (une
 * Full-Art Star Foil se voit comme telle). Lecture seule, ou cliquable dans
 * l'éditeur (`onSelectSlot`).
 */
export function ShowcaseShelf({ showcase, compact = false, selectedSlot = null, onSelectSlot, emptyLabel = "Vide" }: ShowcaseShelfProps) {
  return (
    <div className={`${styles.shelf} ${compact ? styles.shelfCompact : ""}`}>
      {showcase.map((card, slot) => {
        const label = card ? `${getCardDefinition(card.cardId).name}${isClassicEdition(card) ? "" : ` · ${editionLabel(card)}`}` : emptyLabel;
        const select = onSelectSlot ? () => onSelectSlot(slot) : undefined;
        // `CardTile` est déjà un bouton : il porte lui-même le clic de l'éditeur.
        const content = card ? (
          <ShowcaseTile card={card} onClick={select} />
        ) : select ? (
          <button type="button" className={`${styles.slotEmpty} ${styles.slotButton}`} aria-label={`Emplacement ${slot + 1} : vide`} onClick={select}>
            {emptyLabel}
          </button>
        ) : (
          <span className={styles.slotEmpty}>{emptyLabel}</span>
        );
        return (
          <div key={slot} className={`${styles.slot} ${selectedSlot === slot ? styles.slotSelected : ""}`} title={label}>
            {content}
            {!compact && (card || select) && <span className={styles.slotLabel}>{card ? label : `Emplacement ${slot + 1}`}</span>}
          </div>
        );
      })}
    </div>
  );
}
