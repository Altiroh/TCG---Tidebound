"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LOGIN_CYCLE_LENGTH,
  MAX_REWARDED_LEVEL,
  isMilestoneLevel,
  levelRewardItems,
  levelRewardLabel,
  loginRewardForStep,
  loginStepLabel,
} from "@/game/progression";
import { signOut } from "@/app/connexion/actions";
import { claimDailyLogin, type ProfileSummary } from "@/features/progression/profileActions";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { forgetProgression, notifyProgressionChanged } from "@/features/progression/progressionSync";
import { ProfileIdentity } from "@/features/progression/ProfileIdentity";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { AchievementBoard } from "@/features/progression/AchievementBoard";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/Profile.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileScreenProps {
  profile: ProfileSummary;
}

type ProfileTab = "carnet" | "recompenses" | "exploits";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "carnet", label: "Carnet de bord" },
  { id: "recompenses", label: "Récompenses de niveau" },
  { id: "exploits", label: "Exploits" },
];

/**
 * Profil joueur — tout ce que la spec demande d'y voir (Notion
 * « Progression joueur » §12) : niveau, jauge d'XP, XP restante avant le
 * prochain niveau, récompenses des paliers, récompenses de connexion,
 * exploits, accès aux quêtes.
 *
 * Deux plans : à gauche un PANNEAU LATÉRAL — la plaque du joueur, les
 * onglets, et à son pied la déconnexion (qui a quitté le menu principal) ;
 * à droite, le contenu de l'onglet. Les récompenses de niveau ont leur
 * propre onglet, en frise : on voit d'un coup où l'on en est sur la route
 * des cinquante paliers, et ce qui attend à chaque escale.
 *
 * Les dos de carte ne sont plus ici : ce sont des objets de collection, ils
 * vivent dans Collectables.
 */
export function ProfileScreen({ profile }: ProfileScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileTab>("carnet");
  const [signingOut, startSignOut] = useTransition();
  const { apply: applyCardBack } = useCardBack();

  // Le profil lit la base : il réaligne au passage le miroir local du dos
  // équipé (un appareil neuf repart juste, même sans ouvrir Collectables).
  useEffect(() => {
    if (profile.isSignedIn) applyCardBack(profile.cardBacks.equipped);
  }, [profile.isSignedIn, profile.cardBacks.equipped, applyCardBack]);

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

  function handleSignOut() {
    playButtonClick();
    startSignOut(async () => {
      await signOut();
      // Le bandeau ne doit pas réafficher, même un instant, le compte qui part.
      forgetProgression();
      router.push("/");
      router.refresh();
    });
  }

  return (
    <GameScreen active={null} nav="minimal">
      <div className={styles.shell}>
        <aside className={`${game.panel} ${styles.side}`} aria-label="Profil">
          <ProfileIdentity displayName={profile.displayName} avatarCardId={profile.avatarCardId} ownedCardIds={profile.ownedCardIds} />

          <div className={styles.sideLevel}>
            <span className={styles.sideLevelNumber}>{view.level}</span>
            <span className={styles.sideLevelText}>
              <span className={styles.sideLevelCaption}>Niveau</span>
              <span className={styles.sideXpBar} aria-hidden>
                <span className={styles.sideXpFill} style={{ width: `${view.ratio * 100}%` }} />
              </span>
              <span className={styles.sideXpLine}>
                {view.xpIntoLevel} / {view.xpForNextLevel} XP
              </span>
            </span>
          </div>

          <nav className={styles.tabs} role="tablist" aria-label="Sections du profil" aria-orientation="vertical">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                className={tab === entry.id ? styles.tabActive : styles.tab}
                onClick={() => {
                  if (tab === entry.id) return;
                  playButtonClick();
                  setTab(entry.id);
                }}
              >
                {entry.label}
                {entry.id === "exploits" && (
                  <span className={styles.tabCount}>
                    {profile.achievements.filter((achievement) => achievement.unlocked).length}/{profile.achievements.length}
                  </span>
                )}
              </button>
            ))}
            <Link href="/quetes" className={styles.tab} onClick={() => playButtonClick()}>
              Mes quêtes <span aria-hidden>→</span>
            </Link>
          </nav>

          {/* Pied du panneau : la déconnexion, seule, à l'écart du reste —
              un geste qu'on ne fait pas par erreur en cherchant un onglet. */}
          <footer className={styles.sideFooter}>
            <button type="button" className={styles.signOut} onClick={handleSignOut} disabled={signingOut}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </footer>
        </aside>

        <main className={styles.main} role="tabpanel">
          {tab === "carnet" && <LogbookTab profile={profile} onShowRewards={() => setTab("recompenses")} />}
          {tab === "recompenses" && <LevelRewardsTab profile={profile} />}
          {tab === "exploits" && <AchievementsTab profile={profile} />}
        </main>
      </div>
    </GameScreen>
  );
}

