"use client";

import { useState, type FormEvent } from "react";
import { useCardShelf } from "@/features/collection/shelf/CardShelfProvider";
import { HeartGlyph, NotebookGlyph } from "@/features/collection/CollectionSidebar";
import { NOTEBOOK_LIMIT, NOTEBOOK_NAME_MAX } from "@/features/collection/shelf/shelf";
import { playButtonClick } from "@/lib/sound";
import styles from "@/features/collection/shelf/Shelf.module.css";

/**
 * « Favori & carnets » dans la fiche d'une carte : le cœur, et la liste des
 * carnets du joueur, cochés quand la carte y est rangée — comme « Enregistrer
 * dans un tableau » sur Pinterest. Un nouveau carnet se crée d'ici, la carte
 * y est rangée d'emblée.
 *
 * Rien hors d'une étagère disponible : la fiche ouverte d'un booster, du
 * marché ou d'une partie reste telle qu'elle était.
 */
export function CardShelfControls({ cardId }: { cardId: string }) {
  const shelf = useCardShelf();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!shelf?.available) return null;

  const favorite = shelf.isFavorite(cardId);
  const inside = new Set(shelf.notebooksOf(cardId).map((notebook) => notebook.id));
  // Par NOM, pas par date : cocher un carnet le rend « récent », et la liste
  // ne doit pas se réordonner sous le curseur.
  const notebooks = [...shelf.shelf.notebooks].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const full = shelf.shelf.notebooks.length >= NOTEBOOK_LIMIT;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!shelf || busy) return;
    setBusy(true);
    setError(null);
    const result = await shelf.createNotebook(name, cardId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setCreating(false);
  }

  return (
    <section className={styles.controls} aria-label="Favori et carnets">
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
        {favorite ? "Dans vos favoris" : "Mettre en favori"}
      </button>

      <div className={styles.notebookPicker}>
        <span className={styles.pickerTitle}>
          <NotebookGlyph /> Ranger dans un carnet
        </span>
        {notebooks.length > 0 && (
          <ul className={styles.pickerList}>
            {notebooks.map((notebook) => {
              const checked = inside.has(notebook.id);
              return (
                <li key={notebook.id}>
                  <label className={styles.pickerRow} data-checked={checked || undefined}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        playButtonClick();
                        shelf.setInNotebook(notebook.id, cardId, !checked);
                      }}
                    />
                    <span className={styles.pickerName}>{notebook.name}</span>
                    <span className={styles.pickerCount}>{notebook.cardIds.length}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {creating ? (
          <form className={styles.createForm} onSubmit={submit}>
            <input
              autoFocus
              value={name}
              maxLength={NOTEBOOK_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du carnet (ex. Combo Abysses)"
              aria-label="Nom du nouveau carnet"
              onKeyDown={(event) => {
                // Échap ferme le formulaire, pas la fiche entière.
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setCreating(false);
                }
              }}
            />
            <button type="submit" disabled={busy || !name.trim()}>
              Créer
            </button>
          </form>
        ) : (
          <button
            type="button"
            className={styles.newNotebook}
            disabled={full}
            title={full ? `${NOTEBOOK_LIMIT} carnets au plus` : undefined}
            onClick={() => {
              playButtonClick();
              setCreating(true);
            }}
          >
            + Nouveau carnet
          </button>
        )}
        {error && (
          <p className={styles.inlineError} role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
