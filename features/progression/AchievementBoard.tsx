"use client";

import { useMemo } from "react";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";
import type { ProfileAchievement } from "@/features/progression/profileActions";
import { TideCoin } from "@/features/shell/GameIcons";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/AchievementBoard.module.css";

/**
 * Illustration peinte de chaque exploit (`public/assets/exploits/`, 256 px
 * de côté). Vérifiée image par image le 29/09/2026 : chaque code montre la
 * scène qui lui correspond (le doublon `equipage-recruté.webp`, source
 * 1254 px de la même scène au nom accentué, a été retiré). Les trois exploits de Traversée
 * (`voyage_*`) n'ont pas encore d'illustration : ils portent l'emblème de
 * repli (rose des vents de laiton), pas une image empruntée à un autre.
 */
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
  { id: "traversees", label: "Traversées", codes: ["voyage_premier_quart", "voyage_eaux_troubles", "voyage_grand_fond"] },
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
 *   1. À réclamer — l'exploit est obtenu, ses Tides attendent (or qui
 *      pulse, seul endroit où l'écran brille) ;
 *   2. En cours — triés du plus proche au plus lointain, chacun avec sa
 *      jauge, sa récompense et le titre qu'il débloque ;
 *   3. Obtenus — le trophée en couleurs, une coche verte discrète.
 *
 * Matière cabine (29/09/2026, « pas le bon visuel ») : un grand cadre
 * riveté, des tuiles en panneau sombre à filet d'or dont l'illustration
 * peinte occupe toute la largeur — un musée de trophées, pas une liste de
 * vignettes. Un exploit à décrocher reste lisible, simplement éteint.
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
    <section className={`${game.cabinFrame} ${styles.board}`} aria-label="Exploits">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={`${game.cabinTitle} ${styles.title}`}>Exploits</h2>
          <p className={styles.subtitle}>Des jalons permanents : chacun rapporte des Tides une seule fois, certains débloquent un titre.</p>
        </div>

        {/* Le compteur en médaillon de laiton — le même que le niveau sur la
            route des paliers — cerclé d'un anneau qui se remplit. */}
        <div className={styles.summary}>
          <div
            className={styles.medallion}
            style={{ "--ratio": ratio } as React.CSSProperties}
            role="progressbar"
            aria-label="Exploits obtenus"
            aria-valuenow={unlockedCount}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <span className={styles.medallionFace}>
              <span className={styles.medallionValue}>{unlockedCount}</span>
              <span className={styles.medallionTotal}>/ {total}</span>
            </span>
          </div>
          <div className={styles.summaryText}>
            <span className={styles.summaryLabel}>{unlockedCount > 1 ? "obtenus" : "obtenu"}</span>
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
        </div>
      </header>

      <hr className={game.cabinRule} />

      {toClaim.length > 0 && (
        <section className={styles.section} aria-label="À réclamer">
          <h3 className={styles.sectionTitle}>
            <span className={`${game.cabinEyebrow} ${styles.sectionName}`}>À réclamer</span>
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
            <span className={`${game.cabinEyebrow} ${styles.sectionName}`}>En cours</span>
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
            <span className={`${game.cabinEyebrow} ${styles.sectionName}`}>Obtenus</span>
            <span className={styles.sectionMeta}>{done.length}</span>
          </h3>
          <ul className={styles.grid}>
            {done.map((achievement) => (
              <li key={achievement.code}>
                <AchievementCard achievement={achievement} />
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
}

/** Emblème de repli d'un exploit sans illustration : une rose des vents de laiton. */
function CompassEmblem() {
  return (
    <svg viewBox="0 0 64 64" className={styles.emblem} aria-hidden>
      <circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <path d="M32 6 L36 28 L32 32 L28 28 Z M32 58 L28 36 L32 32 L36 36 Z" fill="currentColor" />
      <path d="M6 32 L28 28 L32 32 L28 36 Z M58 32 L36 36 L32 32 L36 28 Z" fill="currentColor" opacity="0.7" />
      <circle cx="32" cy="32" r="2.5" fill="currentColor" />
    </svg>
  );
}

function AchievementCard({ achievement, onClaim, claiming = false }: AchievementCardProps) {
  const icon = achievementIconUrl(achievement.code);
  const family = familyOf(achievement.code);
  const state = achievement.claimable ? "claimable" : achievement.unlocked ? "done" : "progress";
  const progress = achievement.progress;
  const ratio = ratioOf(achievement);

  return (
    <article className={`${game.cabinPanel} ${styles.card}`} data-state={state}>
      <span className={styles.art} aria-hidden>
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- illustration peinte locale
          <img src={icon} alt="" draggable={false} className={styles.artImage} />
        ) : (
          <CompassEmblem />
        )}
        <span className={styles.family}>{family.label}</span>
        {state === "done" && (
          <span className={styles.check} title="Obtenu">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </span>

      <div className={styles.body}>
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
            <span className={styles.count}>{progress.target === 1 ? "À faire" : `${progress.current} / ${progress.target}`}</span>
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

        {state === "claimable" && (
          <button
            type="button"
            className={`${game.primary} ${styles.claim}`}
            onClick={() => onClaim?.(achievement.code)}
            disabled={claiming || !onClaim}
            aria-label={`${achievement.name} — réclamer ${achievement.rewardTides} Tides`}
          >
            {claiming ? "…" : "Réclamer"}
          </button>
        )}
      </div>
    </article>
  );
}