/* ── Carnet de bord ─────────────────────────────────────────────── */

function LogbookTab({ profile, onShowRewards }: { profile: ProfileSummary; onShowRewards: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { view } = profile;
  const unlockedAchievements = profile.achievements.filter((achievement) => achievement.unlocked).length;

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

  return (
    <div className={styles.tabBody}>
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
          {/* Série de jours joués. Le record n'apparaît que s'il dépasse la
              série en cours : sinon il répète la même chose deux fois. */}
          <span className={styles.stat} title={`Meilleure série tenue : ${profile.playStreak.best} jour${profile.playStreak.best > 1 ? "s" : ""}`}>
            <span className={styles.statValue}>{profile.playStreak.current}</span>
            <span className={styles.statLabel}>
              Jour{profile.playStreak.current > 1 ? "s" : ""} d&apos;affilée
              {profile.playStreak.best > profile.playStreak.current && ` · record ${profile.playStreak.best}`}
            </span>
          </span>
        </div>

        {profile.preconTokens > 0 && (
          <Link href="/decks" className={game.primary} onClick={() => playButtonClick()}>
            Dépenser un Jeton →
          </Link>
        )}
      </section>

      <section className={`${game.panel} ${styles.block}`} aria-label="Prochains paliers">
        <div className={styles.blockHead}>
          <h2 className={game.sectionTitle}>Prochaines escales</h2>
          <button type="button" className={game.link} onClick={onShowRewards}>
            Toute la route →
          </button>
        </div>
        {profile.upcomingMilestones.length === 0 ? (
          <p className={game.muted}>Tu as atteint le dernier palier prévu dans cette version.</p>
        ) : (
          <ul className={styles.route}>
            {profile.upcomingMilestones.map((stop) => (
              <li key={stop.level} className={styles.stop}>
                <span className={styles.stopLevel}>{stop.level}</span>
                <span className={styles.stopIcons}>
                  {levelRewardItems(stop.level).map((item, index) => (
                    <RewardIcon key={index} item={item} size={30} />
                  ))}
                </span>
                <span className={styles.stopLabel}>{stop.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${game.panel} ${styles.blockWide}`} aria-label="Récompenses de connexion">
        <h2 className={game.sectionTitle}>Escales de connexion</h2>
        <p className={game.muted}>
          Sept escales, une par jour de retour. Une absence ne te fait jamais repartir de zéro : tu reprends là où tu t&apos;étais arrêté.
        </p>

        <ol className={styles.cycle}>
          {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => (
            <li
              key={step}
              className={step === profile.login.step ? styles.escaleCurrent : step < profile.login.step ? styles.escalePassed : styles.escale}
              title={loginStepLabel(step)}
            >
              <span className={styles.escaleIndex}>{step}</span>
              {loginRewardForStep(step).map((item, index) => (
                <RewardIcon key={index} item={item} size={34} />
              ))}
              <span className={styles.escaleLabel}>{loginStepLabel(step)}</span>
            </li>
          ))}
        </ol>

        <button type="button" className={game.primary} onClick={claimLogin} disabled={!profile.login.claimable || isPending}>
          {profile.login.claimable ? "Réclamer l'escale du jour" : "Escale déjà réclamée aujourd'hui"}
        </button>
        {message && <p className={game.muted}>{message}</p>}
        {error && <p className={game.error}>{error}</p>}
      </section>
    </div>
  );
}

/* ── Récompenses de niveau : la frise ───────────────────────────── */

/**
 * Les cinquante paliers sur une frise verticale. Une jauge court le long de
 * la frise et s'arrête EXACTEMENT où en est le joueur : au nœud de son
 * niveau, plus la part d'XP déjà faite vers le suivant. Chaque escale montre
 * ses vraies récompenses (`RewardIcon`) et son état — obtenue, prochaine,
 * à venir.
 *
 * À l'ouverture, la frise se place sur le niveau courant : c'est ce qui
 * intéresse, pas le niveau 1.
 */
function LevelRewardsTab({ profile }: { profile: ProfileSummary }) {
  const { view } = profile;
  const listRef = useRef<HTMLOListElement>(null);
  const claimed = useMemo(() => new Set(profile.claimedLevelNumbers), [profile.claimedLevelNumbers]);
  const levels = useMemo(() => Array.from({ length: MAX_REWARDED_LEVEL }, (_, index) => index + 1), []);
  // Position de la jauge, en « rangées » : le nœud du niveau courant, plus
  // l'avancement vers le suivant. Bornée à la dernière escale.
  const progress = Math.min(MAX_REWARDED_LEVEL - 1, Math.max(0, view.level - 1 + (view.level >= MAX_REWARDED_LEVEL ? 0 : view.ratio)));
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>(`[data-level="${Math.min(view.level + 1, MAX_REWARDED_LEVEL)}"]`);
    if (list && current) list.scrollTop = Math.max(0, current.offsetTop - list.clientHeight / 2);
    // La jauge se remplit une fois la frise en place : on la voit monter.
    const frame = requestAnimationFrame(() => setFilled(progress));
    return () => cancelAnimationFrame(frame);
  }, [progress, view.level]);

  const claimedCount = levels.filter((level) => level <= view.level).length;

  return (
    <section className={`${game.panel} ${styles.rewards}`} aria-label="Récompenses de niveau">
      <header className={styles.rewardsHead}>
        <div>
          <h2 className={game.sectionTitle}>Route des paliers</h2>
          <p className={game.muted}>
            Une récompense à chaque niveau, un gros palier tous les cinq. {claimedCount} / {MAX_REWARDED_LEVEL} escales franchies.
          </p>
        </div>
        <span className={styles.rewardsLevel}>
          Niveau <b>{view.level}</b>
          {!profile.maxRewardedLevelReached && <span className={game.muted}> · encore {view.xpToNextLevel} XP</span>}
        </span>
      </header>

      <ol ref={listRef} className={styles.timeline} style={{ ["--progress" as string]: filled }}>
        <span className={styles.timelineTrack} aria-hidden>
          <span className={styles.timelineFill} />
        </span>

        {levels.map((level) => {
          const items = levelRewardItems(level);
          const reached = level <= view.level;
          const next = level === view.level + 1;
          const milestone = isMilestoneLevel(level);
          const state = reached ? "done" : next ? "next" : "locked";
          return (
            <li key={level} data-level={level} data-state={state} data-milestone={milestone ? "true" : undefined} className={styles.stage}>
              <span className={styles.node} aria-hidden>
                {reached ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  level
                )}
              </span>
              <div className={styles.stageCard}>
                <span className={styles.stageLevel}>Niv. {level}</span>
                <span className={styles.stageIcons}>
                  {items.map((item, index) => (
                    <RewardIcon key={index} item={item} size={milestone ? 44 : 34} />
                  ))}
                </span>
                <span className={styles.stageLabel}>{items.map(levelRewardLabel).join(" · ")}</span>
                <span className={styles.stageStatus}>
                  {reached
                    ? claimed.has(level)
                      ? "Obtenu"
                      : "Franchi"
                    : next
                      ? `Prochain · ${view.xpToNextLevel} XP`
                      : milestone
                        ? "Gros palier"
                        : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ── Exploits ───────────────────────────────────────────────────── */

function AchievementsTab({ profile }: { profile: ProfileSummary }) {
  return <AchievementBoard achievements={profile.achievements} />;
}
