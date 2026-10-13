"use client";

import { useEffect, useRef, useState } from "react";
import { GIFT_OPEN_MS, GiftOpening } from "@/features/progression/GiftOpening";
import { MasteriesSheet } from "@/features/progression/HubSheets";
import { SponsorsSheet } from "@/features/progression/SponsorsSheet";
import {
  LOGIN_CYCLE_LENGTH,
  MAX_REWARDED_LEVEL,
  SPONSORS_UNLOCK_LEVEL,
  levelRewardItems,
  levelRewardLabel,
  loginRewardForStep,
  loginRewardLabel,
} from "@/game/progression";
import {
  claimAllMasteryLevels,
  claimAudienceMilestoneReward,
  claimDailyLogin,
  openSponsorGift,
  openWeeklyChest,
  type ProfileSummary,
} from "@/features/progression/profileActions";
import type { AudienceMilestoneView, AudienceView, MasteryView, SponsorView } from "@/features/progression/hubService";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { onProfileOpenRequest } from "@/features/progression/profileTabs";
import { RewardIcon, type RewardItem } from "@/features/progression/RewardIcon";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/progression/RewardsHub.module.css";
import { playButtonClick } from "@/lib/sound";

interface RewardsHubProps {
  profile: ProfileSummary;
  /** Réclamation de palier en cours (`ProfileView`). */
  claiming: number | "all" | "everything" | string | null;
  /** Un palier, ou `"all"` : tous ceux qui attendent. */
  onClaimLevel: (level: number | "all") => void;
  /** Ouvre la révélation (`RewardReveal`) sur ce qui vient d'être reçu. */
  onReveal: (items: RewardItem[], title: string) => void;
  onRefresh: () => void;
  onShowQuests: () => void;
  onShowAchievements: () => void;
  /** Fenêtre ouverte d'emblée (lien direct vers les mécènes, par exemple). */
  initialSheet?: "sponsors" | "masteries";
}

/** Paliers affichés d'un coup sur la route. */
const ROUTE_WINDOW = 6;

/**
 * L'onglet RÉCOMPENSES de `/profil` : le HUB de progression (Notion
 * « Dynamique de progression — Maîtrises, Coffres, Audience &
 * Commanditaires »). Une scène sur le port, au format de la maquette
 * (1672 × 880, bandeau exclu), comme la cabine du profil :
 *
 *   1. la route des paliers, élément principal ;
 *   2. série de connexion + coffre hebdomadaire, zone secondaire forte ;
 *   3. dessous : quêtes du jour, Maîtrises, Commanditaires, objectifs longs.
 *
 * Un seul signal fort à la fois : ce qui se réclame luit, le reste attend.
 */
