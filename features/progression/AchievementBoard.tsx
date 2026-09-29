"use client";

import { useMemo } from "react";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";
import type { ProfileAchievement } from "@/features/progression/profileActions";
import { TideCoin } from "@/features/shell/GameIcons";
import { ACHIEVEMENT_FAMILIES, isAchievementFamilyId } from "@/game/achievements/families";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/AchievementBoard.module.css";

/**
 * Illustration peinte de chaque exploit (`public/assets/exploits/`, 256 px
 * de côté). Vérifiée image par image le 29/09/2026 : chaque code montre la
 * scène qui lui correspond (le doublon `equipage-recruté.webp`, source
 * 1254 px de la même scène au nom accentué, a été retiré). Les autres —
 * Traversées et les cent exploits de partie — n'ont pas d'illustration
 * dédiée : ils portent l'EMBLÈME DE LEUR FAMILLE, gravé en laiton
 * (`FamilyEmblem`), jamais une image empruntée à un autre exploit.
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

/**
 * Familles : l'en-tête (collant) sous lequel la liste range chaque
 * exploit. La famille est portée par l'exploit lui-même
 * (`AchievementDefinition.family`, `game/achievements/families.ts`) ; une
 * famille inconnue du client (catalogue plus récent que la page) tombe
 * dans « Autres », en fin de liste — l'exploit reste visible.
 */
const OTHER_FAMILY = { id: "autres", label: "Autres" };

