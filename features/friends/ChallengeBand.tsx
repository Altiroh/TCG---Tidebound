"use client";

import styles from "@/features/friends/ChallengeBand.module.css";

export interface ChallengeBandProps {
  /** Qui lance le défi. */
  fromName: string;
  /** Réponse en cours : les deux boutons attendent. */
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * LA BANDE DE DÉFI (27/10/2026) : un ami propose un combat. Une bande noire
 * traverse l'écran à mi-hauteur — qui défie, « Accepter », « Refuser ». Elle
 * ne se ferme pas d'un toucher à côté : c'est une question, elle attend sa
 * réponse (l'invitation expire d'elle-même au bout de 10 minutes).
 *
 * Purement visuelle : `ChallengeAlert` la pose et répond au serveur ; le lab
 * (`/game/amis-preview`) la montre sans compte.
 */
export function ChallengeBand({ fromName, busy = false, error = null, onAccept, onDecline }: ChallengeBandProps) {
  return (
    <div className={styles.veil} role="presentation">
      <section className={styles.band} role="alertdialog" aria-modal aria-labelledby="defi-titre" aria-describedby="defi-texte" data-variant="defi">
        <span className={styles.crest} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 4l9 9M4 4v3.5M4 4h3.5M20 4l-9 9M20 4v3.5M20 4h-3.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
            <path d="M8.5 15.5 5 19M15.5 15.5 19 19M7 13.5l3.5 3.5M17 13.5 13.5 17" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </span>
        <div className={styles.text}>
          <p className={styles.eyebrow}>Combat amical</p>
          <h2 id="defi-titre" className={styles.title}>
            <strong>{fromName}</strong> te lance un défi
          </h2>
          <p id="defi-texte" className={styles.caption}>
            Accepte, et vous vous retrouvez tous les deux au salon.
          </p>
          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.accept} onClick={onAccept} disabled={busy} autoFocus>
            Accepter
          </button>
          <button type="button" className={styles.decline} onClick={onDecline} disabled={busy}>
            Refuser
          </button>
        </div>
      </section>
    </div>
  );
}

/** Le même bandeau, pour une NOUVELLE qu'on lit et qu'on ferme (défi refusé). */
export function NoticeBand({ title, caption, actionLabel, onAction }: { title: string; caption?: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className={styles.veil} role="presentation">
      <section className={styles.band} role="alertdialog" aria-modal aria-label={title} data-variant="defi">
        <div className={styles.text}>
          <h2 className={styles.title}>{title}</h2>
          {caption && <p className={styles.caption}>{caption}</p>}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.accept} onClick={onAction} autoFocus>
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
