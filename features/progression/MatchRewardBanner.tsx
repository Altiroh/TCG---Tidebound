"use client";

import { useEffect, useState } from "react";
import { fetchMatchReward, type MatchRewardSummary } from "@/features/progression/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/progression/MatchRewardBanner.module.css";

interface MatchRewardBannerProps {
  matchId: string;
}

/** Nouvelles tentatives de lecture : en PvP, l'adversaire peut voir la fin de partie avant que l'octroi soit écrit. */
const RETRY_DELAYS_MS = [0, 1500, 4000];

/**
 * Annonce la récompense d'une partie serveur terminée (PvP ou bot).
 *
 * Purement en LECTURE : l'octroi a déjà eu lieu côté serveur, au moment où
 * le coup final a été enregistré (`features/matches/matchStore.ts`). Le
 * navigateur ne déclare ni l'issue, ni le gain.
 *
 * Posé dans la fiche de l'écran de fin, sous le cadre. Reste muet s'il n'y a rien
 * à annoncer plutôt que d'afficher une erreur — une récompense absente n'est
 * pas un échec du point de vue du joueur.
 */
export function MatchRewardBanner({ matchId }: MatchRewardBannerProps) {
  const [reward, setReward] = useState<MatchRewardSummary | null>(null);

  useEffect(() => {
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
            .catch((error) => console.error("[MatchRewardBanner] Lecture impossible :", error));
        }, delay)
      );
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [matchId]);

  if (!reward) return null;

  const leveledUp = reward.levelAfter > reward.levelBefore;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.gainXp}>
        +{reward.xp}
        <span className={styles.unit}>XP</span>
      </span>

      {reward.tides > 0 && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.gainTides}>
            +{reward.tides}
            <span className={styles.unit}>Tides</span>
          </span>
        </>
      )}

      {leveledUp && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.levelUp}>Niveau {reward.levelAfter}</span>
          {/* Le palier ne se crédite plus tout seul : il attend au profil. */}
          <span className={styles.note}>🎁 Récompense à réclamer au profil</span>
        </>
      )}

      {reward.firstWinOfDay && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.note}>Première victoire du jour</span>
        </>
      )}
    </div>
  );
}
