"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { LOGIN_CYCLE_LENGTH, LOGIN_STREAK_MILESTONE, loginRewardLabel } from "@/game/progression";
import { claimDailyLogin, fetchDailyLogin } from "@/features/progression/profileActions";
import type { LoginRewardView } from "@/features/progression/loginService";
import { loginGainsText } from "@/features/progression/dailyLogin";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { RewardIcon } from "@/features/progression/RewardIcon";
import styles from "@/features/progression/DailyStreakPopup.module.css";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";

interface DailyStreakPopupProps {
  onClose: () => void;
  /** Laboratoire (`/game/profil-preview?serie=1`) : l'escale fournie, sans lecture serveur. */
  initialLogin?: LoginRewardView;
}

/**
 * POPUP DE SÉRIE — la première venue de la journée.
 *
 * Monté par le bandeau (`HeaderPlayer`) quand l'escale du jour n'est pas
 * encore réclamée : le joueur est félicité pour sa série et réclame son
 * escale sans avoir à passer par le profil. Le fermer ne perd rien —
 * l'escale reste réclamable au profil jusqu'à minuit (UTC).
 *
 * La série affichée est celle qu'il ATTEINT en réclamant : +1 s'il était
 * là hier, sinon 1 — c'est ce que la base comptera (`claim_login_reward`).
 */
export function DailyStreakPopup({ onClose, initialLogin }: DailyStreakPopupProps) {
  const [login, setLogin] = useState<LoginRewardView | null>(initialLogin ?? null);
  const [gains, setGains] = useState<string | null>(null);
  const [claimedStreak, setClaimedStreak] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (initialLogin) return;
    let alive = true;
    fetchDailyLogin()
      .then((view) => {
        if (!alive) return;
        // Rien à fêter (déjà réclamée depuis un autre onglet, déconnecté) : on s'efface.
        if (!view || !view.claimable) onClose();
        else setLogin(view);
      })
      .catch(() => alive && onClose());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule lecture à l'ouverture.
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted || !login) return null;

  const streak = claimedStreak ?? login.streak + 1;
  const untilBonus = LOGIN_STREAK_MILESTONE - (streak % LOGIN_STREAK_MILESTONE);
  const bonusToday = streak % LOGIN_STREAK_MILESTONE === 0;
  const items = login.cycle[login.step - 1] ?? login.items;

  function claim() {
    if (pending || gains !== null) return;
    playButtonClick();
    setError(null);
    startTransition(async () => {
      const result = await claimDailyLogin();
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        return;
      }
      playRewardClaimed();
      setGains(loginGainsText(result) || "Escale franchie.");
      if (result.streak) setClaimedStreak(result.streak);
      notifyProgressionChanged();
    });
  }

  return createPortal(
    <div className={styles.scene} role="dialog" aria-modal aria-labelledby="daily-streak-title">
      <button type="button" className={styles.backdrop} aria-label="Fermer" onClick={onClose} />
      <div className={styles.card}>
        <button type="button" className={styles.close} aria-label="Fermer" onClick={onClose}>
          ×
        </button>

        <div className={styles.flame} aria-hidden>
          <span className={styles.flameGlow} />
          {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
          <img src="/assets/profile/icon-streak.webp" alt="" draggable={false} />
          <span className={styles.flameCount}>{streak}</span>
        </div>

        <h2 id="daily-streak-title" className={styles.title}>
          {streak > 1 ? `${streak} jours d'affilée !` : "Bon retour à bord !"}
        </h2>
        <p className={styles.lead}>
          {streak > 1
            ? "Tu tiens le cap : chaque jour de retour prolonge ta série."
            : "Ta série commence aujourd'hui. Reviens demain pour la prolonger."}
        </p>

        {/* Les jours de la série, par tranches de sept : la semaine en cours s'allume. */}
        <ol className={styles.days} aria-label={`Série : ${streak} jour${streak > 1 ? "s" : ""}`}>
          {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => {
            const dayInWeek = ((streak - 1) % LOGIN_CYCLE_LENGTH) + 1;
            const state = index + 1 < dayInWeek ? "done" : index + 1 === dayInWeek ? "today" : "next";
            return <li key={index} className={styles.day} data-state={state} />;
          })}
        </ol>

        <p className={styles.bonus}>
          {bonusToday
            ? `${LOGIN_STREAK_MILESTONE} jours sans en manquer un : une carte Abyssale t'attend !`
            : `Encore ${untilBonus} jour${untilBonus > 1 ? "s" : ""} d'affilée pour gagner une carte Abyssale.`}
        </p>

        <div className={styles.reward}>
          <span className={styles.rewardCaption}>Escale {login.step} du jour</span>
          <span className={styles.rewardItems}>
            {items.map((item, index) => (
              <span key={index} className={styles.rewardItem}>
                <RewardIcon item={item} size={52} />
                <span>{loginRewardLabel(item)}</span>
              </span>
            ))}
          </span>
        </div>

        {gains !== null ? (
          <>
            <p className={styles.gains}>{gains}</p>
            <button type="button" className={styles.primary} onClick={onClose}>
              Continuer
            </button>
          </>
        ) : (
          <button type="button" className={styles.primary} onClick={claim} disabled={pending}>
            {pending ? "…" : "Réclamer l'escale"}
          </button>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>,
    document.body
  );
}
