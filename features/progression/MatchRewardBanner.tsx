"use client";

import { useEffect } from "react";
import type { MatchRewardSummary } from "@/features/progression/actions";
import { useMatchReward } from "@/features/progression/useMatchReward";
import { playLevelUp } from "@/lib/sound";
import styles from "@/features/progression/MatchRewardBanner.module.css";

interface MatchRewardBannerProps {
  matchId?: string;
  /** Gain FABRIQUÉ (labo `/game/fin-preview`) : aucune lecture serveur. */
  preview?: MatchRewardSummary;
}

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
export function MatchRewardBanner({ matchId, preview }: MatchRewardBannerProps) {
  const reward = useMatchReward(matchId, preview);
  const leveledUp = reward ? reward.levelAfter > reward.levelBefore : false;

  // Le bandeau n'a pas d'entrée chorégraphiée : la montée de niveau sonne dès
  // qu'elle s'affiche. Il ne vit que dans le repli sans joueur de
  // `MatchEndScreen`, jamais à côté de `MatchResultScreen` qui a son propre son.
  useEffect(() => {
    if (leveledUp) playLevelUp();
  }, [leveledUp]);

  if (!reward) return null;

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
