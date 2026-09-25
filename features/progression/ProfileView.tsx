"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LOGIN_CYCLE_LENGTH,
  LOGIN_STREAK_MILESTONE,
  MAX_REWARDED_LEVEL,
  isMilestoneLevel,
  levelRewardItems,
  levelRewardLabel,
  loginBoosterName,
  loginRewardForStep,
  loginRewardLabel,
} from "@/game/progression";
import { loginGainsText } from "@/features/progression/dailyLogin";
import { rarityForCardId } from "@/game/boosters";
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
import { fetchQuestBoard, type QuestBoard } from "@/features/quests/actions";
import { fetchVoyageBoard, type VoyageBoard } from "@/features/quests/voyageActions";
import { QuestJournal } from "@/features/quests/QuestJournal";
import { IllustrationPicker } from "@/features/progression/IllustrationPicker";
import { TitlePicker } from "@/features/progression/TitlePicker";
import type { RewardItem } from "@/features/progression/RewardIcon";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { forgetProgression, notifyProgressionChanged } from "@/features/progression/progressionSync";
import { ProfileIdentity } from "@/features/progression/ProfileIdentity";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { RewardReveal, type RevealedLevel } from "@/features/progression/RewardReveal";
import { AchievementBoard } from "@/features/progression/AchievementBoard";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/Profile.module.css";
import sceneStyles from "@/features/progression/ProfileScene.module.css";
import { ProfileScene } from "@/features/progression/ProfileScene";
import { playButtonClick, playRewardClaimed, playTabClick } from "@/lib/sound";
import type { ProfileTab } from "@/features/progression/profileTabs";

export type { ProfileTab };

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "carnet", label: "Carnet de bord" },
  { id: "recompenses", label: "Récompenses de niveau" },
  { id: "quetes", label: "Quêtes" },
  { id: "exploits", label: "Exploits" },
];

