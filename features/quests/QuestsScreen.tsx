"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QUEST_CATEGORIES, QUEST_CATEGORY_META, type QuestCategory } from "@/game/quests";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/quests/Quests.module.css";
import { claimQuestReward, rerollQuest, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick } from "@/lib/sound";

interface QuestsScreenProps {
  board: QuestBoard;
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
 * Quêtes — sur la coquille commune.
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
export function QuestsScreen({ board }: QuestsScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGain, setLastGain] = useState<{ tides: number; xp: number } | null>(null);
  const [filter, setFilter] = useState<QuestCategory | null>(null);

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
        setLastGain({ tides: result.tidesGained ?? 0, xp: result.xpGained ?? 0 });
        notifyProgressionChanged();
        startTransition(() => router.refresh());
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
        startTransition(() => router.refresh());
      })
      .finally(() => setBusyKey(null));
  }

  const hasQuests = all.length > 0;
  const claimableCount = all.filter((entry) => entry.completed && !entry.claimed).length;

  return (
    <GameScreen active="quetes">
      <div className={game.content}>
        <div className={game.contentInner}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Quêtes</p>
              <h1 className={game.title}>{claimableCount > 0 ? `${claimableCount} récompense${claimableCount > 1 ? "s" : ""} à réclamer` : "Journal de bord"}</h1>
            </div>
            {board.isSignedIn && (
              <Link href="/partie" className={game.secondary} onClick={() => playButtonClick()}>
                Jouer une partie
              </Link>
            )}
          </div>

          {!board.isSignedIn ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour recevoir des quêtes</p>
              <p className={game.muted}>Tes quêtes avancent à chaque partie en ligne ou contre le bot, et rapportent des Tides et de l&apos;XP.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : board.unavailable ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Quêtes indisponibles pour le moment</p>
              <p className={game.muted}>Le serveur n&apos;a pas pu charger tes quêtes. Réessaie dans un instant.</p>
            </div>
          ) : !hasQuests ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Aucune quête disponible</p>
              <p className={game.muted}>
                Le catalogue de quêtes est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <>
              {/* Filtres de catégorie. Seules les familles présentes dans les
                  quêtes du moment sont proposées : un filtre qui ne montre
                  rien n'apprend rien. */}
              {presentCategories.length > 1 && (
                <div className={game.chips} role="group" aria-label="Catégories de quêtes">
                  <button
                    type="button"
                    className={filter === null ? game.chipActive : game.chip}
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
                      className={`${filter === category ? game.chipActive : game.chip} ${styles.filterWithIcon}`}
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

              {error && <p className={game.error}>{error}</p>}
              {lastGain !== null && (lastGain.tides > 0 || lastGain.xp > 0) && (
                <p className={`${game.success} ${styles.gain}`} role="status">
                  {[lastGain.tides > 0 ? `+${lastGain.tides} Tides` : "", lastGain.xp > 0 ? `+${lastGain.xp} XP` : ""].filter(Boolean).join(" · ")}
                </p>
              )}

              <QuestSection
                title="Quotidiennes"
                subtitle={`${formatRemaining(board.dailyEndsAt)}${board.dailyRerollsLeft > 0 ? ` · ${board.dailyRerollsLeft} remplacement gratuit` : ""}`}
                entries={visible(board.daily)}
                busyKey={isPending ? "*" : busyKey}
                onClaim={handleClaim}
                onReroll={board.dailyRerollsLeft > 0 ? handleReroll : undefined}
              />
              <QuestSection
                title="Hebdomadaires"
                subtitle={formatRemaining(board.weeklyEndsAt)}
                entries={visible(board.weekly)}
                busyKey={isPending ? "*" : busyKey}
                onClaim={handleClaim}
              />
            </>
          )}
        </div>
      </div>
    </GameScreen>
  );
}

interface QuestSectionProps {
  title: string;
  subtitle: string;
  entries: QuestEntry[];
  /** Clé `questId|periodKey` en cours de réclamation, `"*"` pendant un rafraîchissement. */
  busyKey: string | null;
  onClaim: (entry: QuestEntry) => void;
  /** Absent quand le quota de remplacements de la période est épuisé. */
  onReroll?: (entry: QuestEntry) => void;
}

function QuestSection({ title, subtitle, entries, busyKey, onClaim, onReroll }: QuestSectionProps) {
  if (entries.length === 0) return null;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h2 className={game.sectionTitle}>{title}</h2>
        <span className={game.muted}>{subtitle}</span>
      </header>

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
            <li key={key}>
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
                className={`${game.panel} ${styles.row} ${claimable ? styles.rowClaimable : ""} ${entry.claimed ? styles.rowClaimed : ""}`}
              >
              <div className={styles.rowLead}>
                <span className={styles.categoryMark} title={meta.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
                  <img src={meta.icon} alt="" aria-hidden draggable={false} className={styles.categoryIcon} />
                </span>

                <div className={styles.rowMain}>
                  <div className={styles.labelLine}>
                    <span className={styles.label}>{entry.name || entry.label}</span>
                    <span className={styles.categoryName}>{meta.label}</span>
                    {!entry.botProgressAllowed && <span className={game.tagViolet}>PvP uniquement</span>}
                    {entry.fromPreviousPeriod && <span className={game.tag}>Période passée</span>}
                  </div>
                  {/* Le nom occupe la ligne du haut : l'objectif chiffré passe
                      juste en dessous, là où le joueur lit sa progression. */}
                  <span className={game.muted}>{entry.label}</span>
                  <div className={styles.progressLine}>
                    <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={entry.target} aria-valuenow={entry.progress} aria-label={entry.label}>
                      <div className={`${styles.fill} ${entry.completed ? styles.fillDone : ""}`} style={{ width: `${ratio * 100}%` }} />
                    </div>
                    <span className={styles.count}>
                      {Math.min(entry.progress, entry.target)} / {entry.target}
                    </span>
                  </div>
                </div>
              </div>

              <span className={styles.reward}>
                {entry.rewardBoosterId ? "1" : entry.rewardTides}
                <span className={styles.rewardUnit}>{entry.rewardBoosterId ? "booster" : "Tides"}</span>
                {entry.rewardXp > 0 && <span className={styles.rewardXp}>+{entry.rewardXp} XP</span>}
              </span>

              <div className={styles.action}>
                {entry.claimed ? (
                  <span className={game.tag}>Réclamée</span>
                ) : claimable ? (
                  <span className={styles.claimHint}>{busyKey === key ? "…" : "Encaisser"}</span>
                ) : (
                  <span className={game.tagCyan}>En cours</span>
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
                <button type="button" className={`${game.ghost} ${game.buttonSm} ${styles.reroll}`} onClick={() => onReroll(entry)} disabled={busy} title="Remplacer cette quête">
                  Remplacer
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
