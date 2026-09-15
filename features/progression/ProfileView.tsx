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
  claimAchievement,
  claimAllLevelRewards,
  claimDailyLogin,
  claimEverything,
  claimLevelReward,
  type PendingCardChoice,
  type ProfileSummary,
} from "@/features/progression/profileActions";
import { claimQuestReward, type QuestEntry } from "@/features/quests/actions";
import { QUEST_CATEGORY_META } from "@/game/quests";
import { IllustrationPicker } from "@/features/progression/IllustrationPicker";
import type { RewardItem } from "@/features/progression/RewardIcon";
import questStyles from "@/features/quests/QuestDrawer.module.css";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { forgetProgression, notifyProgressionChanged } from "@/features/progression/progressionSync";
import { ProfileIdentity } from "@/features/progression/ProfileIdentity";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { RewardReveal, type RevealedLevel } from "@/features/progression/RewardReveal";
import { AchievementBoard } from "@/features/progression/AchievementBoard";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/Profile.module.css";
import { playButtonClick } from "@/lib/sound";

export type ProfileTab = "carnet" | "recompenses" | "quetes" | "exploits";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "carnet", label: "Carnet de bord" },
  { id: "recompenses", label: "Récompenses de niveau" },
  { id: "quetes", label: "Quêtes" },
  { id: "exploits", label: "Exploits" },
];

