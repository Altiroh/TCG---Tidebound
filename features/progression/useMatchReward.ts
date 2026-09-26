"use client";

import { useEffect, useState } from "react";
import { fetchMatchReward, type MatchRewardSummary } from "@/features/progression/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";

/** Nouvelles tentatives de lecture : en PvP, l'adversaire peut voir la fin de partie avant que l'octroi soit écrit. */
const RETRY_DELAYS_MS = [0, 1500, 4000];

/**
 * Le GAIN d'une partie serveur terminée (XP, Tides, niveau), relu jusqu'à ce
 * que l'octroi soit écrit. Partagé par le bandeau de la victoire
 * (`MatchRewardBanner`) et l'écran de défaite (`DefeatScreen`).
 *
 * Purement en LECTURE : l'octroi a déjà eu lieu côté serveur. `null` tant
 * qu'il n'y a rien à annoncer — une récompense absente n'est pas un échec.
 */
export function useMatchReward(matchId?: string, preview?: MatchRewardSummary): MatchRewardSummary | null {
  const [reward, setReward] = useState<MatchRewardSummary | null>(preview ?? null);

  useEffect(() => {
    if (!matchId || preview) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    RETRY_DELAYS_MS.forEach((delay) => {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          fetchMatchReward(matchId)
            .then((found) => {
              if (!cancelled && found) {
                setReward(found);
                cancelled = true;
                // L'octroi est écrit : le bandeau du haut doit relire son
                // solde, son niveau ET ses quêtes à réclamer. C'est ce qui
                // déclenche l'alerte « quête terminée » — sans ça, le joueur
                // ne l'apprendrait qu'en ouvrant le tiroir de lui-même.
                notifyProgressionChanged();
              }
            })
            .catch((error) => console.error("[useMatchReward] Lecture impossible :", error));
        }, delay)
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [matchId, preview]);

  return reward;
}
