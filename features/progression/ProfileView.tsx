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
import {
  claimAllLevelRewards,
  claimDailyLogin,
  claimLevelReward,
  type PendingCardChoice,
  type ProfileSummary,
} from "@/features/progression/profileActions";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { forgetProgression, notifyProgressionChanged } from "@/features/progression/progressionSync";
import { ProfileIdentity } from "@/features/progression/ProfileIdentity";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { RewardReveal, type RevealedLevel } from "@/features/progression/RewardReveal";
import { AchievementBoard } from "@/features/progression/AchievementBoard";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/Profile.module.css";
import { playButtonClick } from "@/lib/sound";

export type ProfileTab = "carnet" | "recompenses" | "exploits";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "carnet", label: "Carnet de bord" },
  { id: "recompenses", label: "Récompenses de niveau" },
  { id: "exploits", label: "Exploits" },
];

interface ProfileViewProps {
  profile: ProfileSummary;
  /** Relit le profil après une écriture (réclamation, pseudo…). */
  onRefresh: () => void;
  initialTab?: ProfileTab;
  /** Panneau : ferme le panneau avant de quitter (quêtes, déconnexion). */
  onLeave?: () => void;
}

/**
 * Le PROFIL — panneau latéral (portrait, niveau, onglets, déconnexion) et
 * contenu de l'onglet. Rendu tel quel dans le panneau ouvert depuis le
 * bandeau (`ProfileDrawer`) et sur la page `/profil`.
 *
 * Tout ce qui attend le joueur BRILLE : une pastille sur l'onglet, un
 * bandeau « à réclamer » en tête, un bouton qui pulse sur chaque palier. Le
 * geste de réclamer ouvre une révélation (`RewardReveal`) — c'est le
 * moment qu'on vient chercher.
 */
