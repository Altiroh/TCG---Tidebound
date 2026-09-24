"use client";

import { useState, useTransition } from "react";
import { equipTitle } from "@/features/progression/profileActions";
import type { ProfileTitles } from "@/features/progression/titleService";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/progression/TitlePicker.module.css";
import { playButtonClick } from "@/lib/sound";

interface TitlePickerProps {
  titles: ProfileTitles;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * CHOIX DU TITRE — dans la partie droite du profil, à la place de
 * l'onglet, comme le choix d'illustration.
 *
 * Rien ne s'y achète : un titre se gagne par un exploit. Les titres
 * obtenus se choisissent, les autres restent visibles, grisés, avec leur
 * condition en clair. Le serveur revérifie le déblocage à l'équipement
 * (`equipTitle` → `set_player_title`).
 */
export function TitlePicker({ titles, onClose, onChanged }: TitlePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null | undefined>(undefined);

  const unlockedCount = titles.options.filter((option) => option.unlocked).length;
  // Obtenus d'abord, dans l'ordre du catalogue ; puis ceux qui restent à gagner.
  const ordered = [...titles.options.filter((option) => option.unlocked), ...titles.options.filter((option) => !option.unlocked)];

  function commit(next: string | null) {
    if (next === titles.equipped) return;
    playButtonClick();
    setError(null);
    setPendingId(next);
    startTransition(async () => {
      const result = await equipTitle(next);
      setPendingId(undefined);
      if (!result.ok) {
        setError(result.error ?? "Titre refusé.");
        return;
      }
      notifyProgressionChanged();
      onChanged();
      onClose();
    });
  }

  return (
    <section className={styles.picker} aria-label="Choix du titre">
      <header className={styles.head}>
        <button type="button" className={styles.back} onClick={onClose}>
          <span aria-hidden>←</span> Retour
        </button>
        <div className={styles.headText}>
          <h2 className={styles.title}>Ton titre</h2>
          <p className={styles.subtitle}>
            Il s&apos;affiche sous ton nom. Aucun ne s&apos;achète : chacun se gagne par un exploit. {unlockedCount} / {titles.options.length} obtenus.
          </p>
        </div>
      </header>

      {!titles.available && <p className={styles.notice}>Les titres arrivent bientôt : ton choix ne peut pas encore être enregistré.</p>}
      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.list} role="radiogroup" aria-label="Titres">
        <li>
          <button
            type="button"
            role="radio"
            aria-checked={titles.equipped === null}
            className={styles.option}
            data-active={titles.equipped === null ? "true" : undefined}
            onClick={() => commit(null)}
            disabled={isPending || !titles.available}
          >
            <span className={styles.optionName}>Aucun titre</span>
            <span className={styles.optionHint}>Seul ton nom s&apos;affiche.</span>
            {titles.equipped === null && <span className={styles.badge}>Porté</span>}
          </button>
        </li>
        {ordered.map((option) => {
          const active = option.id === titles.equipped;
          return (
            <li key={option.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={!option.unlocked}
                className={styles.option}
                data-active={active ? "true" : undefined}
                data-locked={option.unlocked ? undefined : "true"}
                onClick={() => option.unlocked && commit(option.id)}
                disabled={isPending || !titles.available || !option.unlocked}
                title={option.unlocked ? undefined : option.condition}
              >
                <span className={styles.optionName}>
                  {!option.unlocked && (
                    <svg className={styles.lock} viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
                      <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth={1.8} />
                      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth={1.8} />
                    </svg>
                  )}
                  {option.name}
                </span>
                <span className={styles.optionHint}>{option.unlocked ? "Obtenu" : option.condition}</span>
                {active && <span className={styles.badge}>Porté</span>}
                {pendingId === option.id && <span className={styles.badge}>…</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
