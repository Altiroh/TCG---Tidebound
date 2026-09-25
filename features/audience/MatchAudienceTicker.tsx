"use client";

import { useEffect, useState } from "react";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { RollingNumber } from "@/features/audience/RollingNumber";
import styles from "@/features/audience/MatchAudienceTicker.module.css";

/** Le jugement du public sur la partie, tel que l'écran de fin l'a calculé. */
export interface MatchAudienceVerdict {
  spectacle: number;
  highlights: string[];
}

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie. */
const RETRY_DELAYS_MS = [600, 2000, 4500];
/** Attente avant que le compteur ne se mette à rouler. */
const START_MS = 700;
/** Durée du défilement, en crans successifs comme un cours de bourse. */
const TICK_MS = 140;
const TICKS = 14;
/** Le temps de lire la nouvelle valeur en couleur, avant le retour au blanc. */
const SETTLE_MS = 1400;

/**
 * Le compteur de spectateurs de l'écran de fin, en haut à gauche : un œil et
 * un nombre, rien d'autre. Une fois la partie jugée côté serveur, il DÉFILE
 * de l'ancienne audience à la nouvelle, cran après cran comme un cours de
 * bourse : vert quand il monte, rouge quand il baisse, puis il revient au blanc.
 *
 * Partie locale (`matchId` absent) : l'audience ne bouge pas, le compteur
 * montre simplement celle du joueur.
 */
export function MatchAudienceTicker({ matchId, preview }: { matchId?: string; preview?: MatchAudienceSummary }) {
  const [summary, setSummary] = useState<MatchAudienceSummary | null>(preview ?? null);
  const [shown, setShown] = useState<number | null>(preview ? preview.before : null);
  const [trend, setTrend] = useState<"up" | "down" | null>(null);

  // Partie jugée : relue quelques fois, le temps que le serveur l'écrive.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    if (!matchId) {
      fetchMyAudience()
        .then((audience) => !cancelled && setShown(audience))
        .catch(() => undefined);
      return () => {
        cancelled = true;
      };
    }
    const timers = RETRY_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        if (cancelled) return;
        fetchMatchAudience(matchId)
          .then((found) => {
            if (cancelled || !found) return;
            cancelled = true;
            setSummary(found);
            setShown(found.before);
          })
          .catch(() => undefined);
      }, delay)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [matchId, preview]);

  // Le défilement : de l'ancienne valeur à la nouvelle, en crans réguliers.
  useEffect(() => {
    if (!summary || summary.after === summary.before) return;
    const { before, after } = summary;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setTrend(after > before ? "up" : "down"), START_MS));
    for (let tick = 1; tick <= TICKS; tick += 1) {
      // Rapide au départ, qui ralentit à l'approche de la valeur finale.
      const progress = 1 - (1 - tick / TICKS) ** 2;
      timers.push(setTimeout(() => setShown(Math.round(before + (after - before) * progress)), START_MS + tick * TICK_MS));
    }
    timers.push(setTimeout(() => setTrend(null), START_MS + TICKS * TICK_MS + SETTLE_MS));
    return () => timers.forEach(clearTimeout);
  }, [summary]);

  if (shown === null) return null;
  return (
    <div className={styles.ticker} data-trend={trend ?? undefined} data-audience-ticker="" aria-label={`${shown} spectateurs`}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.8} />
      </svg>
      <RollingNumber value={shown} className={styles.value} />
    </div>
  );
}
