"use client";

import { useMemo, useState } from "react";
import { QUEST_CATEGORIES, QUEST_CATEGORY_META, type QuestCategory } from "@/game/quests";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/quests/Quests.module.css";
import { claimQuestReward, rerollQuest, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
import { VoyagePanel, VoyageSkeleton } from "@/features/quests/VoyagePanel";
import type { VoyageBoard } from "@/features/quests/voyageActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";

interface QuestJournalProps {
  board: QuestBoard;
  /** Traversées ; `available: false` tant que leur migration n'est pas appliquée — le panneau s'efface. */
  voyages?: VoyageBoard;
  /** Traversées encore en lecture : leur squelette tient la place du panneau. */
  voyagesPending?: boolean;
  /**
   * Relit quêtes et profil après une réclamation ou un remplacement ;
   * `claimed` : la quête qui vient d'être réclamée, à montrer faite tout de suite.
   */
  onChanged: (claimed?: { questId: string; periodKey: string }) => void;
}

function formatRemaining(endsAtIso: string): string {
  const ms = new Date(endsAtIso).getTime() - Date.now();
  if (ms <= 0) return "renouvellement imminent";
  // Arrondi supérieur : « encore 3 jours » tant qu'il reste plus de 2 jours pleins.
  const hours = ms / 3_600_000;
  if (hours > 48) return `encore ${Math.ceil(hours / 24)} jours`;
  if (hours > 1) return `encore ${Math.ceil(hours)} h`;
  return `encore ${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/**
 * JOURNAL DE BORD — la Traversée en cours, puis les quêtes du jour et de la
 * semaine. Il vit dans l'onglet « Quêtes » du profil : plus d'écran à part,
 * tout ce qui se réclame se réclame au même endroit.
 *
 * Organisation par CATÉGORIE (Notion « Catalogue de quêtes — Tidebound ») :
 * Cartes, Parties, Decks, Stats, Marée. Chaque ligne porte l'icône de sa
 * famille — c'est ce qui rend la liste lisible avant même d'en lire le
 * texte — et un filtre permet de ne garder qu'une catégorie.
 *
 * Aucune progression n'est calculée ici : elle est écrite par le serveur à
 * la fin de chaque partie arbitrée (`features/matches/matchStore.ts`), et
 * la réclamation comme le remplacement sont des Server Actions autoritaires.
 */
export function QuestJournal({ board: readBoard, voyages, voyagesPending = false, onChanged }: QuestJournalProps) {
  // Quêtes réclamées depuis la dernière lecture du journal : montrées faites sur-le-champ.
  // Elles valent pour CE journal-là ; le journal relu les remplace.
  const [claimedKeys, setClaimedKeys] = useState<{ board: QuestBoard; keys: ReadonlySet<string> }>({ board: readBoard, keys: new Set() });
  const board = useMemo(() => {
    if (claimedKeys.board !== readBoard || claimedKeys.keys.size === 0) return readBoard;
    const mark = (entries: QuestEntry[]) =>
      entries.map((entry) => (claimedKeys.keys.has(`${entry.questId}|${entry.periodKey}`) ? { ...entry, claimed: true } : entry));
    return { ...readBoard, daily: mark(readBoard.daily), weekly: mark(readBoard.weekly) };
  }, [readBoard, claimedKeys]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGain, setLastGain] = useState<{ tides: number; xp: number } | null>(null);
  const [filter, setFilter] = usePersistedState<QuestCategory | null>("quetes", null, {
    decode: (raw) => oneOf<QuestCategory | null>([null, ...QUEST_CATEGORIES], raw),
  });

  const all = useMemo(() => [...board.daily, ...board.weekly], [board.daily, board.weekly]);
  const presentCategories = useMemo(() => QUEST_CATEGORIES.filter((category) => all.some((entry) => entry.category === category)), [all]);
  const visible = (entries: QuestEntry[]) => (filter ? entries.filter((entry) => entry.category === filter) : entries);

  function handleClaim(entry: QuestEntry) {
    playButtonClick();
    setError(null);
    setLastGain(null);
    const key = `${entry.questId}|${entry.periodKey}`;
    setBusyKey(key);

    void claimQuestReward(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Réclamation impossible.");
          return;
        }
        playRewardClaimed();
        setLastGain({ tides: result.tidesGained ?? 0, xp: result.xpGained ?? 0 });
        // Réclamée : la ligne le montre sans attendre la relecture du journal.
        setClaimedKeys((current) => ({ board: readBoard, keys: new Set([...(current.board === readBoard ? current.keys : []), key]) }));
        notifyProgressionChanged({ quests: 1 });
        onChanged({ questId: entry.questId, periodKey: entry.periodKey });
      })
      .finally(() => setBusyKey(null));
  }

  function handleReroll(entry: QuestEntry) {
    playButtonClick();
    setError(null);
    setLastGain(null);
    const key = `${entry.questId}|${entry.periodKey}`;
    setBusyKey(key);

    void rerollQuest(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Remplacement impossible.");
          return;
        }
        onChanged();
      })
      .finally(() => setBusyKey(null));
  }

  if (board.unavailable) {
    return (
      <div className={styles.journal}>
        {voyagesPending ? <VoyageSkeleton /> : voyages && <VoyagePanel board={voyages} onChanged={onChanged} />}
        <JournalNote title="Journal indisponible pour le moment">Le serveur n&apos;a pas pu charger tes quêtes. Réessaie dans un instant.</JournalNote>
      </div>
    );
  }

  return (
    <div className={styles.journal}>
      {/* La Traversée en tête : c'est la progression longue, celle qu'on
          suit d'une semaine à l'autre. En attendant sa lecture, son
          squelette tient sa place — rien ne saute quand elle arrive. */}
      {voyagesPending ? <VoyageSkeleton /> : voyages && <VoyagePanel board={voyages} onChanged={onChanged} />}

      {all.length === 0 ? (
        <JournalNote title="Aucune quête au registre">
          Le catalogue de quêtes est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
        </JournalNote>
      ) : (
        <>
          <div className={styles.toolbar}>
            {/* Filtres de catégorie. Seules les familles présentes dans les
                quêtes du moment sont proposées : un filtre qui ne montre rien
                n'apprend rien. */}
            {presentCategories.length > 1 && (
              <div className={styles.filters} role="group" aria-label="Catégories de quêtes">
                <button
                  type="button"
                  className={styles.filter}
                  data-active={filter === null || undefined}
                  aria-pressed={filter === null}
                  onClick={() => {
                    playButtonClick();
                    setFilter(null);
                  }}
                >
                  Toutes
                </button>
                {presentCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={styles.filter}
                    data-active={filter === category || undefined}
                    aria-pressed={filter === category}
                    title={QUEST_CATEGORY_META[category].description}
                    onClick={() => {
                      playButtonClick();
                      setFilter(filter === category ? null : category);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
                    <img src={QUEST_CATEGORY_META[category].icon} alt="" aria-hidden className={styles.filterIcon} />
                    {QUEST_CATEGORY_META[category].label}
                  </button>
                ))}
              </div>
            )}

            {error && <p className={`${game.error} ${styles.toolbarNote}`}>{error}</p>}
            {lastGain !== null && (lastGain.tides > 0 || lastGain.xp > 0) && (
              <p className={`${styles.gain} ${styles.toolbarNote}`} role="status">
                {[lastGain.tides > 0 ? `+${lastGain.tides} Tides` : "", lastGain.xp > 0 ? `+${lastGain.xp} XP` : ""].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Deux registres côte à côte sur un écran large : le jour et la
              semaine se lisent ensemble, sans défiler. */}
          <div className={styles.columns}>
            <QuestSection
              title="Quotidiennes"
              subtitle={`${formatRemaining(board.dailyEndsAt)}${board.dailyRerollsLeft > 0 ? ` · ${board.dailyRerollsLeft} remplacement gratuit` : ""}`}
              entries={visible(board.daily)}
              emptyText={filter ? "Aucune quête du jour dans cette catégorie." : "Aucune quête du jour."}
              busyKey={busyKey}
              onClaim={handleClaim}
              onReroll={board.dailyRerollsLeft > 0 ? handleReroll : undefined}
            />
            <QuestSection
              title="Hebdomadaires"
              subtitle={formatRemaining(board.weeklyEndsAt)}
              entries={visible(board.weekly)}
              emptyText={filter ? "Aucune quête de la semaine dans cette catégorie." : "Aucune quête cette semaine."}
              busyKey={busyKey}
              onClaim={handleClaim}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Une note du journal — état vide, indisponible ou erreur — sur parchemin, pas dans un panneau de verre. */
function JournalNote({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`${game.cabinParchment} ${styles.note}`}>
      <p className={`${game.cabinTitle} ${styles.noteTitle}`}>{title}</p>
      <p className={styles.noteText}>{children}</p>
      {action}
    </div>
  );
}

/** Le journal n'a pas pu être lu et rien n'est connu pour le remplacer : on le dit, et on propose de relire. */
export function QuestJournalError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={styles.journal}>
      <JournalNote
        title="Le journal de bord n'a pas pu être lu"
        action={
          <button
            type="button"
            className={`${game.primary} ${styles.noteAction}`}
            onClick={() => {
              playButtonClick();
              onRetry();
            }}
          >
            Réessayer
          </button>
        }
      >
        La liaison avec le port a été coupée. Vérifie ta connexion, puis réessaie.
      </JournalNote>
    </div>
  );
}

/**
 * Le journal en attente de sa première lecture : la Traversée, la barre de
 * filtres et deux registres de lignes, DANS LEUR FORME FINALE (mêmes cadres,
 * mêmes hauteurs). Le vrai journal se pose dessus en fondu, sans saut.
 */
export function QuestJournalSkeleton() {
  const ghost = styles.ghost;
  return (
    <div className={styles.journal} aria-busy="true">
      <p className={styles.srOnly} role="status">
        Chargement du journal de bord…
      </p>
      <VoyageSkeleton />
      <div className={styles.toolbar} aria-hidden>
        <div className={styles.filters}>
          {["Toutes", "Parties", "Cartes", "Marée"].map((label) => (
            <span key={label} className={`${styles.filter} ${styles.skeletonChip}`}>
              <span className={ghost}>{label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className={styles.columns} aria-hidden>
        {[3, 3].map((rows, column) => (
          <section key={column} className={`${game.cabinFrame} ${styles.section}`}>
            <header className={styles.sectionHead}>
              <h2 className={`${game.cabinEyebrow} ${styles.sectionTitle}`}>
                <span className={ghost}>Quotidiennes</span>
              </h2>
              <span className={styles.sectionMeta}>
                <span className={ghost}>encore 9 h</span>
              </span>
            </header>
            <hr className={game.cabinRule} />
            <ul className={styles.list}>
              {Array.from({ length: rows }, (_, index) => (
                <li key={index} className={styles.item}>
                  <div className={`${game.cabinPanel} ${styles.row}`}>
                    <span className={`${styles.categoryMark} ${styles.skeletonMark}`} />
                    <div className={styles.rowMain}>
                      <div className={styles.labelLine}>
                        <span className={styles.label}>
                          <span className={ghost}>Nom de la quête</span>
                        </span>
                      </div>
                      <span className={styles.objective}>
                        <span className={ghost}>Objectif de la quête, en toutes lettres</span>
                      </span>
                      <div className={styles.progressLine}>
                        <div className={styles.track} />
                        <span className={styles.count}>
                          <span className={ghost}>0 / 3</span>
                        </span>
                      </div>
                    </div>
                    <div className={styles.side}>
                      <span className={styles.reward}>
                        <span className={ghost}>35 Tides</span>
                      </span>
                      <span className={styles.rewardXp}>
                        <span className={ghost}>+150 XP</span>
                      </span>
                      <span className={styles.stateOpen}>
                        <span className={ghost}>En cours</span>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

interface QuestSectionProps {
  title: string;
  subtitle: string;
  entries: QuestEntry[];
  /** Ligne montrée quand la période (ou le filtre) ne laisse rien : le registre garde sa place. */
  emptyText: string;
  /** Clé `questId|periodKey` en cours de réclamation, `"*"` pendant un rafraîchissement. */
  busyKey: string | null;
  onClaim: (entry: QuestEntry) => void;
  /** Absent quand le quota de remplacements de la période est épuisé. */
  onReroll?: (entry: QuestEntry) => void;
}

/**
 * Un registre (jour ou semaine) : un cadre riveté, une ligne par quête en
 * panneau sombre à filet d'or. Trois états lisibles d'un coup d'œil : en
 * cours (trait cyan), à réclamer (or qui pulse, toute la ligne encaisse),
 * réclamée (éteinte, coche verte).
 */
function QuestSection({ title, subtitle, entries, emptyText, busyKey, onClaim, onReroll }: QuestSectionProps) {
  return (
    <section className={`${game.cabinFrame} ${styles.section}`} aria-label={title}>
      <header className={styles.sectionHead}>
        <h2 className={`${game.cabinEyebrow} ${styles.sectionTitle}`}>{title}</h2>
        <span className={styles.sectionMeta}>{subtitle}</span>
      </header>
      <hr className={game.cabinRule} />

      {entries.length === 0 ? (
        <p className={styles.sectionEmpty}>{emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => {
            const key = `${entry.questId}|${entry.periodKey}`;
            const busy = busyKey === key || busyKey === "*";
            const ratio = Math.min(1, entry.progress / entry.target);
            const claimable = entry.completed && !entry.claimed;
            const meta = QUEST_CATEGORY_META[entry.category];

            // Terminée : toute la ligne encaisse, comme dans le tiroir. Viser
            // un bouton pour récupérer ce qu'on a déjà gagné est un obstacle
            // de plus, pas une sécurité.
            const Row = claimable ? "button" : "div";

            return (
              <li key={key} className={styles.item}>
                <Row
                  {...(claimable
                    ? {
                        type: "button" as const,
                        onClick: () => onClaim(entry),
                        disabled: busy,
                        "aria-label": `${entry.name || entry.label} — terminée, encaisser ${
                          entry.rewardBoosterId ? "un booster" : `${entry.rewardTides} Tides`
                        }`,
                      }
                    : {})}
                  className={`${game.cabinPanel} ${styles.row} ${claimable ? styles.rowClaimable : ""} ${entry.claimed ? styles.rowClaimed : ""}`}
                >
                  <span className={styles.categoryMark} title={meta.label}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
                    <img src={meta.icon} alt="" aria-hidden draggable={false} className={styles.categoryIcon} />
                  </span>

                  <div className={styles.rowMain}>
                    <div className={styles.labelLine}>
                      <span className={styles.label}>{entry.name || entry.label}</span>
                      <span className={styles.categoryName}>{meta.label}</span>
                      {!entry.botProgressAllowed && <span className={styles.flag}>PvP uniquement</span>}
                      {entry.fromPreviousPeriod && <span className={styles.flag}>Période passée</span>}
                    </div>
                    {/* Le nom occupe la ligne du haut : l'objectif chiffré passe
                        juste en dessous, là où le joueur lit sa progression. */}
                    <span className={styles.objective}>{entry.label}</span>
                    <div className={styles.progressLine}>
                      <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={entry.target} aria-valuenow={entry.progress} aria-label={entry.label}>
                        <div className={`${styles.fill} ${entry.completed ? styles.fillDone : ""}`} style={{ width: `${ratio * 100}%` }} />
                      </div>
                      <span className={styles.count}>
                        {Math.min(entry.progress, entry.target)} / {entry.target}
                      </span>
                    </div>
                  </div>

                  {/* Récompense au-dessus, état en dessous : une colonne
                      étroite, pour que deux registres tiennent côte à côte. */}
                  <div className={styles.side}>
                    <span className={styles.reward}>
                      {entry.rewardBoosterId ? "1" : entry.rewardTides}
                      <span className={styles.rewardUnit}>{entry.rewardBoosterId ? "booster" : "Tides"}</span>
                    </span>
                    {entry.rewardXp > 0 && <span className={styles.rewardXp}>+{entry.rewardXp} XP</span>}
                    {entry.claimed ? (
                      <span className={styles.stateClaimed}>
                        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
                          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Réclamée
                      </span>
                    ) : claimable ? (
                      <span className={styles.claimHint}>{busyKey === key ? "…" : "Encaisser"}</span>
                    ) : (
                      <span className={styles.stateOpen}>En cours</span>
                    )}
                  </div>
                </Row>

                {/* Le remplacement reste un BOUTON À PART, hors de la ligne
                    cliquable : il vit sous elle plutôt que dedans, sinon on ne
                    pourrait plus l'imbriquer dans un bouton — et surtout un
                    clic mal placé remplacerait la quête au lieu de l'encaisser.
                    Réservé aux quêtes du jour non terminées : remplacer une
                    quête finie reviendrait à rejouer sa récompense. */}
                {!claimable && !entry.claimed && onReroll && !entry.fromPreviousPeriod && (
                  <button type="button" className={styles.reroll} onClick={() => onReroll(entry)} disabled={busy} title="Remplacer cette quête par une autre">
                    Remplacer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
