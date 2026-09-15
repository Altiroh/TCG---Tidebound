"use client";

import { useMemo, useState, useTransition } from "react";
import { getCardDefinition } from "@/game";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { updateProfileIdentity } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/progression/IllustrationPicker.module.css";
import { playButtonClick } from "@/lib/sound";

interface IllustrationPickerProps {
  avatarCardId: string | null;
  ownedCardIds: readonly string[];
  onClose: () => void;
  onChanged: () => void;
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
 * CHOIX DE L'ILLUSTRATION de profil — dans la partie droite du profil, à la
 * place de l'onglet : toute la largeur pour parcourir la collection, et une
 * recherche pour aller droit à la carte voulue.
 *
 * Seules les cartes POSSÉDÉES sont proposées ; le serveur revérifie la
 * possession (`set_profile_identity`).
 */
export function IllustrationPicker({ avatarCardId, ownedCardIds, onClose, onChanged }: IllustrationPickerProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options = useMemo(
    () => [...new Set(ownedCardIds)].map((cardId) => ({ cardId, name: cardName(cardId) })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [ownedCardIds]
  );
  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    return needle ? options.filter((option) => normalize(option.name).includes(needle)) : options;
  }, [options, query]);

  function commit(next: string | null) {
    playButtonClick();
    setError(null);
    startTransition(async () => {
      const result = await updateProfileIdentity({ avatarCardId: next });
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      notifyProgressionChanged();
      onChanged();
      onClose();
    });
  }

  return (
    <section className={styles.picker} aria-label="Choix de l'illustration de profil">
      <header className={styles.head}>
        <button type="button" className={styles.back} onClick={onClose}>
          <span aria-hidden>←</span> Retour
        </button>
        <h2 className={styles.title}>Ton illustration de profil</h2>
        {avatarCardId && (
          <button type="button" className={styles.remove} onClick={() => commit(null)} disabled={isPending}>
            Retirer l&apos;illustration
          </button>
        )}
      </header>

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
        {query && (
          <span className={styles.count}>
            {shown.length} résultat{shown.length > 1 ? "s" : ""}
          </span>
        )}
      </label>

      {error && <p className={styles.error}>{error}</p>}

      {options.length === 0 ? (
        <p className={styles.empty}>Tu n&apos;as encore aucune carte. Ouvre un booster : chaque carte obtenue devient une illustration possible.</p>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>Aucune carte ne correspond à « {query} ».</p>
      ) : (
        <ul className={styles.grid}>
          {shown.map(({ cardId, name }) => (
            <li key={cardId}>
              <button
                type="button"
                className={styles.option}
                data-active={cardId === avatarCardId ? "true" : undefined}
                onClick={() => commit(cardId)}
                disabled={isPending}
                title={name}
              >
                <span className={styles.art} style={{ backgroundImage: `url("${cardIllustrationUrl(cardId)}")` }} aria-hidden />
                <span className={styles.name}>{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
