"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition } from "@/game";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { fetchCardShelf } from "@/features/collection/shelf/shelfActions";
import { updateProfileIdentity } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/progression/IllustrationPicker.module.css";
import { playButtonClick } from "@/lib/sound";

interface IllustrationPickerProps {
  /** L'illustration enregistrée. */
  avatarCardId: string | null;
  ownedCardIds: readonly string[];
  /** L'illustration essayée (montrée en direct par le profil, à gauche) ; `null` : aucune. */
  selectedId: string | null;
  onSelect: (cardId: string | null) => void;
  /** Fermeture sans enregistrer : le profil revient à l'illustration enregistrée. */
  onClose: () => void;
  /** Enregistrement réussi de `cardId`. */
  onSaved: (cardId: string | null) => void;
}

/** Insensible aux accents et à la casse. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * CHOIX DE L'ILLUSTRATION de profil — un panneau à droite de l'écran ; le
 * profil reste visible à gauche et montre EN DIRECT la carte essayée. Un
 * clic essaie, « Valider » enregistre, « Annuler » (ou Échap) revient à
 * l'illustration enregistrée. Une recherche va droit à la carte voulue.
 *
 * Seules les cartes POSSÉDÉES sont proposées ; le serveur revérifie la
 * possession (`set_profile_identity`). Le filtre « Favoris » restreint aux
 * cartes mises en favori (le cœur de la Collection) ; il n'apparaît que si
 * le joueur a une étagère (`fetchCardShelf`).
 */
export function IllustrationPicker({ avatarCardId, ownedCardIds, selectedId, onSelect, onClose, onSaved }: IllustrationPickerProps) {
  const [query, setQuery] = useState("");
  // `null` : pas d'étagère (hors connexion, lecture refusée) — ni filtre ni cœurs.
  const [favorites, setFavorites] = useState<ReadonlySet<string> | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = useMemo(
    () => [...new Set(ownedCardIds)].map((cardId) => ({ cardId, name: cardName(cardId) })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [ownedCardIds]
  );
  const favoriteCount = useMemo(() => (favorites ? options.filter((option) => favorites.has(option.cardId)).length : 0), [options, favorites]);
  const filtering = onlyFavorites && favorites !== null;
  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    return options.filter((option) => (!filtering || favorites!.has(option.cardId)) && (!needle || normalize(option.name).includes(needle)));
  }, [options, query, filtering, favorites]);

  useEffect(() => {
    let alive = true;
    fetchCardShelf()
      .then((shelf) => alive && setFavorites(shelf ? new Set(shelf.favorites) : null))
      .catch(() => alive && setFavorites(null));
    return () => {
      alive = false;
    };
  }, []);

  const changed = selectedId !== avatarCardId;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function select(next: string | null) {
    playButtonClick();
    setError(null);
    onSelect(next);
  }

  function save() {
    playButtonClick();
    setError(null);
    const next = selectedId;
    startTransition(async () => {
      const result = await updateProfileIdentity({ avatarCardId: next });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      notifyProgressionChanged();
      onSaved(next);
    });
  }


  return createPortal(
    <section className={styles.picker} role="dialog" aria-label="Choix de l'illustration de profil">
      <header className={styles.head}>
        <button type="button" className={styles.back} onClick={onClose}>
          <span aria-hidden>←</span> Retour
        </button>
        <h2 className={styles.title}>Ton illustration de profil</h2>
        {selectedId && (
          <button type="button" className={styles.remove} onClick={() => select(null)} disabled={isPending}>
            Retirer l&apos;illustration
          </button>
        )}
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth={1.8} />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Rechercher parmi ${options.length} carte${options.length > 1 ? "s" : ""}…`}
            aria-label="Rechercher une carte"
            autoFocus
          />
          {(query || filtering) && (
            <span className={styles.count}>
              {shown.length} résultat{shown.length > 1 ? "s" : ""}
            </span>
          )}
        </label>
        {favorites && (
          <button
            type="button"
            className={styles.favoriteFilter}
            data-on={onlyFavorites || undefined}
            aria-pressed={onlyFavorites}
            onClick={() => {
              playButtonClick();
              setOnlyFavorites((value) => !value);
            }}
            title={onlyFavorites ? "Voir toutes les cartes" : "Ne voir que les cartes mises en favori"}
          >
            <HeartGlyph filled={onlyFavorites} />
            Favoris <span className={styles.favoriteCount}>{favoriteCount}</span>
          </button>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {options.length === 0 ? (
        <p className={styles.empty}>Tu n&apos;as encore aucune carte. Ouvre un booster : chaque carte obtenue devient une illustration possible.</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>
          {filtering && favoriteCount === 0
            ? "Aucune de tes cartes n'est en favori : mets-en avec le cœur, dans ta Collection."
            : query
              ? `Aucune carte${filtering ? " favorite" : ""} ne correspond à « ${query} ».`
              : "Aucune carte à afficher."}
        </p>
      ) : (
        <ul className={styles.grid}>
          {shown.map(({ cardId, name }) => (
            <li key={cardId}>
              <button
                type="button"
                className={styles.option}
                data-active={cardId === selectedId ? "true" : undefined}
                data-saved={cardId === avatarCardId || undefined}
                aria-pressed={cardId === selectedId}
                onClick={() => select(cardId)}
                disabled={isPending}
                title={name}
              >
                <span className={styles.art} style={{ backgroundImage: `url("${cardIllustrationThumbUrl(cardId)}")` }} aria-hidden>
                  {favorites?.has(cardId) && (
                    <span className={styles.favoriteMark}>
                      <HeartGlyph />
                    </span>
                  )}
                </span>
                <span className={styles.name}>{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.foot}>
        <span className={styles.footNote}>
          {changed ? (selectedId ? `Essai : ${cardName(selectedId)}` : "Essai : sans illustration") : "Touche une carte pour l'essayer sur ton profil."}
        </span>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={isPending}>
          Annuler
        </button>
        <button type="button" className={styles.save} onClick={save} disabled={!changed || isPending}>
          {isPending ? "Enregistrement…" : "Valider"}
        </button>
      </footer>
    </section>,
    document.body
  );
}

/** Le cœur des favoris (même tracé que celui de la Collection). */
function HeartGlyph({ filled = true }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}
