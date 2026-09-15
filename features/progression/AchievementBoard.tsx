"use client";

import { useState } from "react";
import type { ProfileAchievement } from "@/features/progression/profileActions";
import { TideCoin } from "@/features/shell/HeaderPlayer";
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

/**
 * Les exploits en BRANCHES, comme un arbre de progrès : chaque branche se lit
 * de gauche à droite, du premier jalon au plus lointain, reliés par un
 * cordage qui s'allume à mesure qu'on avance.
 */
const BRANCHES: Array<{ id: string; title: string; codes: string[] }> = [
  { id: "voyage", title: "Premières escales", codes: ["tutorial_completed", "first_win", "ten_matches"] },
  { id: "cale", title: "La cale", codes: ["first_booster", "collection_25", "collection_60", "collection_100", "first_abyssal"] },
  { id: "equipage", title: "L'équipage", codes: ["first_precon", "deck_fully_owned"] },
  { id: "phare", title: "Les phares", codes: ["level_10", "level_20", "level_30", "level_40", "level_50"] },
];

interface AchievementBoardProps {
  achievements: readonly ProfileAchievement[];
  /** Réclame les Tides d'un exploit débloqué. */
  onClaim?: (code: string) => void;
  /** Exploit en cours de réclamation. */
  claimingCode?: string | null;
}

/**
 * Exploits — une vitrine à la manière des succès de Minecraft : des tuiles
 * carrées à l'icône peinte, éteintes et cadenassées tant qu'elles ne sont
 * pas obtenues, dorées une fois gagnées. Survoler (ou focaliser) une tuile
 * ouvre sa bulle : nom, condition, récompense.
 *
 * Les exploits sans branche connue (ajoutés au catalogue après coup) ne
 * disparaissent pas : ils tombent dans « Autres ».
 */
export function AchievementBoard({ achievements, onClaim, claimingCode = null }: AchievementBoardProps) {
  const [focused, setFocused] = useState<string | null>(null);
  const byCode = new Map(achievements.map((achievement) => [achievement.code, achievement]));
  const placed = new Set(BRANCHES.flatMap((branch) => branch.codes));
  const others = achievements.filter((achievement) => !placed.has(achievement.code)).map((achievement) => achievement.code);
  const branches = others.length > 0 ? [...BRANCHES, { id: "autres", title: "Autres", codes: others }] : BRANCHES;

  const unlocked = achievements.filter((achievement) => achievement.unlocked).length;
  const ratio = achievements.length > 0 ? unlocked / achievements.length : 0;
  const earnedTides = achievements.filter((achievement) => achievement.unlocked && !achievement.claimable).reduce((sum, achievement) => sum + achievement.rewardTides, 0);
  const toClaim = achievements.filter((achievement) => achievement.claimable).length;

  return (
    <section className={styles.board} aria-label="Exploits">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>Exploits</h2>
          <p className={styles.subtitle}>
            {unlocked} / {achievements.length} obtenus · <TideCoin size={13} /> {earnedTides} Tides gagnés
            {toClaim > 0 && <span className={styles.toClaim}> · 🎁 {toClaim} à réclamer</span>}
          </p>
        </div>
        <div className={styles.progress} role="progressbar" aria-valuenow={unlocked} aria-valuemin={0} aria-valuemax={achievements.length}>
          <span className={styles.progressFill} style={{ width: `${ratio * 100}%` }} />
        </div>
      </header>

      <div className={styles.branches}>
        {branches.map((branch) => {
          const items = branch.codes.map((code) => byCode.get(code)).filter((item): item is ProfileAchievement => item !== undefined);
          if (items.length === 0) return null;
          const done = items.filter((item) => item.unlocked).length;
          return (
            <section key={branch.id} className={styles.branch} aria-label={branch.title}>
              <h3 className={styles.branchTitle}>
                {branch.title}
                <span className={styles.branchCount}>
                  {done}/{items.length}
                </span>
              </h3>
              <ol className={styles.row}>
                {items.map((achievement, index) => {
                  const icon = achievementIconUrl(achievement.code);
                  const previousDone = index === 0 || items[index - 1]!.unlocked;
                  return (
                    <li
                      key={achievement.code}
                      className={styles.cell}
                      data-unlocked={achievement.unlocked ? "true" : "false"}
                      data-claimable={achievement.claimable ? "true" : undefined}
                      data-link={index > 0 ? (achievement.unlocked && previousDone ? "lit" : "dim") : undefined}
                    >
                      <button
                        type="button"
                        className={styles.tile}
                        aria-describedby={`achievement-${achievement.code}`}
                        onMouseEnter={() => setFocused(achievement.code)}
                        onMouseLeave={() => setFocused((current) => (current === achievement.code ? null : current))}
                        onFocus={() => setFocused(achievement.code)}
                        onBlur={() => setFocused((current) => (current === achievement.code ? null : current))}
                        onClick={() => achievement.claimable && onClaim?.(achievement.code)}
                        disabled={claimingCode === achievement.code}
                        aria-label={achievement.claimable ? `${achievement.name} — réclamer ${achievement.rewardTides} Tides` : achievement.name}
                      >
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element -- icône peinte locale
                          <img src={icon} alt="" draggable={false} className={styles.icon} />
                        ) : (
                          <span className={styles.iconFallback} aria-hidden>
                            ★
                          </span>
                        )}
                        {!achievement.unlocked && (
                          <span className={styles.lock} aria-hidden>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                              <rect x="5" y="10.5" width="14" height="10" rx="2" fill="rgba(3,10,16,0.85)" stroke="currentColor" strokeWidth={1.6} />
                              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth={1.6} />
                            </svg>
                          </span>
                        )}
                        {achievement.claimable && (
                          <span className={styles.gift} aria-hidden>
                            🎁
                          </span>
                        )}
                        {achievement.unlocked && !achievement.claimable && (
                          <span className={styles.check} aria-hidden>
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        )}
                      </button>
                      <span className={styles.caption}>{achievement.name}</span>

                      {/* Bulle à la Minecraft : bandeau de titre, puis le détail. */}
                      <span
                        id={`achievement-${achievement.code}`}
                        role="tooltip"
                        className={styles.tooltip}
                        data-open={focused === achievement.code ? "true" : "false"}
                      >
                        <span className={styles.tooltipBar}>
                          {achievement.claimable ? "Touche pour réclamer !" : achievement.unlocked ? "Exploit obtenu !" : "Exploit à décrocher"}
                        </span>
                        <span className={styles.tooltipName}>{achievement.name}</span>
                        <span className={styles.tooltipText}>{achievement.description}</span>
                        <span className={styles.tooltipReward}>
                          <TideCoin size={13} /> +{achievement.rewardTides} Tides
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}
