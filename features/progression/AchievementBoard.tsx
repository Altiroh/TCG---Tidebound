"use client";

import { useMemo } from "react";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";
import type { ProfileAchievement } from "@/features/progression/profileActions";
import { TideCoin } from "@/features/shell/GameIcons";
import styles from "@/features/progression/AchievementBoard.module.css";

/** Icône peinte de chaque exploit (`public/assets/exploits/`). */
const ICONS: Record<string, string> = {
  tutorial_completed: "premier-quart",
  first_win: "premier-pavillon",
  first_booster: "premiere-carte-ouverte",
  first_abyssal: "quelque-chose-remonte",
  first_precon: "equipage-recrute",
  deck_fully_owned: "equipage-complete",
  ten_matches: "pris-le-large",
  collection_25: "25-cartes",
  collection_60: "60-cartes",
  collection_100: "100-cartes",
  level_10: "niveau-10",
  level_20: "niveau-20",
  level_30: "niveau-30",
  level_40: "niveau-40",
  level_50: "niveau-50",
};

export function achievementIconUrl(code: string): string | null {
  const icon = ICONS[code];
  return icon ? `/assets/exploits/${icon}.webp` : null;
}

/** Famille de chaque exploit — un repère sur la carte, plus un classement. */
const FAMILIES: Array<{ id: string; label: string; codes: string[] }> = [
  { id: "voyage", label: "Premières escales", codes: ["tutorial_completed", "first_win", "ten_matches"] },
  { id: "cale", label: "La cale", codes: ["first_booster", "collection_25", "collection_60", "collection_100", "first_abyssal"] },
  { id: "equipage", label: "L'équipage", codes: ["first_precon", "deck_fully_owned"] },
  { id: "phare", label: "Les phares", codes: ["level_10", "level_20", "level_30", "level_40", "level_50"] },
];

function familyOf(code: string): { id: string; label: string } {
  return FAMILIES.find((family) => family.codes.includes(code)) ?? { id: "autres", label: "Autres" };
}

/** Part accomplie, de 0 à 1. Un exploit obtenu vaut 1 ; sans compteur connu, 0. */
function ratioOf(achievement: ProfileAchievement): number {
  if (achievement.unlocked) return 1;
  if (!achievement.progress || achievement.progress.target <= 0) return 0;
  return Math.min(1, achievement.progress.current / achievement.progress.target);
}

type Filter = "tous" | "en-cours" | "obtenus";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "tous", label: "Tous" },
  { id: "en-cours", label: "En cours" },
  { id: "obtenus", label: "Obtenus" },
];

interface AchievementBoardProps {
  achievements: readonly ProfileAchievement[];
  /** Réclame les Tides d'un exploit débloqué. */
  onClaim?: (code: string) => void;
  /** Exploit en cours de réclamation. */
  claimingCode?: string | null;
}

/**
 * EXPLOITS — ce qu'on a accompli, et ce qui vient ensuite.
 *
 * Trois paliers de lecture, du plus pressant au plus acquis :
 *   1. À réclamer — l'exploit est obtenu, ses Tides attendent (or, seul
 *      endroit où l'écran brille) ;
 *   2. En cours — triés du plus proche au plus lointain, chacun avec sa
 *      jauge, sa récompense et le titre qu'il débloque ;
 *   3. Obtenus — en grille compacte, le trophée et ce qu'il a rapporté.
 *
 * Grammaire de la coquille (`features/shell/DESIGN.md`) : panneaux bleu
 * nuit, cyan pour la progression, or pour la récompense, vert pour l'acquis.
 */
