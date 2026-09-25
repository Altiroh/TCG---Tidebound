"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
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
  claimDailyLogin,
  claimMasteryLevel,
  openSponsorGift,
  openWeeklyChest,
  type ProfileSummary,
} from "@/features/progression/profileActions";
import type { MasteryView, SponsorView } from "@/features/progression/hubService";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { RewardIcon, type RewardItem } from "@/features/progression/RewardIcon";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/progression/RewardsHub.module.css";
import { playButtonClick } from "@/lib/sound";

interface RewardsHubProps {
  profile: ProfileSummary;
  /** Réclamation de palier en cours (`ProfileView`). */
  claiming: number | "all" | "everything" | string | null;
  onClaimLevel: (level: number) => void;
  /** Ouvre la révélation (`RewardReveal`) sur ce qui vient d'être reçu. */
  onReveal: (items: RewardItem[], title: string) => void;
  onRefresh: () => void;
  onShowQuests: () => void;
  onShowAchievements: () => void;
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
export function RewardsHub({ profile, claiming, onClaimLevel, onReveal, onRefresh, onShowQuests, onShowAchievements }: RewardsHubProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Une réclamation du hub : erreur affichée, révélation, relecture. */
  function run(action: () => Promise<{ ok: boolean; error?: string; items?: RewardItem[] }>, title: string) {
    if (pending) return;
    playButtonClick();
    setError(null);
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, error: "Serveur injoignable — réessaie." }) as { ok: boolean; error?: string });
      if (!result.ok) {
        setError(result.error ?? "Réclamation impossible.");
        return;
      }
      if ("items" in result && result.items && result.items.length > 0) onReveal(result.items, title);
      notifyProgressionChanged();
      onRefresh();
    });
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
            onOpen={() => run(() => openWeeklyChest(), "Coffre hebdomadaire ouvert !")}
          />
        )}

        <QuestsPanel profile={profile} onShowQuests={onShowQuests} />

        {profile.hub && (
          <MasteriesPanel
            masteries={profile.hub.masteries}
            busy={pending}
            onClaim={(mastery, level) => run(() => claimMasteryLevel(mastery.shipId, level), `Maîtrise — ${mastery.shipName}, niveau ${level}`)}
          />
        )}

        {profile.hub && (
          <SponsorsPanel
            sponsors={profile.hub.sponsors}
            unlocked={profile.hub.sponsorsUnlocked}
            busy={pending}
            onOpenGift={(sponsor) => {
              const stage = sponsor.giftStages[0];
              if (stage) run(() => openSponsorGift(sponsor.id, stage), `Un colis de ${sponsor.name ?? "votre admirateur"}`);
            }}
          />
        )}

        <LongGoalsPanel profile={profile} onShowAchievements={onShowAchievements} />

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
        <div className={styles.routeXp}>
          <span className={styles.routeLevelBadge}>{view.level}</span>
          <span className={styles.routeXpBody}>
            <span className={styles.bar}>
              <span className={styles.barFill} style={{ width: `${view.ratio * 100}%` }} />
            </span>
            <span className={styles.routeXpLine}>
              <span>
                {view.xpIntoLevel} / {view.xpForNextLevel} XP
              </span>
              <span>{profile.maxRewardedLevelReached ? "Dernier palier atteint" : `encore ${view.xpToNextLevel} XP`}</span>
            </span>
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
              <li key={level} className={styles.palier} data-state={state} data-current={level === view.level ? "" : undefined}>
                <span className={styles.palierLevel}>{level}</span>
                {state === "claimable" && <span className={styles.alert} aria-hidden>!</span>}
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

      {/* Le fil de la route : il s'allume jusqu'au niveau atteint. */}
      <div className={styles.routeTrack} aria-hidden>
        <span className={styles.routeTrackFill} style={{ width: `${Math.max(0, Math.min(1, (view.level - start + view.ratio) / ROUTE_WINDOW)) * 100}%` }} />
        {levels.map((level) => (
          <span key={level} className={styles.routeDot} data-reached={level <= view.level ? "" : undefined} />
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

function ChestPanel({ chest, busy, onOpen }: { chest: NonNullable<ProfileSummary["hub"]>["weeklyChest"]; busy: boolean; onOpen: () => void }) {
  const played = Math.min(chest.played, chest.goal);
  return (
    <section className={styles.chest} aria-label="Coffre hebdomadaire" data-claimable={chest.claimable ? "" : undefined}>
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
        <span>Parties jouées</span>
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
          <button type="button" className={styles.claimButton} onClick={onOpen} disabled={!chest.claimable || busy}>
            {chest.claimable ? "Ouvrir le coffre" : `Encore ${chest.goal - played}`}
          </button>
        )}
      </div>
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

function MasteriesPanel({ masteries, busy, onClaim }: { masteries: MasteryView[]; busy: boolean; onClaim: (mastery: MasteryView, level: number) => void }) {
  const [start, setStart] = useState(0);
  const visible = masteries.slice(start, start + 3);
  return (
    <section className={`${styles.panel} ${styles.masteries}`} aria-label="Maîtrises">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Maîtrises
          <span className={styles.help} title="Chaque Navire a sa Maîtrise : elle gagne l'XP des parties jouées avec lui.">
            ?
          </span>
        </h2>
      </header>
      <p className={styles.panelSub}>Chaque Navire progresse avec l&apos;XP des parties jouées à son bord.</p>
      <div className={styles.shipRow}>
        {visible.map((mastery) => {
          const claimLevel = mastery.claimableLevels[0];
          return (
            <article key={mastery.shipId} className={styles.ship} data-claimable={claimLevel ? "" : undefined}>
              <span
                className={styles.shipArt}
                style={mastery.illustration ? { backgroundImage: `url("${shipIllustrationUrl(mastery.illustration)}")` } : undefined}
                aria-hidden
              />
              <h3 className={styles.shipName}>{mastery.shipName}</h3>
              <div className={styles.shipLevel}>
                <span className={styles.shipLevelRing}>{mastery.level}</span>
                <span className={styles.shipXp}>
                  <span className={styles.bar}>
                    <span className={styles.barFill} style={{ width: `${mastery.xpForNext ? (mastery.xpInto / mastery.xpForNext) * 100 : 100}%` }} />
                  </span>
                  <span>{mastery.xpForNext ? `${mastery.xpInto} / ${mastery.xpForNext} XP` : "Maîtrise complète"}</span>
                </span>
              </div>
              <span className={styles.shipRewards} title={mastery.nextRewardLevel ? `Niveau ${mastery.nextRewardLevel} : ${mastery.nextReward.map(loginRewardLabel).join(" · ")}` : undefined}>
                {mastery.nextReward.map((item, index) => (
                  <RewardIcon key={index} item={item} size={30} />
                ))}
              </span>
              <button
                type="button"
                className={claimLevel ? styles.claimButton : styles.ghostButton}
                disabled={!claimLevel || busy}
                onClick={() => claimLevel && onClaim(mastery, claimLevel)}
              >
                {claimLevel ? `Réclamer niv. ${claimLevel}` : mastery.nextRewardLevel ? `Niv. ${mastery.nextRewardLevel}` : "Complète"}
              </button>
            </article>
          );
        })}
      </div>
      {masteries.length > 3 && (
        <button
          type="button"
          className={styles.sideArrow}
          aria-label="Autres Navires"
          onClick={() => {
            playButtonClick();
            setStart((value) => (value + 3 >= masteries.length ? 0 : value + 3));
          }}
        >
          ›
        </button>
      )}
    </section>
  );
}

/* ── Commanditaires ────────────────────────────────────────────────── */

function SponsorsPanel({
  sponsors,
  unlocked,
  busy,
  onOpenGift,
}: {
  sponsors: SponsorView[];
  unlocked: boolean;
  busy: boolean;
  onOpenGift: (sponsor: SponsorView) => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? sponsors : sponsors.slice(0, 3);
  return (
    <section className={`${styles.panel} ${styles.sponsors}`} aria-label="Commanditaires">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle}>
          Commanditaires
          <span
            className={styles.help}
            title={`Des personnages de Tidebound remarquent ta manière de jouer. Ils ne s'éveillent qu'à partir du niveau ${SPONSORS_UNLOCK_LEVEL}, et envoient un colis à chaque palier d'intérêt.`}
          >
            ?
          </span>
        </h2>
      </header>
      <p className={styles.panelSub}>Vos exploits attirent l&apos;attention. Certains vous observent.</p>
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
        <ul className={`${styles.rows} ${all ? styles.rowsScroll : ""}`}>
          {shown.map((sponsor) => {
            const gift = sponsor.giftStages.length > 0;
            return (
              <li key={sponsor.id} className={styles.sponsor} data-revealed={sponsor.name ? "" : undefined} title={sponsor.style ?? undefined}>
                <SponsorGlyph id={sponsor.name ? sponsor.id : null} />
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{sponsor.name ?? "Quelqu'un vous observe…"}</span>
                  <span className={styles.sponsorStage}>{sponsor.stageLabel}</span>
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
                  <GiftGlyph />
                  {gift && <span className={styles.alert}>!</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        className={styles.footButton}
        disabled={!unlocked}
        onClick={() => {
          playButtonClick();
          setAll((value) => !value);
        }}
      >
        {all ? "Voir les trois premiers" : "Voir tous les commanditaires"}
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

function GiftGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="1.5" stroke="currentColor" strokeWidth={1.7} />
      <path d="M3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3.2-5-1.2S10 7 12 7zm0 0c1.5-3 5-3.2 5-1.2S14 7 12 7z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Sceau de chaque Commanditaire — un trait simple, dans l'encre du reste. `null` : l'œil de l'inconnu. */
function SponsorGlyph({ id }: { id: SponsorView["id"] | null }) {
  const paths: Record<string, ReactNode> = {
    "compagnie-du-phare": <path d="M10 21h4l-.8-11h-2.4zM9.2 10h5.6L12 5zM3 9l5 1M21 9l-5 1M4 13l4-1M20 13l-4-1" />,
    "veuve-des-profondeurs": <path d="M12 4c-3.3 0-5.5 2.4-5.5 5.2 0 1.8.9 3 2 3.8L6 19M12 4c3.3 0 5.5 2.4 5.5 5.2 0 1.8-.9 3-2 3.8L18 19M10 13l-1 7M14 13l1 7M9.8 9h.01M14.2 9h.01" />,
    "comptoir-des-trois-ancres": <path d="M12 5v15M8 8h8M5 14c0 3.5 3.2 6 7 6s7-2.5 7-6M5 14l-1.5 1.5M19 14l1.5 1.5M12 5a1.6 1.6 0 1 0 0-.01" />,
    "roi-cra-poiscail": <path d="M4 17h16l1-9-5 4-4-6-4 6-5-4zM5 20h14" />,
    "amiral-sans-pavillon": <path d="M8.5 11a3.5 3.5 0 1 1 7 0c0 1.4-.8 2.3-1.5 2.8V16h-4v-2.2c-.7-.5-1.5-1.4-1.5-2.8zM10.5 11h.01M13.5 11h.01M5 19l14-6M5 13l14 6" />,
    "le-collectionneur": <path d="M6 6h9v13H6zM9 3h9v13M8.5 10h4M8.5 13h4" />,
  };
  return (
    <span className={styles.sigil} data-unknown={id ? undefined : ""} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {id ? paths[id] : <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />}
      </svg>
    </span>
  );
}

