"use client";

import { useEffect, useState } from "react";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { RollingNumber } from "@/features/audience/RollingNumber";
import { useStockTicker } from "@/features/audience/useStockTicker";
import styles from "@/features/audience/MatchAudienceTicker.module.css";

/** Le jugement du public sur la partie, tel que l'écran de fin l'a calculé. */
export interface MatchAudienceVerdict {
  spectacle: number;
  highlights: string[];
}

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie. */
const RETRY_DELAYS_MS = [600, 2000, 4500];
/** Attente avant que le compteur ne se mette à défiler. */
const START_MS = 700;

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
  const [current, setCurrent] = useState<number | null>(null);
  const [settled, setSettled] = useState(false);

  // Partie jugée : relue quelques fois, le temps que le serveur l'écrive.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    if (!matchId) {
      fetchMyAudience()
        .then((audience) => !cancelled && setCurrent(audience))
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
          })
          .catch(() => undefined);
      }, delay)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [matchId, preview]);

  // L'ancienne audience d'abord, puis la nouvelle : le compteur défile de l'une à l'autre.
  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => setSettled(true), START_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  const { shown, trend } = useStockTicker(summary ? (settled ? summary.after : summary.before) : current);

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
