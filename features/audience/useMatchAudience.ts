"use client";

import { useEffect, useState } from "react";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { useStockTicker } from "@/features/audience/useStockTicker";
import type { MatchAudienceVerdict } from "@/features/audience/verdict";

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie. */
const RETRY_DELAYS_MS = [600, 2000, 4500];
/** Attente avant que le compteur ne se mette à défiler. */
const START_MS = 700;

/**
 * LE PUBLIC d'une partie terminée : le compteur de spectateurs à afficher
 * (`shown`, qui DÉFILE cran après cran vers la nouvelle audience, avec sa
 * tendance) et le relevé serveur (`summary` : avant, après, prime).
 *
 * Il part de là où le compteur EN PARTIE s'était arrêté (`avant +
 * liveDelta`) : d'un écran à l'autre, il ne revient jamais en arrière pour
 * rien. Partie locale (`matchId` absent) : l'audience ne bouge pas, le
 * compteur montre simplement celle du joueur.
 *
 * Partagé par le volet du public de la victoire (`MatchAudienceTicker`) et
 * l'écran de défaite (`DefeatScreen`).
 */
export function useMatchAudience({
  matchId,
  preview,
  verdict,
}: {
  matchId?: string;
  preview?: MatchAudienceSummary;
  verdict?: MatchAudienceVerdict;
}): { shown: number | null; trend: "up" | "down" | null; summary: MatchAudienceSummary | null } {
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
  return { shown, trend: trend ?? null, summary };
}
