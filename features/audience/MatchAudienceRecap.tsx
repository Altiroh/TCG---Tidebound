"use client";

import { useEffect, useState } from "react";
import { audienceMood } from "@/game/audience";
import { fetchMatchAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { AudienceTip } from "@/features/audience/AudienceTip";
import { RollingNumber } from "@/features/audience/RollingNumber";
import styles from "@/features/audience/MatchAudienceRecap.module.css";

/** Le jugement du public sur la partie, tel que l'écran de fin l'a calculé. */
export interface MatchAudienceVerdict {
  spectacle: number;
  highlights: string[];
}

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie. */
const RETRY_DELAYS_MS = [600, 2000, 4500];

/**
 * « Le public » en fin de partie : la note de spectacle, l'humeur de la
 * salle, les deux temps forts qu'elle retient, puis — une fois la partie
 * jugée côté serveur — le gain (ou la perte) de spectateurs, chiffres qui
 * roulent de l'ancienne audience à la nouvelle.
 *
 * Partie locale (`matchId` absent) : le verdict s'affiche, l'audience ne
 * bouge pas — seules les parties sur le serveur comptent.
 */
export function MatchAudienceRecap({
  verdict,
  matchId,
  preview,
}: {
  verdict: MatchAudienceVerdict;
  matchId?: string;
  preview?: MatchAudienceSummary;
}) {
  const [summary, setSummary] = useState<MatchAudienceSummary | null>(preview ?? null);
  const [shown, setShown] = useState<number | null>(preview ? preview.before : null);

  useEffect(() => {
    if (!matchId || preview) return;
    let cancelled = false;
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

  // Le compteur part de l'ancienne audience, puis roule jusqu'à la nouvelle.
  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => setShown(summary.after), 700);
    return () => clearTimeout(timer);
  }, [summary]);

  const spectacle = Math.round(verdict.spectacle);
  const level = spectacle >= 70 ? "hot" : spectacle >= 45 ? "warm" : spectacle >= 25 ? "calm" : "cold";
  const delta = summary ? summary.after - summary.before : null;

  return (
    <section className={styles.recap} data-level={level} data-audience-recap="" aria-label={`Le public — spectacle ${spectacle} sur 100`}>
      <div className={styles.gauge} style={{ ["--spectacle" as string]: `${spectacle}` }}>
        <span className={styles.gaugeValue}>{spectacle}</span>
        <span className={styles.gaugeUnit}>/ 100</span>
      </div>
      <div className={styles.text}>
        <AudienceTip mood={audienceMood(spectacle)} placement="below">
          <h3 className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
              <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth={1.8} />
            </svg>
            Le public
          </h3>
        </AudienceTip>
        <p className={styles.mood}>{audienceMood(spectacle)}.</p>
        {verdict.highlights.length > 0 && (
          <ul className={styles.highlights}>
            {verdict.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        )}
      </div>
      <div className={styles.count}>
        {summary && shown !== null ? (
          <>
            <RollingNumber value={shown} className={styles.countValue} />
            <span className={styles.countLabel}>spectateurs</span>
            {delta !== null && delta !== 0 && (
              <span className={styles.delta} data-sign={delta > 0 ? "up" : "down"}>
                {delta > 0 ? "▲ +" : "▼ "}
                {delta.toLocaleString("fr-FR")}
              </span>
            )}
          </>
        ) : (
          <span className={styles.countNote}>{matchId || preview ? "Le public délibère…" : "Partie locale : l'audience ne bouge pas."}</span>
        )}
      </div>
    </section>
  );
}