export function RewardsHub({ profile, claiming, onClaimLevel, onReveal, onRefresh, onShowQuests, onShowAchievements, initialSheet }: RewardsHubProps) {
  const [error, setError] = useState<string | null>(null);
  /**
   * Réclamation en cours, JUSQU'À la relecture du profil : la récompense
   * reste marquée tant que le nouveau `profile` n'est pas arrivé. Avant, un
   * `startTransition(async …)` (React 18 ne suit pas la partie asynchrone)
   * relâchait les boutons dès le départ de l'appel, et la récompense
   * réclamée restait affichée « à réclamer » jusqu'au `router.refresh()`.
   */
  const [pending, setPending] = useState(false);
  const releaseTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(releaseTimer.current);
    setPending(false);
  }, [profile]);
  useEffect(() => () => window.clearTimeout(releaseTimer.current), []);
  /** Coffret de mécène en train de s'ouvrir (scène plein écran, `GiftOpening`). */
  const [gift, setGift] = useState<{ color: string; name: string | null } | null>(null);
  /** Extension ouverte en grand : tous les mécènes, ou toutes les maîtrises. */
  const [sheet, setSheet] = useState<"sponsors" | "masteries" | null>(initialSheet ?? null);
  useEffect(() => {
    if (initialSheet) setSheet(initialSheet);
  }, [initialSheet]);
  // Un raccourci du bandeau cliqué alors qu’on est déjà ici : la fenêtre s’ouvre à chaque fois,
  // même quand l’URL (?panneau=) n’a pas changé.
  useEffect(() => onProfileOpenRequest((request) => request.panel && setSheet(request.panel)), []);
  /** Refermer une fenêtre la retire aussi de l’URL : l’adresse dit ce qui est ouvert. */
  const closeSheet = () => {
    setSheet(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("panneau")) {
      url.searchParams.delete("panneau");
      window.history.replaceState(window.history.state, "", url);
    }
  };

  /** Une réclamation du hub : erreur affichée, révélation, relecture. */
  function run(action: () => Promise<{ ok: boolean; error?: string; items?: RewardItem[] }>, title: string, revealDelayMs = 0) {
    if (pending) return;
    playButtonClick();
    setError(null);
    const startedAt = Date.now();
    setPending(true);
    void (async () => {
      const result = await action().catch(() => ({ ok: false, error: "Serveur injoignable — réessaie." }) as { ok: boolean; error?: string });
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        setGift(null);
        setPending(false);
        return;
      }
      if ("items" in result && result.items && result.items.length > 0) {
        const items = result.items;
        // Le coffre finit de s'ouvrir sous les yeux du joueur avant la révélation.
        // Compté depuis le clic : la révélation suit la scène sans trou, quelle que soit la réponse du serveur.
        const wait = revealDelayMs - (Date.now() - startedAt);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        onReveal(items, title);
      }
      notifyProgressionChanged();
      onRefresh();
      // Relâché à l'arrivée du profil relu ; filet si la relecture n'aboutit pas.
      releaseTimer.current = window.setTimeout(() => setPending(false), 10_000);
    })();
  }

  /** Tous les paliers en attente d'UN Navire : un clic, pas un par niveau. */
  function claimMastery(mastery: MasteryView) {
    const levels = mastery.claimableLevels;
    if (levels.length === 0) return;
    run(
      () => claimAllMasteryLevels(mastery.shipId),
      levels.length > 1 ? `Maîtrise — ${mastery.shipName}, niveaux ${levels[0]} à ${levels[levels.length - 1]}` : `Maîtrise — ${mastery.shipName}, niveau ${levels[0]}`
    );
  }

  /** Tous les paliers de Maîtrise de tous les Navires. */
  function claimAllMasteries() {
    run(() => claimAllMasteryLevels(), "Maîtrises réclamées !");
  }

  function claimMilestone(milestone: AudienceMilestoneView) {
    run(() => claimAudienceMilestoneReward(milestone.threshold), `Audience — ${milestone.label}`);
  }

  function openGift(sponsor: SponsorView) {
    const stage = sponsor.giftStages[0];
    if (!stage || pending || gift) return;
    // Le coffret s'ouvre à l'écran pendant que le serveur répond ; la révélation attend la fin.
    setGift({ color: sponsor.color, name: sponsor.name });
    run(() => openSponsorGift(sponsor.id, stage), `Un colis de ${sponsor.name ?? "votre admirateur"}`, GIFT_OPEN_MS);
  }

  return (
    <div className={styles.page}>
      <div className={styles.stage}>
        <RouteOfLevels profile={profile} claiming={claiming} onClaimLevel={onClaimLevel} />

        <StreakPanel
          profile={profile}
          busy={pending}
          onClaim={() =>
            run(async () => {
              const result = await claimDailyLogin();
              const items: RewardItem[] = [];
              if (result.tides) items.push({ kind: "tides", amount: result.tides });
              if (result.xp) items.push({ kind: "xp", amount: result.xp });
              if (result.boosterId) items.push({ kind: "booster", boosterId: result.boosterId, count: 1 });
              if (result.cardId) items.push({ kind: "card", rarity: "common", cardId: result.cardId });
              if (result.streakCardId) items.push({ kind: "card", rarity: "abyssal", cardId: result.streakCardId });
              return { ok: result.ok, error: result.error, items };
            }, "Escale franchie !")
          }
        />

        {profile.hub && (
          <ChestPanel
            chest={profile.hub.weeklyChest}
            busy={pending}
            onOpen={() => run(() => openWeeklyChest(), "Coffre hebdomadaire ouvert !", CHEST_OPEN_MS)}
          />
        )}

        <QuestsPanel profile={profile} onShowQuests={onShowQuests} />


        {profile.hub && (
          <MasteriesPanel
            masteries={profile.hub.masteries}
            busy={pending}
            onClaim={claimMastery}
            onClaimAll={claimAllMasteries}
            onShowAll={() => setSheet("masteries")}
          />
        )}

        {profile.hub && (
          <SponsorsPanel
            audience={profile.hub.audience}
            sponsors={profile.hub.sponsors}
            milestones={profile.hub.audienceMilestones}
            unlocked={profile.hub.sponsorsUnlocked}
            busy={pending}
            onOpenGift={openGift}
            onClaimMilestone={claimMilestone}
            onShowAll={() => setSheet("sponsors")}
          />
        )}

        <LongGoalsPanel profile={profile} onShowAchievements={onShowAchievements} />

        {sheet === "sponsors" && profile.hub && (
          <SponsorsSheet
            sponsors={profile.hub.sponsors}
            audience={profile.hub.audience}
            milestones={profile.hub.audienceMilestones}
            unlocked={profile.hub.sponsorsUnlocked}
            busy={pending}
            onOpenGift={openGift}
            onClaimMilestone={claimMilestone}
            onClose={closeSheet}
          />
        )}
        {sheet === "masteries" && profile.hub && (
          <MasteriesSheet masteries={profile.hub.masteries} busy={pending} onClaim={claimMastery} onClaimAll={claimAllMasteries} onClose={closeSheet} />
        )}

        {gift && <GiftOpening color={gift.color} name={gift.name} onDone={() => setGift(null)} />}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Route des paliers ─────────────────────────────────────────────── */

function RouteOfLevels({ profile, claiming, onClaimLevel }: Pick<RewardsHubProps, "profile" | "claiming" | "onClaimLevel">) {
  const { view } = profile;
  const claimed = new Set(profile.claimedLevelNumbers);
  const claimable = new Set(profile.claimableLevels);
  // La fenêtre démarre sur le premier palier à réclamer, sinon deux crans avant le niveau atteint.
  const firstClaimable = Math.min(...profile.claimableLevels, Infinity);
  const anchor = Number.isFinite(firstClaimable) ? firstClaimable : view.level;
  const initialStart = Math.max(1, Math.min(MAX_REWARDED_LEVEL - ROUTE_WINDOW + 1, anchor - 2));
  const [start, setStart] = useState(initialStart);
  useEffect(() => setStart(initialStart), [initialStart]);
  const levels = Array.from({ length: ROUTE_WINDOW }, (_, index) => start + index).filter((level) => level <= MAX_REWARDED_LEVEL);

  return (
    <section className={styles.route} aria-label="Route des paliers">
      <header className={styles.routeHead}>
        <div>
          <h2 className={styles.routeTitle}>Route des paliers</h2>
          <p className={styles.routeSub}>Une récompense à chaque niveau, un gros palier tous les cinq.</p>
        </div>
        {profile.claimableLevels.length > 1 && (
          <button type="button" className={`${styles.claimButton} ${styles.claimAll}`} onClick={() => onClaimLevel("all")} disabled={claiming !== null}>
            {claiming === "all" ? "…" : `Tout réclamer (${profile.claimableLevels.length})`}
          </button>
        )}
        <div className={styles.routeXp}>
          <span className={styles.routeLevelBadge}>{view.level}</span>
          {/* La jauge passe au MILIEU du médaillon ; les chiffres au-dessus, une ligne vide en dessous qui l'équilibre. */}
          <span className={styles.routeXpBody}>
            <span className={styles.routeXpLine}>
              <span>
                {view.xpIntoLevel} / {view.xpForNextLevel} XP
              </span>
              <span>{profile.maxRewardedLevelReached ? "Dernier palier atteint" : `encore ${view.xpToNextLevel} XP`}</span>
            </span>
            <span className={`${styles.bar} ${styles.routeXpBar}`}>
              <span className={styles.barFill} style={{ width: `${view.ratio * 100}%` }} />
            </span>
            <span aria-hidden />
          </span>
        </div>
      </header>

      <div className={styles.routeRow}>
        <button
          type="button"
          className={styles.routeArrow}
          aria-label="Paliers précédents"
          disabled={start <= 1}
          onClick={() => {
            playButtonClick();
            setStart((value) => Math.max(1, value - 3));
          }}
        >
          ‹
        </button>
        <ol className={styles.routeTiles}>
          {levels.map((level) => {
            const items = levelRewardItems(level);
            const state = claimable.has(level) ? "claimable" : claimed.has(level) ? "claimed" : level <= view.level ? "reached" : "locked";
            return (
              <li
                key={level}
                className={styles.palier}
                data-state={state}
                data-current={level === view.level ? "" : undefined}
                title={`Niveau ${level} : ${items.map(levelRewardLabel).join(" · ")}`}
              >
                <span className={styles.palierLevel}>{level}</span>
                {state === "claimable" && <span className={styles.alert} aria-hidden />}
                <span className={styles.palierIcon}>{items[0] && <RewardIcon item={items[0]} size={64} />}</span>
                <span className={styles.palierLabel}>{items.map(levelRewardLabel).join(" · ")}</span>
                {state === "claimable" ? (
                  <button
                    type="button"
                    className={styles.claimButton}
                    onClick={() => onClaimLevel(level)}
                    disabled={claiming !== null}
                  >
                    {claiming === level ? "…" : "Réclamer"}
                  </button>
                ) : state === "claimed" ? (
                  <span className={styles.palierCheck} aria-label="Obtenu">
                    <CheckGlyph />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={styles.routeArrow}
          aria-label="Paliers suivants"
          disabled={start + ROUTE_WINDOW > MAX_REWARDED_LEVEL}
          onClick={() => {
            playButtonClick();
            setStart((value) => Math.min(MAX_REWARDED_LEVEL - ROUTE_WINDOW + 1, value + 3));
          }}
        >
          ›
        </button>
      </div>

      {/* Le fil de la route, juste sous les pointes des parchemins : il s'allume jusqu'au niveau atteint,
          puis avance vers le suivant au rythme de l'XP. `--idx` : la position atteinte, en tuiles depuis la
          première affichée (le CSS la place au centre exact des tuiles, écarts compris). */}
      <div className={styles.routeTrack} aria-hidden>
        <span
          className={styles.routeTrackFill}
          style={{ ["--idx" as string]: view.level - start + (view.level >= MAX_REWARDED_LEVEL ? 0 : view.ratio) }}
        />
        {levels.map((level) => (
          <span
            key={level}
            className={styles.routeDot}
            data-reached={level <= view.level ? "" : undefined}
            data-current={level === view.level ? "" : undefined}
            data-claimable={claimable.has(level) ? "" : undefined}
          />
        ))}
      </div>
    </section>
  );
}

/* ── Série de connexion ────────────────────────────────────────────── */

function StreakPanel({ profile, busy, onClaim }: { profile: ProfileSummary; busy: boolean; onClaim: () => void }) {
  const { login } = profile;
  return (
    <section className={styles.streak} aria-label="Série de connexion">
      <h2 className={styles.streakTitle}>Série de connexion</h2>
      <div className={styles.streakCount} title={`Record : ${login.bestStreak} — encore ${login.daysToStreakBonus} escale(s) d'affilée pour une carte Abyssale.`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
        <img src="/assets/profile/icon-streak.webp" alt="" draggable={false} />
        <strong>{login.streak}</strong>
        <span>jours d&apos;affilée</span>
      </div>
      {Array.from({ length: LOGIN_CYCLE_LENGTH }, (_, index) => index + 1).map((step) => {
        const items = login.cycle[step - 1] ?? loginRewardForStep(step);
        const state = step < login.step ? "passed" : step === login.step ? "current" : "next";
        const claimable = step === login.step && login.claimable;
        const label = items.map(loginRewardLabel).join(" · ");
        return (
          <button
            key={step}
            type="button"
            className={styles.day}
            data-slot={step}
            data-state={state}
            data-claimable={claimable ? "" : undefined}
            disabled={!claimable || busy}
            onClick={onClaim}
            title={claimable ? `Réclamer : ${label}` : `J${step} — ${label}`}
          >
            <span className={styles.dayIcon}>{items[0] && <RewardIcon item={items[0]} size={40} />}</span>
            <span className={styles.dayLabel}>J{step}</span>
            {state === "passed" && (
              <span className={styles.dayCheck}>
                <CheckGlyph />
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}

/* ── Coffre hebdomadaire ───────────────────────────────────────────── */

/** Durée de l'ouverture (secousse, couvercle qui saute) avant la révélation. */
const CHEST_OPEN_MS = 1500;
/** Secousse du coffre fermé avant que le couvercle ne saute. */
const CHEST_SHAKE_MS = 650;

/**
 * Le coffre de la semaine, posé sur le quai du panneau : FERMÉ tant qu'il
 * se remplit (il s'agite doucement quand il est prêt), il tremble puis
 * saute son couvercle dans un éclat de lumière à l'ouverture, et reste
 * OUVERT, vide, jusqu'au lundi suivant.
 */
function ChestPanel({ chest, busy, onOpen }: { chest: NonNullable<ProfileSummary["hub"]>["weeklyChest"]; busy: boolean; onOpen: () => void }) {
  const played = Math.min(chest.played, chest.goal);
  const [phase, setPhase] = useState<"idle" | "shake" | "burst">("idle");
  const state = phase !== "idle" ? phase : chest.claimed ? "open" : chest.claimable ? "ready" : "filling";

  function open() {
    if (phase !== "idle" || !chest.claimable || busy) return;
    setPhase("shake");
    setTimeout(() => {
      setPhase("burst");
      onOpen();
    }, CHEST_SHAKE_MS);
  }

  // Une fois la réclamation passée, le coffre reste ouvert (`chest.claimed`).
  useEffect(() => {
    if (chest.claimed) setPhase("idle");
  }, [chest.claimed]);

  return (
    <section className={styles.chest} aria-label="Coffre hebdomadaire" data-claimable={chest.claimable ? "" : undefined}>
      <div className={styles.chestText}>
        <h2 className={styles.panelTitle}>
          Coffre hebdomadaire
          <span className={styles.help} title="Il se remplit à chaque partie de la semaine (du lundi au dimanche) et s'ouvre à 10 parties. Son contenu suit le booster de la semaine.">
            ?
          </span>
        </h2>
        <p className={styles.chestCount}>
          <strong>
            {played}/{chest.goal}
          </strong>
          <span>parties jouées</span>
        </p>
        <span className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${(played / chest.goal) * 100}%` }} />
        </span>
        <div className={styles.chestFoot}>
          <span className={styles.chestContents} aria-label="Contenu du coffre">
            {chest.contents.map((item, index) => (
              <span key={index} title={loginRewardLabel(item)}>
                <RewardIcon item={item} size={36} />
              </span>
            ))}
          </span>
          {chest.claimed ? (
            <span className={styles.chestDone}>Ouvert — un nouveau lundi</span>
          ) : (
            <button type="button" className={styles.claimButton} onClick={open} disabled={!chest.claimable || busy || phase !== "idle"}>
              {chest.claimable ? "Ouvrir le coffre" : `Encore ${chest.goal - played}`}
            </button>
          )}
        </div>
      </div>

      {/* Le coffre, sur le quai : cliquable lui aussi quand il est prêt. */}
      <button
        type="button"
        className={styles.chestArt}
        data-state={state}
        onClick={open}
        disabled={!chest.claimable || busy || phase !== "idle"}
        aria-label={chest.claimable ? "Ouvrir le coffre" : "Coffre hebdomadaire"}
        tabIndex={chest.claimable ? 0 : -1}
      >
        <span className={styles.chestGlow} aria-hidden />
        {/* eslint-disable @next/next/no-img-element -- calques du coffre, animés séparément */}
        {state === "open" || state === "burst" ? (
          <>
            <img className={styles.chestBase} src="/assets/rewards/coffre/coffre-caisse.webp" alt="" draggable={false} />
            <img className={styles.chestLid} src="/assets/rewards/coffre/coffre-couvercle.webp" alt="" draggable={false} />
          </>
        ) : (
          <img className={styles.chestClosed} src="/assets/rewards/coffre/coffre-ferme.webp" alt="" draggable={false} />
        )}
        {/* eslint-enable @next/next/no-img-element */}
        {state === "burst" && <span className={styles.chestRays} aria-hidden />}
      </button>
    </section>
  );
}

/* ── Quêtes du jour ────────────────────────────────────────────────── */

const QUEST_ICONS: Record<string, string> = {
  cartes: "/assets/quests/icon-cat-card.webp",
  parties: "/assets/quests/icon-cat-partie.webp",
  decks: "/assets/quests/icon-cat-deck.webp",
  stats: "/assets/quests/icon-cat-stat.webp",
  maree: "/assets/quests/icon-cat-maree.webp",
};

/** Temps restant avant minuit UTC — le renouvellement des quêtes du jour. */
function untilUtcMidnight(): string {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const minutes = Math.max(0, Math.floor((next - now.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function QuestsPanel({ profile, onShowQuests }: { profile: ProfileSummary; onShowQuests: () => void }) {
  const daily = profile.quests.filter((quest) => quest.questType === "daily");
  const [remaining, setRemaining] = useState<string | null>(null);
  useEffect(() => {
    setRemaining(untilUtcMidnight());
    const id = setInterval(() => setRemaining(untilUtcMidnight()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className={`${styles.panel} ${styles.quests}`} aria-label="Quêtes du jour">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Quêtes du jour</h2>
        {remaining && <span className={styles.panelMeta}>⏱ {remaining}</span>}
      </header>
      <ul className={styles.rows}>
        {daily.slice(0, 3).map((quest) => (
          <li key={quest.questId} className={styles.row} data-done={quest.completed ? "" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
            <img className={styles.rowIcon} src={QUEST_ICONS[quest.category] ?? QUEST_ICONS.parties} alt="" draggable={false} />
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{quest.label}</span>
              <span className={styles.bar}>
                <span className={styles.barFill} style={{ width: `${Math.min(1, quest.progress / Math.max(1, quest.target)) * 100}%` }} />
              </span>
            </span>
            <span className={styles.rowCount}>
              {Math.min(quest.progress, quest.target)}/{quest.target}
            </span>
            <span className={styles.rowReward}>
              {quest.rewardBoosterId ? (
                <RewardIcon item={{ kind: "booster", boosterId: quest.rewardBoosterId, count: 1 }} size={28} />
              ) : quest.rewardTides > 0 ? (
                <>
                  <RewardIcon item={{ kind: "tides", amount: quest.rewardTides }} size={28} />
                  {quest.rewardTides}
                </>
              ) : (
                <>
                  <RewardIcon item={{ kind: "xp", amount: quest.rewardXp }} size={28} />
                  {quest.rewardXp}
                </>
              )}
            </span>
          </li>
        ))}
        {daily.length === 0 && <li className={styles.empty}>Les quêtes du jour arrivent à ta prochaine visite.</li>}
      </ul>
      <button
        type="button"
        className={styles.footButton}
        onClick={() => {
          playButtonClick();
          onShowQuests();
        }}
      >
        Voir toutes les quêtes ({profile.quests.length}) <span aria-hidden>›</span>
      </button>
    </section>
  );
}

/* ── Maîtrises ─────────────────────────────────────────────────────── */

/** Paliers de Maîtrise en attente, tous Navires confondus. */
export function pendingMasteryLevels(masteries: readonly MasteryView[]): number {
  return masteries.reduce((sum, mastery) => sum + mastery.claimableLevels.length, 0);
}

/**
 * Trois Navires en lignes, comme les quêtes : ceux qui ont un palier à
 * réclamer d'abord, puis les plus joués. Une ligne ne déborde jamais (nom
 * sur une ligne, bouton à droite) ; le reste vit dans « Voir tous les navires ».
 */
function MasteriesPanel({
  masteries,
  busy,
  onClaim,
  onClaimAll,
  onShowAll,
}: {
  masteries: MasteryView[];
  busy: boolean;
  onClaim: (mastery: MasteryView) => void;
  onClaimAll: () => void;
  onShowAll: () => void;
}) {
  const pending = pendingMasteryLevels(masteries);
  const shown = [...masteries].sort((a, b) => Number(b.claimableLevels.length > 0) - Number(a.claimableLevels.length > 0)).slice(0, 3);
  return (
    <section className={`${styles.panel} ${styles.masteries}`} aria-label="Maîtrises">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Maîtrises
          <span className={styles.help} title="Chaque Navire a sa Maîtrise : elle gagne l'XP des parties jouées à son bord, et rapporte une récompense à chaque niveau.">
            ?
          </span>
        </h2>
        {pending > 1 && (
          <button type="button" className={`${styles.claimButton} ${styles.headClaim}`} disabled={busy} onClick={onClaimAll} title={`Réclamer les ${pending} paliers de Maîtrise en attente`}>
            Tout réclamer
          </button>
        )}
      </header>
      <ul className={styles.rows}>
        {shown.map((mastery) => (
          <MasteryRow key={mastery.shipId} mastery={mastery} busy={busy} onClaim={onClaim} />
        ))}
        {shown.length === 0 && <li className={styles.empty}>Mène un Navire en partie pour lancer sa Maîtrise.</li>}
      </ul>
      <button
        type="button"
        className={styles.footButton}
        onClick={() => {
          playButtonClick();
          onShowAll();
        }}
      >
        Voir tous les navires ({masteries.length})
      </button>
    </section>
  );
}

function MasteryRow({ mastery, busy, onClaim }: { mastery: MasteryView; busy: boolean; onClaim: (mastery: MasteryView) => void }) {
  const claimable = mastery.claimableLevels.length;
  const ratio = mastery.xpForNext ? mastery.xpInto / mastery.xpForNext : 1;
  const nextLabel = mastery.nextRewardLevel ? `Niveau ${mastery.nextRewardLevel} : ${mastery.nextReward.map(loginRewardLabel).join(" · ")}` : "Maîtrise complète";
  return (
    <li className={`${styles.row} ${styles.masteryRow}`} data-claimable={claimable ? "" : undefined}>
      <span
        className={styles.masteryArt}
        style={mastery.illustration ? { backgroundImage: `url("${shipIllustrationUrl(mastery.illustration)}")` } : undefined}
        aria-hidden
      >
        <span className={styles.masteryLevel}>{mastery.level}</span>
      </span>
      <span className={styles.rowBody}>
        <span className={styles.masteryName} title={mastery.shipName}>
          {mastery.shipName}
        </span>
        <span className={styles.bar}>
          <span className={styles.barFill} style={{ width: `${ratio * 100}%` }} />
        </span>
        <span className={styles.masteryMeta}>
          {mastery.xpForNext ? `${mastery.xpInto} / ${mastery.xpForNext} XP` : "Complète"} · {mastery.matchesPlayed} partie{mastery.matchesPlayed > 1 ? "s" : ""}
        </span>
      </span>
      {claimable ? (
        <button type="button" className={`${styles.claimButton} ${styles.rowClaim}`} disabled={busy} onClick={() => onClaim(mastery)} title={`Réclamer ${claimable > 1 ? `${claimable} paliers` : `le niveau ${mastery.claimableLevels[0]}`}`}>
          Réclamer
          {claimable > 1 && <span className={styles.rowClaimCount}>{claimable}</span>}
        </button>
      ) : (
        <span className={styles.rowReward} title={nextLabel}>
          {mastery.nextReward[0] && <RewardIcon item={mastery.nextReward[0]} size={28} />}
        </span>
      )}
    </li>
  );
}

/* ── Commanditaires ────────────────────────────────────────────────── */

function SponsorsPanel({
  audience,
  sponsors,
  milestones,
  unlocked,
  busy,
  onOpenGift,
  onClaimMilestone,
  onShowAll,
}: {
  audience: AudienceView;
  sponsors: SponsorView[];
  milestones: AudienceMilestoneView[];
  unlocked: boolean;
  busy: boolean;
  onOpenGift: (sponsor: SponsorView) => void;
  onClaimMilestone: (milestone: AudienceMilestoneView) => void;
  onShowAll: () => void;
}) {
  // Le public rapporte avant même les mécènes : le premier palier franchi et pas encore ouvert.
  const milestone = milestones.find((entry) => entry.claimable);
  // Sa ligne prend la place d'un mécène : les autres restent dans « Voir tous les mécènes ».
  const shown = sponsors.slice(0, milestone ? 2 : 3);
  return (
    <section className={`${styles.panel} ${styles.sponsors}`} aria-label="Mécènes">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Mécènes
          <span
            className={styles.help}
            title={`Le public juge chacune de tes parties : c'est ton Audience. Passé le niveau ${SPONSORS_UNLOCK_LEVEL}, quand elle atteint le seuil d'un mécène, il commence à t'observer — chacun a ses exigences — et envoie un colis à chaque palier d'intérêt. Si ton audience retombe sous son seuil, il perd son intérêt : il faudra le regagner depuis le début (les colis déjà ouverts restent à toi).`}
          >
            ?
          </span>
        </h2>
        <span className={`${styles.panelMeta} ${styles.audienceMeta}`} title="Spectateurs qui suivent tes parties">
          👁 {audience.audience.toLocaleString("fr-FR")}
        </span>
      </header>
      <p className={styles.panelSub}>Le public vous regarde. Certains, derrière lui, vous observent — leur intérêt et leurs colis repartent de zéro chaque jour.</p>
      {milestone && (
        <button
          type="button"
          className={styles.milestoneReady}
          disabled={busy}
          onClick={() => onClaimMilestone(milestone)}
          title={`Palier d'audience « ${milestone.label} » : ouvrir`}
        >
          <span className={styles.alert} aria-hidden />
          Palier d&apos;audience « {milestone.label} » : ouvrir
        </button>
      )}
      {!unlocked ? (
        <div className={styles.locked}>
          <SponsorGlyph id={null} />
          <p>
            Personne ne vous observe encore.
            <br />
            Les Commanditaires remarquent les marins à partir du <strong>niveau {SPONSORS_UNLOCK_LEVEL}</strong>.
          </p>
        </div>
      ) : (
        <ul className={styles.rows}>
          {shown.map((sponsor) => {
            const gift = sponsor.giftStages.length > 0;
            return (
              <li
                key={sponsor.id}
                className={styles.sponsor}
                data-color={sponsor.color}
                data-revealed={sponsor.name ? "" : undefined}
                title={sponsor.style ?? undefined}
              >
                <SponsorGlyph id={sponsor.name ? sponsor.id : null} />
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle} title={sponsor.name ?? undefined}>
                    {sponsor.name ?? (sponsor.watching ? "Quelqu'un vous observe…" : "Un regard dans la foule")}
                  </span>
                  <span className={styles.sponsorStage}>
                    {sponsor.meetsAudience ? sponsor.stageLabel : `Attend ${sponsor.audienceRequired.toLocaleString("fr-FR")} spectateurs`}
                  </span>
                  <span className={styles.bar}>
                    <span className={styles.barFill} style={{ width: `${sponsor.percent}%` }} />
                  </span>
                </span>
                <span className={styles.rowCount}>{sponsor.percent}%</span>
                <button
                  type="button"
                  className={styles.giftButton}
                  data-ready={gift ? "" : undefined}
                  disabled={!gift || busy}
                  onClick={() => onOpenGift(sponsor)}
                  aria-label={gift ? "Ouvrir le colis" : "Pas de colis pour l'instant"}
                  title={gift ? "Un colis vous attend" : "Pas de colis pour l'instant"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- coffret peint */}
                  <img src="/assets/mecenes/coffret/coffret-ferme.webp" alt="" draggable={false} />
                  {gift && <span className={styles.alert} aria-label="Colis à réclamer" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className={styles.footButton}
        onClick={() => {
          playButtonClick();
          onShowAll();
        }}
      >
        Voir tous les mécènes
      </button>
    </section>
  );
}

/* ── Objectifs au long cours (exploits) ────────────────────────────── */

function LongGoalsPanel({ profile, onShowAchievements }: { profile: ProfileSummary; onShowAchievements: () => void }) {
  // Les exploits les plus proches d'être accomplis : ce qui se joue maintenant.
  const goals = profile.achievements
    .filter((achievement) => !achievement.unlocked && achievement.progress)
    .map((achievement) => ({ achievement, ratio: achievement.progress!.current / Math.max(1, achievement.progress!.target) }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3);
  return (
    <section className={`${styles.panel} ${styles.goals}`} aria-label="Objectifs au long cours">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Objectifs au long cours</h2>
      </header>
      <ul className={styles.rows}>
        {goals.map(({ achievement }) => (
          <li key={achievement.code} className={styles.row}>
            <span className={styles.goalGlyph} aria-hidden>
              ✦
            </span>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{achievement.description}</span>
              <span className={styles.bar}>
                <span className={styles.barFill} style={{ width: `${Math.min(1, achievement.progress!.current / Math.max(1, achievement.progress!.target)) * 100}%` }} />
              </span>
            </span>
            <span className={styles.rowCount}>
              {Math.min(achievement.progress!.current, achievement.progress!.target)}/{achievement.progress!.target}
            </span>
            <span className={styles.rowReward}>
              <RewardIcon item={{ kind: "tides", amount: achievement.rewardTides }} size={28} />
            </span>
          </li>
        ))}
        {goals.length === 0 && <li className={styles.empty}>Tous les exploits en cours sont accomplis.</li>}
      </ul>
      <button
        type="button"
        className={styles.footButton}
        onClick={() => {
          playButtonClick();
          onShowAchievements();
        }}
      >
        Voir tous les exploits
      </button>
    </section>
  );
}

/* ── Pictogrammes ──────────────────────────────────────────────────── */

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Sceau d'un mécène : son insigne (`public/assets/mecenes/`). `null` : l'œil de l'inconnu, qui ne trahit personne. */
function SponsorGlyph({ id }: { id: SponsorView["id"] | null }) {
  return (
    <span className={styles.sigil} data-unknown={id ? undefined : ""} aria-hidden>
      {id ? (
        // eslint-disable-next-line @next/next/no-img-element -- insigne local
        <img src={`/assets/mecenes/${id}-insigne.webp`} alt="" draggable={false} />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        </svg>
      )}
    </span>
  );
}