export function ProfileView({ profile, onRefresh, initialTab = "carnet", onLeave }: ProfileViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [signingOut, startSignOut] = useTransition();
  const { apply: applyCardBack } = useCardBack();
  const [reveal, setReveal] = useState<{ levels: RevealedLevel[]; choices: PendingCardChoice[] } | null>(null);
  const [claiming, setClaiming] = useState<number | "all" | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Le profil lit la base : il réaligne au passage le miroir local du dos
  // équipé (un appareil neuf repart juste, même sans ouvrir Collectables).
  useEffect(() => {
    applyCardBack(profile.cardBacks.equipped);
  }, [profile.cardBacks.equipped, applyCardBack]);

  const rewardsWaiting = profile.claimableLevels.length + profile.pendingCardChoices.length;

  function handleSignOut() {
    playButtonClick();
    startSignOut(async () => {
      await signOut();
      // Le bandeau ne doit pas réafficher, même un instant, le compte qui part.
      forgetProgression();
      onLeave?.();
      router.push("/");
      router.refresh();
    });
  }

  async function claim(level: number | "all") {
    if (claiming !== null) return;
    playButtonClick();
    setClaimError(null);
    setClaiming(level);
    try {
      if (level === "all") {
        const result = await claimAllLevelRewards();
        const levels = result.claimed.filter((entry) => entry.level && entry.items).map((entry) => ({ level: entry.level!, items: entry.items! }));
        const choices = [
          ...profile.pendingCardChoices,
          ...result.claimed.map((entry) => entry.cardChoice).filter((entry): entry is PendingCardChoice => Boolean(entry)),
        ];
        if (!result.ok) setClaimError(result.error ?? "Réclamation impossible.");
        if (levels.length > 0 || choices.length > 0) setReveal({ levels, choices });
      } else {
        const result = await claimLevelReward(level);
        if (!result.ok) {
          setClaimError(result.error ?? "Réclamation impossible.");
        } else {
          setReveal({ levels: [{ level, items: result.items ?? [] }], choices: result.cardChoice ? [result.cardChoice] : [] });
        }
      }
      notifyProgressionChanged();
    } finally {
      setClaiming(null);
    }
  }

  function chooseCards(choices: PendingCardChoice[]) {
    playButtonClick();
    setReveal({ levels: [], choices });
  }

  const { view } = profile;

  return (
    <div className={styles.shell}>
      <aside className={`${game.panel} ${styles.side}`} aria-label="Profil">
        <ProfileIdentity displayName={profile.displayName} avatarCardId={profile.avatarCardId} ownedCardIds={profile.ownedCardIds} onChanged={onRefresh} />

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

        {/* Ce qui attend : visible dès l'ouverture, quel que soit l'onglet. */}
        {rewardsWaiting > 0 && (
          <button
            type="button"
            className={styles.waitingCall}
            onClick={() => {
              playButtonClick();
              setTab("recompenses");
            }}
          >
            <span className={styles.waitingGift} aria-hidden>
              🎁
            </span>
            <span>
              <b>
                {rewardsWaiting} récompense{rewardsWaiting > 1 ? "s" : ""}
              </b>{" "}
              à réclamer
            </span>
          </button>
        )}

        <nav className={styles.tabs} role="tablist" aria-label="Sections du profil" aria-orientation="vertical">
          {TABS.map((entry) => {
            const badge = entry.id === "recompenses" ? rewardsWaiting : entry.id === "carnet" ? (profile.login.claimable ? 1 : 0) : 0;
            return (
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
                {badge > 0 ? (
                  <span className={styles.tabBadge} aria-label={`${badge} à réclamer`}>
                    {badge}
                  </span>
                ) : entry.id === "exploits" ? (
                  <span className={styles.tabCount}>
                    {profile.achievements.filter((achievement) => achievement.unlocked).length}/{profile.achievements.length}
                  </span>
                ) : null}
              </button>
            );
          })}
          <Link
            href="/quetes"
            className={styles.tab}
            onClick={() => {
              playButtonClick();
              onLeave?.();
            }}
          >
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
        {tab === "carnet" && <LogbookTab profile={profile} onRefresh={onRefresh} onShowRewards={() => setTab("recompenses")} />}
        {tab === "recompenses" && (
          <LevelRewardsTab
            profile={profile}
            claiming={claiming}
            error={claimError}
            onClaim={(level) => void claim(level)}
            onChooseCards={chooseCards}
          />
        )}
        {tab === "exploits" && <AchievementBoard achievements={profile.achievements} />}
      </main>

      {reveal && (
        <RewardReveal
          levels={reveal.levels}
          choices={reveal.choices}
          onDone={() => {
            setReveal(null);
            notifyProgressionChanged();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

/* ── Carnet de bord ─────────────────────────────────────────────── */

function LogbookTab({ profile, onRefresh, onShowRewards }: { profile: ProfileSummary; onRefresh: () => void; onShowRewards: () => void }) {
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
      onRefresh();
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

      <section className={`${game.panel} ${styles.blockWide}`} aria-label="Récompenses de connexion" data-claimable={profile.login.claimable ? "true" : undefined}>
        <h2 className={game.sectionTitle}>Escales de connexion</h2>
        <p className={game.muted}>
          Sept escales, une par jour de retour. Une absence ne te fait jamais repartir de zéro : tu reprends là où tu t&apos;étais arrêté.
        </p>

        <ol className={styles.cycle}>
          {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => (
            <li
              key={step}
              className={step === profile.login.step ? styles.escaleCurrent : step < profile.login.step ? styles.escalePassed : styles.escale}
              data-claimable={step === profile.login.step && profile.login.claimable ? "true" : undefined}
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

        <button
          type="button"
          className={profile.login.claimable ? styles.claimButton : game.secondary}
          onClick={claimLogin}
          disabled={!profile.login.claimable || isPending}
        >
          {profile.login.claimable ? "Réclamer l'escale du jour" : "Escale déjà réclamée aujourd'hui"}
        </button>
        {message && <p className={game.muted}>{message}</p>}
        {error && <p className={game.error}>{error}</p>}
      </section>
    </div>
  );
}

/* ── Récompenses de niveau : la frise ───────────────────────────── */

interface LevelRewardsTabProps {
  profile: ProfileSummary;
  claiming: number | "all" | null;
  error: string | null;
  onClaim: (level: number | "all") => void;
  onChooseCards: (choices: PendingCardChoice[]) => void;
}

/**
 * Les cinquante paliers sur une frise verticale. Une jauge court le long de
 * la frise et s'arrête EXACTEMENT où en est le joueur. Chaque escale montre
 * ses vraies récompenses et son état : à réclamer (elle pulse), obtenue,
 * prochaine, à venir.
 *
 * À l'ouverture, la frise se place sur le premier palier à réclamer, ou à
 * défaut sur le niveau courant.
 */
function LevelRewardsTab({ profile, claiming, error, onClaim, onChooseCards }: LevelRewardsTabProps) {
  const { view } = profile;
  const listRef = useRef<HTMLOListElement>(null);
  const claimable = useMemo(() => new Set(profile.claimableLevels), [profile.claimableLevels]);
  const choicesByLevel = useMemo(() => {
    const map = new Map<number, PendingCardChoice[]>();
    for (const choice of profile.pendingCardChoices) {
      if (choice.level === null) continue;
      map.set(choice.level, [...(map.get(choice.level) ?? []), choice]);
    }
    return map;
  }, [profile.pendingCardChoices]);
  const levels = useMemo(() => Array.from({ length: MAX_REWARDED_LEVEL }, (_, index) => index + 1), []);
  // Position de la jauge, en « rangées » : le nœud du niveau courant, plus
  // l'avancement vers le suivant. Bornée à la dernière escale.
  const progress = Math.min(MAX_REWARDED_LEVEL - 1, Math.max(0, view.level - 1 + (view.level >= MAX_REWARDED_LEVEL ? 0 : view.ratio)));
  const [filled, setFilled] = useState(0);
  const focusLevel = profile.claimableLevels[0] ?? Math.min(view.level + 1, MAX_REWARDED_LEVEL);
  const waiting = profile.claimableLevels.length + profile.pendingCardChoices.length;

  useEffect(() => {
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>(`[data-level="${focusLevel}"]`);
    if (list && target) list.scrollTop = Math.max(0, target.offsetTop - list.clientHeight / 2);
    // La jauge se remplit une fois la frise en place : on la voit monter.
    const frame = requestAnimationFrame(() => setFilled(progress));
    return () => cancelAnimationFrame(frame);
  }, [progress, focusLevel]);

  return (
    <section className={`${game.panel} ${styles.rewards}`} aria-label="Récompenses de niveau">
      <header className={styles.rewardsHead}>
        <div>
          <h2 className={game.sectionTitle}>Route des paliers</h2>
          <p className={game.muted}>
            Une récompense à chaque niveau, un gros palier tous les cinq. {profile.claimedLevelNumbers.length} / {MAX_REWARDED_LEVEL} réclamées.
          </p>
        </div>
        <span className={styles.rewardsLevel}>
          Niveau <b>{view.level}</b>
          {!profile.maxRewardedLevelReached && <span className={game.muted}> · encore {view.xpToNextLevel} XP</span>}
        </span>
      </header>

      {waiting > 0 && (
        <div className={styles.claimBanner} role="status">
          <span className={styles.claimBannerText}>
            <span className={styles.waitingGift} aria-hidden>
              🎁
            </span>
            <b>
              {waiting} récompense{waiting > 1 ? "s" : ""}
            </b>{" "}
            t&apos;attend{waiting > 1 ? "ent" : ""} !
          </span>
          {profile.claimableLevels.length > 0 ? (
            <button type="button" className={styles.claimButton} onClick={() => onClaim("all")} disabled={claiming !== null}>
              {claiming === "all" ? "Ouverture…" : profile.claimableLevels.length > 1 ? "Tout réclamer" : "Réclamer"}
            </button>
          ) : (
            <button type="button" className={styles.claimButton} onClick={() => onChooseCards(profile.pendingCardChoices)} disabled={claiming !== null}>
              Choisir mes cartes
            </button>
          )}
        </div>
      )}
      {error && <p className={game.error}>{error}</p>}

      <ol ref={listRef} className={styles.timeline} style={{ ["--progress" as string]: filled }}>
        <span className={styles.timelineTrack} aria-hidden>
          <span className={styles.timelineFill} />
        </span>

        {levels.map((level) => {
          const items = levelRewardItems(level);
          const reached = level <= view.level;
          const toClaim = claimable.has(level);
          const pendingChoices = choicesByLevel.get(level) ?? [];
          const next = level === view.level + 1;
          const milestone = isMilestoneLevel(level);
          const state = toClaim || pendingChoices.length > 0 ? "claimable" : reached ? "done" : next ? "next" : "locked";
          return (
            <li key={level} data-level={level} data-state={state} data-milestone={milestone ? "true" : undefined} className={styles.stage}>
              <span className={styles.node} aria-hidden>
                {state === "claimable" ? "!" : reached ? (
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
                  {toClaim ? (
                    <button type="button" className={styles.claimButtonSmall} onClick={() => onClaim(level)} disabled={claiming !== null}>
                      {claiming === level ? "…" : "Réclamer"}
                    </button>
                  ) : pendingChoices.length > 0 ? (
                    <button type="button" className={styles.claimButtonSmall} onClick={() => onChooseCards(pendingChoices)} disabled={claiming !== null}>
                      Choisir ma carte
                    </button>
                  ) : reached ? (
                    "Obtenu"
                  ) : next ? (
                    `Prochain · ${view.xpToNextLevel} XP`
                  ) : milestone ? (
                    "Gros palier"
                  ) : (
                    ""
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