/** Ce qui attend le joueur, famille par famille — les pastilles et le « tout réclamer ». */
export function waitingCounts(profile: ProfileSummary) {
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
  /**
   * `drawer` (défaut) : panneau latéral + contenu, tel qu'ouvert depuis le
   * bandeau. `page` : la page `/profil` — les onglets vivent dans le
   * bandeau de l'écran (`tab` / `onTabChange`), et l'onglet Profil est la
   * scène de la cabine (`ProfileScene`).
   */
  layout?: "drawer" | "page";
  /** Onglet affiché, piloté par l'écran (`layout="page"`). */
  tab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
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
export function ProfileView({ profile, onRefresh, initialTab = "carnet", onLeave, layout = "drawer", tab: controlledTab, onTabChange }: ProfileViewProps) {
  const router = useRouter();
  const [ownTab, setOwnTab] = useState<ProfileTab>(initialTab);
  const tab = controlledTab ?? ownTab;
  const setTab = (next: ProfileTab) => (onTabChange ? onTabChange(next) : setOwnTab(next));
  const [signingOut, startSignOut] = useTransition();
  const { apply: applyCardBack } = useCardBack();
  const [reveal, setReveal] = useState<{ levels: RevealedLevel[]; choices: PendingCardChoice[]; extraItems?: RewardItem[]; title?: string } | null>(null);
  const [claiming, setClaiming] = useState<number | "all" | "everything" | string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  /** Choix (illustration ou titre) ouvert à la place de l'onglet. */
  const [picker, setPicker] = useState<"illustration" | "title" | null>(null);
  const picking = picker !== null;
  const equippedTitleName = profile.titles.options.find((option) => option.id === profile.titles.equipped)?.name ?? null;

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
          if (login.cardId) extra.push({ kind: "card", rarity: rarityForCardId(login.cardId) ?? "common", cardId: login.cardId });
          if (login.streakCardId) extra.push({ kind: "card", rarity: "abyssal", cardId: login.streakCardId });
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

  const revealLayer = reveal && (
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
  );

  if (layout === "page") {
    // Un choix (illustration, titre) s'ouvre à la place de la scène ; le fermer y ramène.
    if (picking || tab !== "carnet") {
      return (
        <div className={sceneStyles.tabPage}>
          {claimError && <p className={`${game.error} ${sceneStyles.claimError}`}>{claimError}</p>}
          <div className={sceneStyles.tabPanel} role="tabpanel">
            {picker === "illustration" && (
              <IllustrationPicker
                avatarCardId={profile.avatarCardId}
                ownedCardIds={profile.ownedCardIds}
                onClose={() => setPicker(null)}
                onChanged={onRefresh}
              />
            )}
            {picker === "title" && <TitlePicker titles={profile.titles} onClose={() => setPicker(null)} onChanged={onRefresh} />}
            {!picking && tab === "quetes" && <QuestsTab onRefresh={onRefresh} />}
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
              <AchievementBoard
                achievements={profile.achievements}
                onClaim={(code) => void claimOneAchievement(code)}
                claimingCode={typeof claiming === "string" ? claiming : null}
              />
            )}
          </div>
          {revealLayer}
        </div>
      );
    }
    return (
      <>
        <ProfileScene
          profile={profile}
          titleName={equippedTitleName}
          waitingTotal={waiting.total}
          claimingAll={claiming === "everything"}
          onClaimAll={() => void claimAllRewards()}
          onPickIllustration={() => setPicker("illustration")}
          onPickTitle={() => setPicker("title")}
          onShowRoute={() => setTab("recompenses")}
          onRefresh={onRefresh}
          onSignOut={handleSignOut}
          signingOut={signingOut}
        />
        {revealLayer}
      </>
    );
  }

  return (
    <div className={styles.shell}>
      <aside className={`${game.panel} ${styles.side}`} aria-label="Profil">
        <ProfileIdentity
          displayName={profile.displayName}
          avatarCardId={profile.avatarCardId}
          onChanged={onRefresh}
          onPickIllustration={() => setPicker("illustration")}
          titleName={equippedTitleName}
          onPickTitle={() => setPicker("title")}
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
                  playTabClick();
                  setPicker(null);
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
        {picker === "illustration" && (
          <IllustrationPicker
            avatarCardId={profile.avatarCardId}
            ownedCardIds={profile.ownedCardIds}
            onClose={() => setPicker(null)}
            onChanged={onRefresh}
          />
        )}
        {picker === "title" && <TitlePicker titles={profile.titles} onClose={() => setPicker(null)} onChanged={onRefresh} />}
        {!picking && tab === "carnet" && <LogbookTab profile={profile} onRefresh={onRefresh} onShowRewards={() => setTab("recompenses")} />}
        {!picking && tab === "quetes" && <QuestsTab onRefresh={onRefresh} />}
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

      {revealLayer}
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
      const gains = loginGainsText(result);
      playRewardClaimed();
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
            <span className={styles.statValue}>
              <TideCoin size={20} />
              {profile.balance}
            </span>
            <span className={styles.statLabel}>Tides</span>
          </span>
          <span className={styles.stat}>
            <span className={styles.statValue}>
              <PreconToken size={20} />
              {profile.preconTokens}
            </span>
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
            <PreconToken size={16} /> Dépenser un Jeton →
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
                    <RewardIcon key={index} item={item} size={36} />
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
          Les escales changent chaque lundi — cette semaine, le cap est mis sur le booster{" "}
          <strong>{loginBoosterName(profile.login.weekBoosterId)}</strong>.
        </p>

        <ol className={styles.cycle}>
          {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => {
            const items = profile.login.cycle[step - 1] ?? loginRewardForStep(step);
            const label = items.map(loginRewardLabel).join(" · ");
            return (
              <li
                key={step}
                className={step === profile.login.step ? styles.escaleCurrent : step < profile.login.step ? styles.escalePassed : styles.escale}
                data-claimable={step === profile.login.step && profile.login.claimable ? "true" : undefined}
                title={label}
              >
                <span className={styles.escaleIndex}>{step}</span>
                {items.map((item, itemIndex) => (
                  <RewardIcon key={itemIndex} item={item} size={42} />
                ))}
                <span className={styles.escaleLabel}>{label}</span>
              </li>
            );
          })}
        </ol>

        {/* Série : comptée À PART du cycle — la manquer ne fait pas reculer les escales. */}
        <div className={styles.streakRow}>
          <RewardIcon item={{ kind: "card", rarity: "abyssal" }} size={36} />
          <p className={styles.streakText}>
            <strong>
              Série : {profile.login.streak} jour{profile.login.streak > 1 ? "s" : ""} d&apos;affilée
            </strong>
            {" — "}
            {LOGIN_STREAK_MILESTONE} jours sans en manquer un offrent une carte Abyssale
            {` (encore ${profile.login.daysToStreakBonus} escale${profile.login.daysToStreakBonus > 1 ? "s" : ""}).`}
            {profile.login.bestStreak > 0 && <span className={styles.streakBest}> Record : {profile.login.bestStreak}.</span>}
          </p>
        </div>

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
 * L'onglet « Quêtes » : la Traversée puis le journal complet (filtres,
 * échéances, remplacements). Il n'y a plus d'écran `/quetes` — tout vit ici.
 *
 * Le journal se lit à l'ouverture de l'onglet, pas avec le profil : le
 * profil s'ouvre sur le carnet de bord, et deux lectures de plus à chaque
 * ouverture pour un onglet qu'on ne regarde pas toujours coûteraient pour
 * rien. Après une réclamation, journal ET profil sont relus (pastilles,
 * niveau).
 */
function QuestsTab({ onRefresh }: { onRefresh: () => void }) {
  const [boards, setBoards] = useState<{ quests: QuestBoard; voyages: VoyageBoard } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchQuestBoard(), fetchVoyageBoard()])
      .then(([quests, voyages]) => setBoards({ quests, voyages }))
      .catch((cause) => {
        console.error("[ProfileView] Lecture des quêtes impossible :", cause);
        setFailed(true);
      });
  }, []);

  useEffect(load, [load]);

  if (!boards) {
    return (
      <section className={`${game.panel} ${styles.block}`} aria-label="Quêtes">
        <p className={game.muted}>{failed ? "Tes quêtes n'ont pas pu être chargées." : "Chargement du journal de bord…"}</p>
      </section>
    );
  }

  return (
    <QuestJournal
      board={boards.quests}
      voyages={boards.voyages}
      onChanged={() => {
        load();
        onRefresh();
      }}
    />
  );
}
