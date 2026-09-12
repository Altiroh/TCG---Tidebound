"use client";

import { useEffect, useRef, useState } from "react";
import { recordBotMatchResult, type RecordBotMatchResult } from "@/features/progression/botMatchActions";
import type { MatchOutcome } from "@/game/progression";
import styles from "@/features/progression/MatchRewardBanner.module.css";

interface BotMatchRewardBannerProps {
  outcome: MatchOutcome;
}

/**
 * Enregistre la partie contre bot qui vient de se terminer, puis annonce le
 * gain. Monté par `MatchBoard` uniquement quand la partie est finie ET que
 * l'adversaire était un bot — jamais en hot-seat à deux joueurs humains.
 *
 * Posé en `fixed` par-dessus l'écran de victoire : aucun impact sur sa mise
 * en page. Reste muet quand il n'y a rien à annoncer (joueur non connecté,
 * dérogation désactivée, plafond atteint) plutôt que d'afficher une erreur —
 * une récompense absente n'est pas un échec du point de vue du joueur.
 */
export function BotMatchRewardBanner({ outcome }: BotMatchRewardBannerProps) {
  const [result, setResult] = useState<RecordBotMatchResult | null>(null);
  // L'enregistrement ne doit partir qu'UNE fois, même si React remonte le
  // composant (Strict Mode en développement le fait systématiquement).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    let cancelled = false;
    recordBotMatchResult({ outcome })
      .then((response) => {
        if (!cancelled) setResult(response);
      })
      .catch((error) => console.error("[BotMatchRewardBanner] Enregistrement impossible :", error));

    return () => {
      cancelled = true;
    };
  }, [outcome]);

  if (!result?.ok || !result.reward) {
    // Seul cas qui vaut une mention : le plafond quotidien, sinon le joueur
    // croirait à un bug en ne voyant plus rien après quelques parties.
    if (result?.reason === "daily-cap") {
      return (
        <div className={styles.banner}>
          <span className={styles.note}>Plafond quotidien de parties contre bot atteint — aucune récompense.</span>
        </div>
      );
    }
    return null;
  }

  const { reward } = result;
  const leveledUp = reward.levelAfter > reward.levelBefore;
  const boosters = reward.boosterIds.length;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.gainXp}>
        +{reward.xp}
        <span className={styles.unit}>XP</span>
      </span>

      {reward.totalTides > 0 && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.gainTides}>
            +{reward.totalTides}
            <span className={styles.unit}>Tides</span>
          </span>
        </>
      )}

      {leveledUp && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.levelUp}>Niveau {reward.levelAfter}</span>
        </>
      )}

      {boosters > 0 && (
        <>
          <span className={styles.rule} aria-hidden />
          <span className={styles.gainTides}>
            {boosters} booster{boosters > 1 ? "s" : ""} de palier
          </span>
        </>
      )}
    </div>
  );
}