export function AchievementBoard({ achievements, onClaim, claimingCode = null }: AchievementBoardProps) {
  const [filter, setFilter] = usePersistedState<Filter>("exploits", "tous", {
    decode: (raw) => oneOf(FILTERS.map((option) => option.id), raw),
  });

  const { toClaim, inProgress, done } = useMemo(() => {
    const catalogOrder = new Map(achievements.map((achievement, index) => [achievement.code, index]));
    const byOrder = (a: ProfileAchievement, b: ProfileAchievement) => (catalogOrder.get(a.code) ?? 0) - (catalogOrder.get(b.code) ?? 0);
    return {
      toClaim: achievements.filter((achievement) => achievement.claimable).sort(byOrder),
      // Le plus proche du but d'abord ; à égalité, l'ordre du catalogue (le plus simple avant).
      inProgress: achievements.filter((achievement) => !achievement.unlocked).sort((a, b) => ratioOf(b) - ratioOf(a) || byOrder(a, b)),
      done: achievements.filter((achievement) => achievement.unlocked && !achievement.claimable).sort(byOrder),
    };
  }, [achievements]);

  const unlockedCount = toClaim.length + done.length;
  const total = achievements.length;
  const ratio = total > 0 ? unlockedCount / total : 0;
  const earnedTides = done.reduce((sum, achievement) => sum + achievement.rewardTides, 0);
  const waitingTides = toClaim.reduce((sum, achievement) => sum + achievement.rewardTides, 0);
  const titlesEarned = [...toClaim, ...done].filter((achievement) => achievement.titleName).length;
  const titlesTotal = achievements.filter((achievement) => achievement.titleName).length;

  const showInProgress = filter !== "obtenus";
  const showDone = filter !== "en-cours";

  return (
    <section className={styles.board} aria-label="Exploits">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>Exploits</h2>
          <p className={styles.subtitle}>Des jalons permanents : chacun rapporte des Tides une seule fois, certains débloquent un titre.</p>
        </div>

        <div className={styles.summary}>
          <div className={styles.summaryMain}>
            <span className={styles.summaryValue}>
              {unlockedCount}
              <span className={styles.summaryTotal}> / {total}</span>
            </span>
            <span className={styles.summaryLabel}>obtenus</span>
          </div>
          <div
            className={styles.globalTrack}
            role="progressbar"
            aria-label="Exploits obtenus"
            aria-valuenow={unlockedCount}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <span className={styles.globalFill} style={{ width: `${ratio * 100}%` }} />
          </div>
          <ul className={styles.facts}>
            <li>
              <TideCoin size={13} /> {earnedTides} Tides gagnés
            </li>
            {titlesTotal > 0 && (
              <li>
                {titlesEarned} / {titlesTotal} titres
              </li>
            )}
          </ul>
        </div>
      </header>

      {toClaim.length > 0 && (
        <section className={styles.section} aria-label="À réclamer">
          <h3 className={styles.sectionTitle}>
            À réclamer
            <span className={styles.sectionMeta}>
              {toClaim.length} · <TideCoin size={12} /> {waitingTides} Tides
            </span>
          </h3>
          <ul className={styles.grid}>
            {toClaim.map((achievement) => (
              <li key={achievement.code}>
                <AchievementCard achievement={achievement} onClaim={onClaim} claiming={claimingCode === achievement.code} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.filters} role="tablist" aria-label="Filtrer les exploits">
        {FILTERS.map((entry) => {
          const count = entry.id === "tous" ? total : entry.id === "en-cours" ? inProgress.length : done.length + toClaim.length;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={filter === entry.id}
              className={styles.filter}
              data-active={filter === entry.id ? "true" : undefined}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              <span className={styles.filterCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {showInProgress && inProgress.length > 0 && (
        <section className={styles.section} aria-label="En cours">
          <h3 className={styles.sectionTitle}>
            En cours
            <span className={styles.sectionMeta}>du plus proche au plus lointain</span>
          </h3>
          <ul className={styles.grid}>
            {inProgress.map((achievement) => (
              <li key={achievement.code}>
                <AchievementCard achievement={achievement} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {showDone && done.length > 0 && (
        <section className={styles.section} aria-label="Obtenus">
          <h3 className={styles.sectionTitle}>
            Obtenus
            <span className={styles.sectionMeta}>{done.length}</span>
          </h3>
          <ul className={styles.gridCompact}>
            {done.map((achievement) => (
              <li key={achievement.code}>
                <AchievementCard achievement={achievement} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {showInProgress && !showDone && inProgress.length === 0 && <p className={styles.empty}>Tous les exploits sont obtenus. Bravo, capitaine.</p>}
      {showDone && !showInProgress && unlockedCount === 0 && <p className={styles.empty}>Aucun exploit obtenu pour l&apos;instant : le premier est souvent le tutoriel.</p>}
    </section>
  );
}

interface AchievementCardProps {
  achievement: ProfileAchievement;
  onClaim?: (code: string) => void;
  claiming?: boolean;
  /** Obtenu et réclamé : version resserrée, sans jauge. */
  compact?: boolean;
}

function AchievementCard({ achievement, onClaim, claiming = false, compact = false }: AchievementCardProps) {
  const icon = achievementIconUrl(achievement.code);
  const family = familyOf(achievement.code);
  const state = achievement.claimable ? "claimable" : achievement.unlocked ? "done" : "progress";
  const progress = achievement.progress;
  const ratio = ratioOf(achievement);

  return (
    <article className={styles.card} data-state={state} data-compact={compact ? "true" : undefined}>
      <span className={styles.iconFrame} aria-hidden>
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- icône peinte locale
          <img src={icon} alt="" draggable={false} className={styles.icon} />
        ) : (
          <span className={styles.iconFallback}>★</span>
        )}
        {state === "done" && (
          <span className={styles.check}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>

      <div className={styles.body}>
        <span className={styles.family}>{family.label}</span>
        <h4 className={styles.name}>{achievement.name}</h4>
        <p className={styles.description}>{achievement.description}</p>

        {state === "progress" && progress && (
          <div className={styles.progressRow}>
            <span
              className={styles.track}
              role="progressbar"
              aria-label={`Avancement : ${progress.current} sur ${progress.target}`}
              aria-valuenow={progress.current}
              aria-valuemin={0}
              aria-valuemax={progress.target}
            >
              <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
            </span>
            <span className={styles.count}>
              {progress.target === 1 ? "À faire" : `${progress.current} / ${progress.target}`}
            </span>
          </div>
        )}

        <div className={styles.rewards}>
          <span className={styles.reward} data-state={state}>
            <TideCoin size={12} /> {state === "done" ? `${achievement.rewardTides} Tides reçus` : `+${achievement.rewardTides} Tides`}
          </span>
          {achievement.titleName && (
            <span className={styles.titleReward} data-earned={achievement.unlocked ? "true" : undefined} title="Titre débloqué par cet exploit — à choisir sous ton nom">
              Titre « {achievement.titleName} »
            </span>
          )}
        </div>
      </div>

      {state === "claimable" && (
        <button
          type="button"
          className={styles.claim}
          onClick={() => onClaim?.(achievement.code)}
          disabled={claiming || !onClaim}
          aria-label={`${achievement.name} — réclamer ${achievement.rewardTides} Tides`}
        >
          {claiming ? "…" : "Réclamer"}
        </button>
      )}
    </article>
  );
}