function familyOf(achievement: ProfileAchievement): string {
  return isAchievementFamilyId(achievement.family) ? achievement.family : OTHER_FAMILY.id;
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

function passes(filter: Filter, achievement: ProfileAchievement): boolean {
  if (filter === "en-cours") return !achievement.unlocked;
  if (filter === "obtenus") return achievement.unlocked;
  return true;
}

interface FamilyGroup {
  id: string;
  label: string;
  /** Exploits de la famille qui passent le filtre, dans l'ordre du catalogue. */
  shown: ProfileAchievement[];
  /** Compte de la famille entière, quel que soit le filtre. */
  unlocked: number;
  total: number;
}

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
 * Une vitrine pleine largeur en deux étages (29/09/2026, « le scroll doit
 * se faire dans la liste ») :
 *   - l'EN-TÊTE reste en place : titre, médaillon « x / y obtenus », les
 *     filtres et la réglette « À réclamer » (l'or qui pulse, seul endroit
 *     où l'écran brille) — ce qui attend le joueur ne sort jamais de vue ;
 *   - la LISTE, seule, défile : les exploits rangés par famille sous des
 *     en-têtes collants (« La cale · 2 / 5 »), dans l'ordre du catalogue —
 *     une échelle se lit du plus simple au plus rare. Pensée pour la
 *     centaine d'exploits à venir : en pleine largeur, 7 à 10 tuiles par
 *     rangée.
 *
 * Matière cabine : un grand cadre riveté, des tuiles en panneau sombre à
 * filet d'or dont l'illustration peinte occupe toute la largeur — un musée
 * de trophées. Un exploit à décrocher reste lisible, simplement éteint.
 */
export function AchievementBoard({ achievements, onClaim, claimingCode = null }: AchievementBoardProps) {
  const [filter, setFilter] = usePersistedState<Filter>("exploits", "tous", {
    decode: (raw) => oneOf(FILTERS.map((option) => option.id), raw),
  });

  const toClaim = useMemo(() => achievements.filter((achievement) => achievement.claimable), [achievements]);

  const groups = useMemo<FamilyGroup[]>(() => {
    const byFamily = new Map<string, FamilyGroup>();
    for (const family of [...ACHIEVEMENT_FAMILIES, OTHER_FAMILY]) byFamily.set(family.id, { id: family.id, label: family.label, shown: [], unlocked: 0, total: 0 });
    for (const achievement of achievements) {
      const group = byFamily.get(familyOf(achievement))!;
      group.total += 1;
      if (achievement.unlocked) group.unlocked += 1;
      if (passes(filter, achievement)) group.shown.push(achievement);
    }
    return [...byFamily.values()].filter((group) => group.shown.length > 0);
  }, [achievements, filter]);

  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
  const total = achievements.length;
  const ratio = total > 0 ? unlockedCount / total : 0;
  const earnedTides = achievements.filter((achievement) => achievement.unlocked && !achievement.claimable).reduce((sum, achievement) => sum + achievement.rewardTides, 0);
  const waitingTides = toClaim.reduce((sum, achievement) => sum + achievement.rewardTides, 0);
  const titlesEarned = achievements.filter((achievement) => achievement.unlocked && achievement.titleName).length;
  const titlesTotal = achievements.filter((achievement) => achievement.titleName).length;

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

        <div className={styles.toolbar}>
          <div className={styles.filters} role="tablist" aria-label="Filtrer les exploits">
            {FILTERS.map((entry) => {
              const count = entry.id === "tous" ? total : entry.id === "en-cours" ? total - unlockedCount : unlockedCount;
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

          {/* À réclamer : une réglette compacte qui reste en tête — la tuile
              complète, elle, brille aussi à sa place dans la liste. */}
          {toClaim.length > 0 && (
            <section className={styles.claimStrip} aria-label="À réclamer">
              <h3 className={styles.claimHead}>
                <span className={`${game.cabinEyebrow} ${styles.claimName}`}>À réclamer</span>
                <span className={styles.claimMeta}>
                  <TideCoin size={12} /> {waitingTides}
                </span>
              </h3>
              <ul className={styles.claimList}>
                {toClaim.map((achievement) => (
                  <li key={achievement.code}>
                    <ClaimChip achievement={achievement} onClaim={onClaim} claiming={claimingCode === achievement.code} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </header>

      <hr className={`${game.cabinRule} ${styles.rule}`} />

      {/* La liste : seul étage qui défile. */}
      <div className={styles.scroller}>
        {groups.map((group) => (
          <section key={group.id} className={styles.family} aria-label={group.label}>
            <h3 className={styles.familyHead}>
              <span className={`${game.cabinEyebrow} ${styles.familyName}`}>{group.label}</span>
              <span className={styles.familyCount}>
                {group.unlocked} / {group.total}
              </span>
            </h3>
            <ul className={styles.grid}>
              {group.shown.map((achievement) => (
                <li key={achievement.code}>
                  <AchievementCard achievement={achievement} onClaim={onClaim} claiming={claimingCode === achievement.code} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {filter === "en-cours" && groups.length === 0 && <p className={styles.empty}>Tous les exploits sont obtenus. Bravo, capitaine.</p>}
        {filter === "obtenus" && groups.length === 0 && <p className={styles.empty}>Aucun exploit obtenu pour l&apos;instant : le premier est souvent le tutoriel.</p>}
      </div>
    </section>
  );
}

interface ClaimChipProps {
  achievement: ProfileAchievement;
  onClaim?: (code: string) => void;
  claiming?: boolean;
}

/** Un exploit à réclamer, en une ligne : vignette, nom, Tides, bouton. */
function ClaimChip({ achievement, onClaim, claiming = false }: ClaimChipProps) {
  const icon = achievementIconUrl(achievement.code);
  return (
    <div className={`${game.cabinPanel} ${styles.claimChip}`}>
      <span className={styles.claimThumb} aria-hidden>
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- illustration peinte locale
          <img src={icon} alt="" draggable={false} />
        ) : (
          <FamilyEmblem family={achievement.family} />
        )}
      </span>
      <span className={styles.claimText}>
        <span className={styles.claimTitle}>{achievement.name}</span>
        <span className={styles.claimReward}>
          <TideCoin size={11} /> +{achievement.rewardTides}
        </span>
      </span>
      <button
        type="button"
        className={`${game.primary} ${styles.claimButton}`}
        onClick={() => onClaim?.(achievement.code)}
        disabled={claiming || !onClaim}
        aria-label={`${achievement.name} — réclamer ${achievement.rewardTides} Tides`}
      >
        {claiming ? "…" : "Réclamer"}
      </button>
    </div>
  );
}

interface AchievementCardProps {
  achievement: ProfileAchievement;
  onClaim?: (code: string) => void;
  claiming?: boolean;
}

/**
 * Emblème d'un exploit sans illustration : un motif de laiton par famille,
 * dans l'esprit de la rose des vents des Traversées (qui reste l'emblème
 * par défaut). Des tracés simples en `currentColor` : la tuile éteinte les
 * atténue d'elle-même, comme elle éteint une illustration.
 */
function FamilyEmblem({ family }: { family: string }) {
  return (
    <svg viewBox="0 0 64 64" className={styles.emblem} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="28" strokeWidth="1.2" opacity="0.5" />
      {EMBLEMS[family] ?? EMBLEMS.voyage}
    </svg>
  );
}

const COMPASS = (
  <>
    <circle cx="32" cy="32" r="19" strokeWidth="0.8" opacity="0.4" />
    <path d="M32 8 L36 28 L32 32 L28 28 Z M32 56 L28 36 L32 32 L36 36 Z" fill="currentColor" stroke="none" />
    <path d="M8 32 L28 28 L32 32 L28 36 Z M56 32 L36 36 L32 32 L36 28 Z" fill="currentColor" stroke="none" opacity="0.7" />
    <circle cx="32" cy="32" r="2.5" fill="currentColor" stroke="none" />
  </>
);

const EMBLEMS: Record<string, React.ReactNode> = {
  voyage: COMPASS,
  traversees: COMPASS,
  // Coffre de cale.
  cale: (
    <>
      <path d="M16 28 h32 v18 h-32 Z" />
      <path d="M16 28 c0 -10 32 -10 32 0" />
      <path d="M16 34 h32 M30 32 h4 v6 h-4 Z" />
    </>
  ),
  // Barre à roue.
  equipage: (
    <>
      <circle cx="32" cy="32" r="11" />
      <circle cx="32" cy="32" r="3" fill="currentColor" stroke="none" />
      <path d="M32 12 v40 M12 32 h40 M18 18 l28 28 M46 18 l-28 28" />
    </>
  ),
  // Phare et son faisceau.
  phare: (
    <>
      <path d="M27 50 l2 -24 h6 l2 24 Z M26 26 h12 M29 26 v-5 h6 v5 M32 21 v-3" />
      <path d="M38 22 l14 -5 M38 24 l14 5 M26 22 l-14 -5 M26 24 l-14 5" opacity="0.6" />
      <path d="M20 50 h24" />
    </>
  ),
  // Sabres croisés.
  combat: (
    <>
      <path d="M18 46 l26 -28 M46 46 l-26 -28" strokeWidth="2.4" />
      <path d="M14 42 l8 8 M50 42 l-8 8" />
      <path d="M44 18 l4 -4 M20 18 l-4 -4" />
    </>
  ),
  // Étoile de record.
  records: <path d="M32 13 l5.6 12.2 13.4 1.4 -10 9 2.8 13.2 -11.8 -6.8 -11.8 6.8 2.8 -13.2 -10 -9 13.4 -1.4 Z" />,
  // Trois lames.
  maree: (
    <>
      <path d="M12 26 c5 -5 10 -5 14 0 s9 5 14 0 s10 -5 14 0" />
      <path d="M12 34 c5 -5 10 -5 14 0 s9 5 14 0 s10 -5 14 0" opacity="0.8" />
      <path d="M12 42 c5 -5 10 -5 14 0 s9 5 14 0 s10 -5 14 0" opacity="0.6" />
    </>
  ),
  // Spirale du vertige.
  deraison: <path d="M32 32 c0 -3 4 -3 4 0 c0 5 -8 5 -8 0 c0 -8 12 -8 12 0 c0 11 -16 11 -16 0 c0 -14 20 -14 20 0 c0 17 -24 17 -24 0" />,
  // Fiole brisée : l'Objet qu'on casse.
  bris: (
    <>
      <path d="M28 14 h8 M29 14 v8 l-9 12 v14 h24 v-14 l-9 -12 v-8" />
      <path d="M20 38 l7 3 4 -5 5 6 8 -4" />
      <path d="M48 16 l4 -4 M50 24 h6 M42 12 v-5" opacity="0.7" />
    </>
  ),
  // Ancre.
  navire: (
    <>
      <circle cx="32" cy="16" r="4" />
      <path d="M32 20 v30 M24 27 h16" />
      <path d="M16 38 c2 10 10 13 16 12 c6 1 14 -2 16 -12" />
      <path d="M13 41 l3 -4 4 3 M51 41 l-3 -4 -4 3" />
    </>
  ),
  // Trident.
  fatal: (
    <>
      <path d="M32 14 v38" />
      <path d="M20 16 v10 c0 6 24 6 24 0 v-10" />
      <path d="M17 19 l3 -5 3 5 M29 17 l3 -5 3 5 M41 19 l3 -5 3 5" />
    </>
  ),
};

/** Voile d'un exploit caché : un point d'interrogation dans la brume. */
function MaskedEmblem() {
  return (
    <svg viewBox="0 0 64 64" className={styles.emblem} aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="32" cy="32" r="28" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.6" />
      <path d="M24 25 c0 -6 4 -9 8 -9 s8 3 8 8 c0 6 -8 7 -8 13 v2" />
      <circle cx="32" cy="47" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AchievementCard({ achievement, onClaim, claiming = false }: AchievementCardProps) {
  if (achievement.masked) return <MaskedCard />;
  const icon = achievementIconUrl(achievement.code);
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
          <FamilyEmblem family={achievement.family} />
        )}
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
        <p className={styles.description} title={achievement.description}>{achievement.description}</p>

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

/**
 * Exploit caché, pas encore obtenu : une tuile voilée, sans nom ni
 * condition — le serveur ne les a de toute façon pas envoyés. Seule
 * l'invite dit qu'il y a quelque chose à trouver.
 */
function MaskedCard() {
  return (
    <article className={`${game.cabinPanel} ${styles.card}`} data-state="masked" aria-label="Exploit caché">
      <span className={styles.art} aria-hidden>
        <MaskedEmblem />
      </span>
      <div className={styles.body}>
        <h4 className={styles.name}>Exploit caché</h4>
        <p className={styles.description}>Quelque chose dort sous la surface…</p>
      </div>
    </article>
  );
}
