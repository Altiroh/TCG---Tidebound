"use client";

import { useEffect, useState } from "react";
import { audienceMood } from "@/game/audience";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { RollingNumber } from "@/features/audience/RollingNumber";
import { useStockTicker } from "@/features/audience/useStockTicker";
import { weightiestSignals, type MatchAudienceVerdict } from "@/features/audience/verdict";
import styles from "@/features/audience/MatchAudienceTicker.module.css";

export type { MatchAudienceVerdict } from "@/features/audience/verdict";

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie. */
const RETRY_DELAYS_MS = [600, 2000, 4500];
/** Attente avant que le compteur ne se mette à défiler. */
const START_MS = 700;

/**
 * Le public de l'écran de fin, en haut à gauche : le compteur de
 * spectateurs, et dessous le VERDICT — l'humeur de la salle, ses temps
 * forts, ce qui a pesé en plus et en moins.
 *
 * Une fois la partie jugée côté serveur, le compteur DÉFILE vers la nouvelle
 * audience, cran après cran comme un cours de bourse : vert quand il monte,
 * rouge quand il baisse, puis il revient au blanc. Il part de là où le
 * compteur EN PARTIE s'était arrêté (`avant + liveDelta`) : d'un écran à
 * l'autre, il ne revient jamais en arrière pour rien.
 *
 * Partie locale (`matchId` absent) : l'audience ne bouge pas, le compteur
 * montre simplement celle du joueur ; le verdict, lui, se lit quand même.
 */
export function MatchAudienceTicker({ matchId, preview, verdict }: { matchId?: string; preview?: MatchAudienceSummary; verdict?: MatchAudienceVerdict }) {
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

  // Là où le direct s'était arrêté d'abord, puis la nouvelle audience : le compteur défile de l'un à l'autre.
  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => setSettled(true), START_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  const liveEnd = summary ? Math.max(0, summary.before + (verdict?.liveDelta ?? 0)) : null;
  const { shown, trend } = useStockTicker(summary ? (settled ? summary.after : liveEnd) : current);

  if (shown === null && !verdict) return null;
  const weighed = verdict ? weightiestSignals(verdict.signals) : [];
  return (
    <div className={styles.audience} data-audience-ticker="">
      {shown !== null && (
        <div className={styles.ticker} data-trend={trend ?? undefined} aria-label={`${shown} spectateurs`}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.8} />
          </svg>
          <RollingNumber value={shown} className={styles.value} />
        </div>
      )}
      {verdict && (
        <section className={styles.verdict} aria-label="Le verdict du public">
          <p className={styles.mood}>
            {audienceMood(verdict.spectacle)}
            <span className={styles.score}>Spectacle {verdict.spectacle}</span>
          </p>
          {/* La prime du public, une fois la partie jugée : ce que la salle a payé. */}
          {summary?.prize && (
            <p className={styles.prize}>
              Prime du public
              <span>
                +{summary.prize.xp} XP{summary.prize.tides > 0 && ` · +${summary.prize.tides} Tide${summary.prize.tides > 1 ? "s" : ""}`}
              </span>
            </p>
          )}
          {/* Ce qui a pesé, chiffré ; les temps forts y ressortent. Sans signal chiffré, les temps forts seuls. */}
          {weighed.length > 0 ? (
            <ul className={styles.signals}>
              {weighed.map((signal) => (
                <li key={signal.id} data-sign={signal.weight > 0 ? "up" : "down"} data-highlight={verdict.highlights.includes(signal.label) || undefined}>
                  <span className={styles.weight}>{signal.weight > 0 ? `+${signal.weight}` : `−${Math.abs(signal.weight)}`}</span>
                  {signal.label}
                </li>
              ))}
            </ul>
          ) : (
            verdict.highlights.length > 0 && (
              <ul className={styles.highlights}>
                {verdict.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )
          )}
        </section>
      )}
    </div>
  );
}
