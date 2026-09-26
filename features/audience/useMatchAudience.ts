"use client";

import { useEffect, useState } from "react";
import { fetchMatchAudience, fetchMyAudience, type MatchAudienceSummary } from "@/features/audience/actions";
import { useStockTicker } from "@/features/audience/useStockTicker";
import type { MatchAudienceVerdict } from "@/features/audience/verdict";

/** Relectures : le jugement serveur s'écrit juste après l'octroi de la partie — relues serrées d'abord. */
const RETRY_DELAYS_MS = [300, 900, 1700, 3000, 5000];
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
  const start = summary && liveEnd !== null ? tickerStart(summary.before, liveEnd, summary.after) : null;
  const { shown, trend } = useStockTicker(summary ? (settled ? summary.after : start) : current);
  return { shown, trend: trend ?? null, summary };
}

/**
 * D'OÙ PART le compteur de fin. Là où le direct s'était arrêté, tant que ça
 * va dans le sens du VRAI changement ; sinon, de l'audience d'avant la partie.
 *
 * Le direct (moments × 5 spectateurs, sans poids d'adversaire) et le verdict
 * du serveur (rapprochement doux, pondéré par l'adversaire) ne comptent pas
 * pareil : le direct pouvait monter à 1 160 quand la partie ne rapportait
 * que 1 068 → 1 087. Repartir de 1 160 faisait BAISSER le compteur après une
 * victoire (retour du 26/09/2026). Désormais une partie qui fait gagner des
 * spectateurs s'affiche toujours en hausse, une partie qui en fait perdre en
 * baisse, et le compteur ne repart jamais dans l'autre sens.
 */
function tickerStart(before: number, liveEnd: number, after: number): number {
  if (after >= before) return liveEnd <= after ? liveEnd : before;
  return liveEnd >= after ? liveEnd : before;
}
