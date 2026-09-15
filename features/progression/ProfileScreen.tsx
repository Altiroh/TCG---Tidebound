"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LOGIN_CYCLE_LENGTH, loginStepLabel, MAX_REWARDED_LEVEL } from "@/game/progression";
import { claimDailyLogin, type ProfileSummary } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/Profile.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileScreenProps {
  profile: ProfileSummary;
}

/**
 * Profil joueur — tout ce que la spec demande d'y voir (Notion
 * « Progression joueur » §12) : niveau, jauge d'XP, XP restante avant le
 * prochain niveau, récompense de ce prochain niveau, aperçu des prochains
 * gros paliers, historique des paliers déjà récupérés, accès aux quêtes,
 * récompenses de connexion, exploits.
 *
 * Direction assumée : une ROUTE MARITIME. Les paliers sont des escales, le
 * cycle de connexion en est une autre, et rien n'est présenté comme un
 * couloir de battle pass à dérouler.
 */
export function ProfileScreen({ profile }: ProfileScreenProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function claimLogin() {
    playButtonClick();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await claimDailyLogin();
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        return;
      }
      const gains = [result.tides ? `+${result.tides} Tides` : "", result.xp ? `+${result.xp} XP` : "", result.boosterId ? "1 booster" : ""]
        .filter(Boolean)
        .join(" · ");
      setMessage(gains ? `Escale franchie — ${gains}.` : "Escale franchie.");
      notifyProgressionChanged();
      router.refresh();
    });
  }

  if (!profile.isSignedIn) {
    return (
      <GameScreen active={null} nav="minimal">
        <div className={game.content}>
          <div className={game.contentWide}>
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour suivre ta progression</p>
              <p className={game.muted}>Niveau, quêtes, exploits et récompenses de connexion vivent sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()}>
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </GameScreen>
    );
  }

  const { view } = profile;
  const unlockedAchievements = profile.achievements.filter((achievement) => achievement.unlocked).length;

  return (
    <GameScreen active={null} nav="minimal">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Carnet de bord</p>
              <h1 className={game.title}>{profile.displayName ?? "Marin"}</h1>
            </div>
            <Link href="/quetes" className={game.secondary} onClick={() => playButtonClick()}>
              Mes quêtes →
            </Link>
          </div>

          <div className={styles.layout}>
            {/* ── État du bord ──────────────────────────────────── */}
            <section className={`${game.panel} ${styles.block}`} aria-label="Niveau">
              <div className={styles.levelHead}>
                <span className={styles.levelNumber}>{view.level}</span>
                <span className={styles.levelCaption}>Niveau</span>
              </div>

              <div className={styles.xpBar} role="img" aria-label={`${view.xpIntoLevel} XP sur ${view.xpForNextLevel}`}>
                <span className={styles.xpFill} style={{ width: `${view.ratio * 100}%` }} />
              </div>
              <div className={styles.xpLine}>
                <span>
                  {view.xpIntoLevel} / {view.xpForNextLevel} XP
                </span>
                <span>
                  {profile.maxRewardedLevelReached
                    ? `Niveau ${MAX_REWARDED_LEVEL} atteint — dernier palier de cette version`
                    : `Encore ${view.xpToNextLevel} XP avant le niveau ${view.level + 1}`}
                </span>
              </div>

              {!profile.maxRewardedLevelReached && (
                <p className={game.muted}>
                  Prochain palier — <strong>{profile.nextLevelReward}</strong>
                </p>
              )}

              <div className={styles.stats}>
                <span className={styles.stat}>
                  <span className={styles.statValue}>{profile.balance}</span>
                  <span className={styles.statLabel}>Tides</span>
                </span>
                <span className={styles.stat}>
                  <span className={styles.statValue}>{profile.preconTokens}</span>
                  <span className={styles.statLabel}>Jetons de Préconstruit</span>
                </span>
                <span className={styles.stat}>
                  <span className={styles.statValue}>{profile.matchesPlayed}</span>
                  <span className={styles.statLabel}>Parties</span>
                </span>
                <span className={styles.stat}>
                  <span className={styles.statValue}>{unlockedAchievements}</span>
                  <span className={styles.statLabel}>Exploits</span>
                </span>
              </div>

              {profile.preconTokens > 0 && (
                <Link href="/decks" className={game.primary} onClick={() => playButtonClick()}>
                  Dépenser un Jeton →
                </Link>
              )}
            </section>

            {/* ── Connexions ────────────────────────────────────── */}
            <section className={`${game.panel} ${styles.block}`} aria-label="Récompenses de connexion">
              <h2 className={game.sectionTitle}>Escales de connexion</h2>
              <p className={game.muted}>
                Sept escales, une par jour de retour. Une absence ne te fait jamais repartir de zéro : tu reprends là où tu
                t&apos;étais arrêté.
              </p>

              <div className={styles.cycle}>
                {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => (
                  <span
                    key={step}
                    className={step === profile.login.step ? styles.escaleCurrent : step < profile.login.step ? styles.escalePassed : styles.escale}
                  >
                    <span className={styles.escaleIndex}>{step}</span>
                    {loginStepLabel(step)}
                  </span>
                ))}
              </div>

              <button type="button" className={game.primary} onClick={claimLogin} disabled={!profile.login.claimable || isPending}>
                {profile.login.claimable ? "Réclamer l'escale du jour" : "Escale déjà réclamée aujourd'hui"}
              </button>
              {message && <p className={game.muted}>{message}</p>}
              {error && <p className={game.error}>{error}</p>}
            </section>

            {/* ── La route : paliers ────────────────────────────── */}
            <section className={`${game.panel} ${styles.block}`} aria-label="Prochains paliers">
              <h2 className={game.sectionTitle}>Prochaines escales</h2>
              {profile.upcomingMilestones.length === 0 ? (
                <p className={game.muted}>Tu as atteint le dernier palier prévu dans cette version.</p>
              ) : (
                <ul className={styles.route}>
                  {profile.upcomingMilestones.map((stop) => (
                    <li key={stop.level} className={styles.stop}>
                      <span className={styles.stopLevel}>{stop.level}</span>
                      <span className={styles.stopLabel}>{stop.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${game.panel} ${styles.block}`} aria-label="Paliers déjà récupérés">
              <h2 className={game.sectionTitle}>Dans ton sillage</h2>
              {profile.claimedLevels.length === 0 ? (
                <p className={game.muted}>Aucun palier franchi pour l&apos;instant. Termine une partie : tout compte, même une défaite.</p>
              ) : (
                <ul className={styles.route}>
                  {profile.claimedLevels.map((stop) => (
                    <li key={stop.level} className={styles.stop}>
                      <span className={styles.stopLevelDone}>{stop.level}</span>
                      <span className={styles.stopLabel}>{stop.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Exploits ──────────────────────────────────────── */}
            <section className={`${game.panel} ${styles.blockWide}`} aria-label="Exploits">
              <h2 className={game.sectionTitle}>
                Exploits <span className={game.muted}>· {unlockedAchievements} / {profile.achievements.length}</span>
              </h2>
              <ul className={styles.achievements}>
                {profile.achievements.map((achievement) => (
                  <li key={achievement.code} className={achievement.unlocked ? styles.achievementDone : styles.achievement}>
                    <span className={styles.achievementName}>{achievement.name}</span>
                    <span>{achievement.description}</span>
                    <span>{achievement.unlocked ? `Obtenu · +${achievement.rewardTides} Tides` : `+${achievement.rewardTides} Tides`}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
