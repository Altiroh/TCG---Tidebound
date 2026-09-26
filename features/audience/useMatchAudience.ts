"use client";

import { useEffect, useState } from "react";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { useStockTicker } from "@/features/audience/useStockTicker";

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie — relues serrées d'abord. */
const RETRY_DELAYS_MS = [300, 900, 1700, 3000, 5000];

/**
 * LE PUBLIC d'une partie terminée : le compteur de spectateurs à afficher
 * (`shown`, avec sa tendance) et le relevé serveur (`summary` : avant,
 * après, prime).
 *
 * Il affiche la nouvelle audience telle que le serveur l'a écrite — celle
 * que le compteur EN PARTIE annonçait déjà (`projectedAudience`, même
 * formule, même poids d'adversaire) : d'un écran à l'autre, le chiffre ne
 * bouge plus. Partie locale (`matchId` absent) : l'audience ne bouge pas,
 * le compteur montre simplement celle du joueur.
 *
 * Partagé par le volet du public de la victoire (`MatchAudienceTicker`) et
 * l'écran de défaite (`DefeatScreen`).
 */
export function useMatchAudience({
  matchId,
  preview,
}: {
  matchId?: string;
  preview?: MatchAudienceSummary;
}): { shown: number | null; trend: "up" | "down" | null; summary: MatchAudienceSummary | null } {
  const [summary, setSummary] = useState<MatchAudienceSummary | null>(preview ?? null);
  const [current, setCurrent] = useState<number | null>(null);

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

  const { shown, trend } = useStockTicker(summary ? summary.after : current);
  return { shown, trend: trend ?? null, summary };
}

