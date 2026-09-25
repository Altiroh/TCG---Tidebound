"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "@/features/match/ChoiceBanner.module.css";

/** Délai maximal d'une décision posée sur la table (décision du 25/09/2026). */
export const CHOICE_TIMEOUT_MS = 60_000;

export interface ChoiceBannerAction {
  label: string;
  onClick: () => void;
  /** Action principale : le bouton bleu lumineux. */
  primary?: boolean;
  disabled?: boolean;
}

/**
 * Bandeau de DÉCISION posé en haut de la table — le même endroit que la
 * désignation d'une cible de réaction. La question se règle SUR le
 * plateau (glisser une carte, toucher une unité), jamais dans une fenêtre
 * qui cache les cartes : le bandeau dit quoi faire, combien il en reste,
 * et combien de temps.
 *
 * Minuteur d'une minute au plus : à l'échéance, `onExpire` tranche (effet
 * non appliqué, ou choix au hasard quand le texte l'impose). Il repart à
 * zéro à chaque nouvelle question (`choiceKey`).
 */
export function ChoiceBanner({
  choiceKey,
  source,
  title,
  detail,
  actions = [],
  onExpire,
  timeoutMs = CHOICE_TIMEOUT_MS,
}: {
  choiceKey: string;
  /** La carte d'où vient la question, si elle en a une. */
  source?: string | null;
  title: ReactNode;
  detail?: ReactNode;
  actions?: ChoiceBannerAction[];
  onExpire: () => void;
  timeoutMs?: number;
}) {
  const [left, setLeft] = useState(timeoutMs);
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    const startedAt = Date.now();
    setLeft(timeoutMs);
    let done = false;
    const timer = setInterval(() => {
      const remaining = Math.max(0, timeoutMs - (Date.now() - startedAt));
      setLeft(remaining);
      if (remaining === 0 && !done) {
        done = true;
        clearInterval(timer);
        expire.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [choiceKey, timeoutMs]);

  const seconds = Math.ceil(left / 1000);
  const ratio = left / timeoutMs;

  return (
    <div className={styles.banner} role="status" aria-live="polite" data-urgent={seconds <= 10 || undefined}>
      <span className={styles.timer} style={{ ["--ratio" as string]: `${ratio}` }} aria-label={`${seconds} secondes restantes`}>
        {seconds}
      </span>
      <span className={styles.text}>
        {source && <span className={styles.source}>{source}</span>}
        <span className={styles.title}>{title}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      {actions.length > 0 && (
        <span className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? styles.primary : styles.secondary}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
