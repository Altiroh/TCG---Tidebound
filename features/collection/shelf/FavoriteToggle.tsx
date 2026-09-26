"use client";

import { useCardShelf } from "@/features/collection/shelf/CardShelfProvider";
import { HeartGlyph } from "@/features/collection/CollectionSidebar";
import { playButtonClick } from "@/lib/sound";
import styles from "@/features/collection/shelf/Shelf.module.css";

/**
 * Le CŒUR d'une carte de la grille, dans son coin haut droit : plein et
 * toujours visible sur une carte favorite, discret (au survol) sur les
 * autres. Un clic ne touche que le favori — jamais la carte en dessous
 * (ouverture de fiche, ajout au deck).
 *
 * Rien hors d'une étagère disponible (visiteur, écran sans étagère).
 */
export function FavoriteToggle({ cardId, cardName }: { cardId: string; cardName: string }) {
  const shelf = useCardShelf();
  if (!shelf?.available) return null;
  const favorite = shelf.isFavorite(cardId);
  return (
    <button
      type="button"
      className={styles.heart}
      data-on={favorite || undefined}
      aria-pressed={favorite}
      aria-label={favorite ? `Retirer ${cardName} des favoris` : `Mettre ${cardName} en favori`}
      title={favorite ? "Retirer des favoris" : "Mettre en favori"}
      onClick={(event) => {
        event.stopPropagation();
        playButtonClick();
        shelf.toggleFavorite(cardId);
      }}
    >
      <HeartGlyph filled={favorite} />
    </button>
  );
}
