"use client";

import { useCardShelf } from "@/features/collection/shelf/CardShelfProvider";
import { SaveToNotebook } from "@/features/collection/shelf/SaveToNotebook";
import { HeartGlyph } from "@/features/collection/CollectionSidebar";
import { playButtonClick } from "@/lib/sound";
import styles from "@/features/collection/shelf/Shelf.module.css";

/**
 * Favori et carnets dans la fiche d'une carte : le cœur, puis le geste de
 * Pinterest — « [Carnet ▾] [Enregistrer] » (`SaveToNotebook`), le même que
 * sur la grille au survol.
 *
 * Rien hors d'une étagère disponible : la fiche ouverte d'un booster, du
 * marché ou d'une partie reste telle qu'elle était.
 */
export function CardShelfControls({ cardId }: { cardId: string }) {
  const shelf = useCardShelf();
  if (!shelf?.available) return null;
  const favorite = shelf.isFavorite(cardId);
  const saved = shelf.notebooksOf(cardId);

  return (
    <section className={styles.controls} aria-label="Favori et carnets">
      <div className={styles.controlsRow}>
        <button
          type="button"
          className={styles.favoriteButton}
          data-on={favorite || undefined}
          aria-pressed={favorite}
          onClick={() => {
            playButtonClick();
            shelf.toggleFavorite(cardId);
          }}
        >
          <HeartGlyph filled={favorite} />
          Favori
        </button>
        <SaveToNotebook cardId={cardId} variant="inline" />
      </div>
      {saved.length > 0 && (
        <p className={styles.savedIn}>
          Dans {saved.length > 1 ? "les carnets" : "le carnet"} {saved.map((notebook) => `« ${notebook.name} »`).join(", ")}
        </p>
      )}
    </section>
  );
}