/** Ce qui attend le joueur, famille par famille — les pastilles et le « tout réclamer ». */
function waitingCounts(profile: ProfileSummary) {
  const levels = profile.claimableLevels.length + profile.pendingCardChoices.length;
  const quests = profile.quests.filter((quest) => quest.completed && !quest.claimed).length;
  const achievements = profile.achievements.filter((achievement) => achievement.claimable).length;
  const login = profile.login.claimable ? 1 : 0;
  return { levels, quests, achievements, login, total: levels + quests + achievements + login };
}

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
  const [reveal, setReveal] = useState<{ levels: RevealedLevel[]; choices: PendingCardChoice[]; extraItems?: RewardItem[]; title?: string } | null>(null);
  const [claiming, setClaiming] = useState<number | "all" | "everything" | string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  /** Choix d'illustration ouvert à la place de l'onglet. */
  const [picking, setPicking] = useState(false);

  // Le profil lit la base : il réaligne au passage le miroir local du dos
  // équipé (un appareil neuf repart juste, même sans ouvrir Collectables).
  useEffect(() => {
    applyCardBack(profile.cardBacks.equipped);
  }, [profile.cardBacks.equipped, applyCardBack]);

  const waiting = waitingCounts(profile);

  /**
   * TOUT RÉCLAMER : l'escale du jour, puis paliers, quêtes et exploits côté
   * serveur — et une seule révélation qui additionne le tout.
   */
  async function claimAllRewards() {
    if (claiming !== null) return;
    playButtonClick();
    setClaimError(null);
    setClaiming("everything");
    try {
      const extra: RewardItem[] = [];
      if (profile.login.claimable) {
        const login = await claimDailyLogin();
        if (login.ok) {
          if (login.tides) extra.push({ kind: "tides", amount: login.tides });
          if (login.xp) extra.push({ kind: "xp", amount: login.xp });
          if (login.boosterId) extra.push({ kind: "booster", boosterId: login.boosterId, count: 1 });
        }
      }
      const result = await claimEverything();
      const levels = result.levels.filter((entry) => entry.level && entry.items).map((entry) => ({ level: entry.level!, items: entry.items! }));
      const choices = [
        ...profile.pendingCardChoices,
        ...result.levels.map((entry) => entry.cardChoice).filter((entry): entry is PendingCardChoice => Boolean(entry)),
      ];
      if (result.quests.tides > 0) extra.push({ kind: "tides", amount: result.quests.tides });
      if (result.quests.xp > 0) extra.push({ kind: "xp", amount: result.quests.xp });
      for (const boosterId of result.quests.boosterIds) extra.push({ kind: "booster", boosterId, count: 1 });
      if (result.achievements.tides > 0) extra.push({ kind: "tides", amount: result.achievements.tides });
      if (!result.ok) setClaimError(result.error ?? "Une partie des récompenses n'a pas pu être réclamée.");
      if (levels.length > 0 || choices.length > 0 || extra.length > 0) {
        const parts = result.levels.length + result.quests.count + result.achievements.count + (extra.length > 0 && profile.login.claimable ? 1 : 0);
        setReveal({ levels, choices, extraItems: extra, title: parts > 1 ? "Tout est réclamé !" : undefined });
      }
      notifyProgressionChanged();
      onRefresh();
    } finally {
      setClaiming(null);
    }
  }

  async function claimOneAchievement(code: string) {
    if (claiming !== null) return;
    playButtonClick();
    setClaimError(null);
    setClaiming(code);
    try {
      const result = await claimAchievement(code);
      if (!result.ok) setClaimError(result.error ?? "Réclamation impossible.");
      else setReveal({ levels: [], choices: [], extraItems: [{ kind: "tides", amount: result.tides ?? 0 }], title: "Exploit réclamé !" });
      notifyProgressionChanged();
      onRefresh();
    } finally {
      setClaiming(null);
    }
  }

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
        <ProfileIdentity
          displayName={profile.displayName}
          avatarCardId={profile.avatarCardId}
          onChanged={onRefresh}
          onPickIllustration={() => setPicking(true)}
        />

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
        {waiting.total > 0 && (
          <div className={styles.waitingCall}>
            <span className={styles.waitingGift} aria-hidden>
              🎁
            </span>
            <span className={styles.waitingText}>
              <b>
                {waiting.total} récompense{waiting.total > 1 ? "s" : ""}
              </b>{" "}
              à réclamer
            </span>
            <button type="button" className={styles.claimButtonSmall} onClick={() => void claimAllRewards()} disabled={claiming !== null}>
              {claiming === "everything" ? "…" : "Tout réclamer"}
            </button>
          </div>
        )}
        {claimError && <p className={game.error}>{claimError}</p>}

        <nav className={styles.tabs} role="tablist" aria-label="Sections du profil" aria-orientation="vertical">
          {TABS.map((entry) => {
            const badge =
              entry.id === "recompenses" ? waiting.levels : entry.id === "carnet" ? waiting.login : entry.id === "quetes" ? waiting.quests : waiting.achievements;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id && !picking}
                className={tab === entry.id && !picking ? styles.tabActive : styles.tab}
                onClick={() => {
                  if (tab === entry.id && !picking) return;
                  playButtonClick();
                  setPicking(false);
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
        {picking && (
          <IllustrationPicker
            avatarCardId={profile.avatarCardId}
            ownedCardIds={profile.ownedCardIds}
            onClose={() => setPicking(false)}
            onChanged={onRefresh}
          />
        )}
        {!picking && tab === "carnet" && <LogbookTab profile={profile} onRefresh={onRefresh} onShowRewards={() => setTab("recompenses")} />}
        {!picking && tab === "quetes" && <QuestsTab profile={profile} onRefresh={onRefresh} onLeave={onLeave} />}
        {!picking && tab === "recompenses" && (
          <LevelRewardsTab
            profile={profile}
            claiming={claiming}
            error={claimError}
            onClaim={(level) => void claim(level)}
            onChooseCards={chooseCards}
          />
        )}
        {!picking && tab === "exploits" && (
          <AchievementBoard achievements={profile.achievements} onClaim={(code) => void claimOneAchievement(code)} claimingCode={typeof claiming === "string" ? claiming : null} />
        )}
      </main>

      {reveal && (
        <RewardReveal
          levels={reveal.levels}
          choices={reveal.choices}
          extraItems={reveal.extraItems}
          title={reveal.title}
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
  claiming: number | "all" | "everything" | string | null;
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

/* ── Quêtes ─────────────────────────────────────────────────────── */

/**
 * Les quêtes du jour et de la semaine, au profil : les terminées en tête,
 * toute la ligne encaisse. L'écran complet (`/quetes`) garde les filtres,
 * les échéances et les remplacements.
 */
function QuestsTab({ profile, onRefresh, onLeave }: { profile: ProfileSummary; onRefresh: () => void; onLeave?: () => void }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedKeys, setClaimedKeys] = useState<Set<string>>(new Set());

  const entries = useMemo(() => {
    const rank = (entry: QuestEntry) => (entry.completed && !entry.claimed ? 0 : entry.claimed ? 2 : 1);
    return [...profile.quests].sort((a, b) => rank(a) - rank(b) || b.progress / b.target - a.progress / a.target);
  }, [profile.quests]);

  function claim(entry: QuestEntry) {
    const key = `${entry.questId}|${entry.periodKey}`;
    playButtonClick();
    setError(null);
    setBusyKey(key);
    void claimQuestReward(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Réclamation impossible.");
          return;
        }
        setClaimedKeys((current) => new Set(current).add(key));
        notifyProgressionChanged();
        onRefresh();
      })
      .finally(() => setBusyKey(null));
  }

  return (
    <section className={`${game.panel} ${styles.block}`} aria-label="Quêtes">
      <div className={styles.blockHead}>
        <h2 className={game.sectionTitle}>Quêtes du jour et de la semaine</h2>
        <Link
          href="/quetes"
          className={game.link}
          onClick={() => {
            playButtonClick();
            onLeave?.();
          }}
        >
          Journal complet →
        </Link>
      </div>
      {error && <p className={game.error}>{error}</p>}
      {entries.length === 0 ? (
        <p className={game.muted}>Aucune quête en cours pour l&apos;instant.</p>
      ) : (
        <ul className={questStyles.list}>
          {entries.map((entry) => {
            const key = `${entry.questId}|${entry.periodKey}`;
            const claimed = entry.claimed || claimedKeys.has(key);
            const claimable = entry.completed && !claimed;
            const ratio = Math.min(1, entry.progress / entry.target);
            const meta = QUEST_CATEGORY_META[entry.category];
            const Row = claimable ? "button" : "div";
            return (
              <li key={key}>
                <Row
                  {...(claimable ? { type: "button" as const, onClick: () => claim(entry), disabled: busyKey === key } : {})}
                  className={`${questStyles.row} ${claimable ? questStyles.rowClaimable : ""} ${claimed ? questStyles.rowClaimed : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
                  <img src={meta.icon} alt="" aria-hidden draggable={false} className={questStyles.icon} />
                  <div className={questStyles.body}>
                    <span className={questStyles.name}>
                      {entry.name || entry.label}
                      <span className={styles.questPeriod}>{entry.questType === "weekly" ? " · semaine" : " · jour"}</span>
                    </span>
                    <span className={questStyles.objective}>{entry.label}</span>
                    <div className={questStyles.track}>
                      <div className={entry.completed ? questStyles.fillDone : questStyles.fill} style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                  <div className={questStyles.side}>
                    <span className={claimable ? questStyles.rewardReady : questStyles.reward}>
                      {entry.rewardBoosterId ? "1 booster" : `${entry.rewardTides} Tides`}
                    </span>
                    {claimable ? (
                      <span className={styles.claimButtonSmall}>{busyKey === key ? "…" : "Réclamer"}</span>
                    ) : (
                      <span className={questStyles.count}>{claimed ? "Réclamée" : `${Math.min(entry.progress, entry.target)} / ${entry.target}`}</span>
                    )}
                  </div>
                </Row>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
