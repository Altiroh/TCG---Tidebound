"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/quests/Quests.module.css";
import { claimQuestReward, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
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
 * Quêtes — sur la coquille commune. Une section par période (quotidiennes,
 * hebdomadaires) avec le temps restant ; une ligne par quête : objectif,
 * progression, récompense, état. Aucune progression n'est calculée ici :
 * elle est écrite par le serveur à la fin de chaque partie arbitrée
 * (`features/matches/matchStore.ts`), et la réclamation est une Server
 * Action autoritaire.
 */
export function QuestsScreen({ board }: QuestsScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGain, setLastGain] = useState<number | null>(null);

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
        setLastGain(result.tidesGained ?? 0);
        startTransition(() => router.refresh());
      })
      .finally(() => setBusyKey(null));
  }

  const hasQuests = board.daily.length + board.weekly.length > 0;
  const claimableCount = [...board.daily, ...board.weekly].filter((entry) => entry.completed && !entry.claimed).length;

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
              <p className={game.muted}>Tes quêtes avancent à chaque partie en ligne ou contre le bot, et rapportent des Tides.</p>
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
              {error && <p className={game.error}>{error}</p>}
              {lastGain !== null && lastGain > 0 && (
                <p className={`${game.success} ${styles.gain}`} role="status">
                  +{lastGain} Tides
                </p>
              )}

              <QuestSection title="Quotidiennes" subtitle={formatRemaining(board.dailyEndsAt)} entries={board.daily} busyKey={isPending ? "*" : busyKey} onClaim={handleClaim} />
              <QuestSection title="Hebdomadaires" subtitle={formatRemaining(board.weeklyEndsAt)} entries={board.weekly} busyKey={isPending ? "*" : busyKey} onClaim={handleClaim} />
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
}

function QuestSection({ title, subtitle, entries, busyKey, onClaim }: QuestSectionProps) {
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

          return (
            <li key={key} className={`${game.panel} ${styles.row} ${claimable ? styles.rowClaimable : ""} ${entry.claimed ? styles.rowClaimed : ""}`}>
              <div className={styles.rowMain}>
                <div className={styles.labelLine}>
                  <span className={styles.label}>{entry.label}</span>
                  {!entry.botProgressAllowed && <span className={game.tagViolet}>PvP uniquement</span>}
                  {entry.fromPreviousPeriod && <span className={game.tag}>Période passée</span>}
                </div>
                <div className={styles.progressLine}>
                  <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={entry.target} aria-valuenow={entry.progress} aria-label={entry.label}>
                    <div className={`${styles.fill} ${entry.completed ? styles.fillDone : ""}`} style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <span className={styles.count}>
                    {Math.min(entry.progress, entry.target)} / {entry.target}
                  </span>
                </div>
              </div>

              <span className={styles.reward}>
                {entry.rewardTides}
                <span className={styles.rewardUnit}>Tides</span>
              </span>

              <div className={styles.action}>
                {entry.claimed ? (
                  <span className={game.tag}>Réclamée</span>
                ) : claimable ? (
                  <button type="button" className={game.primary} onClick={() => onClaim(entry)} disabled={busy}>
                    {busyKey === key ? "…" : "Réclamer"}
                  </button>
                ) : (
                  <span className={game.tagCyan}>En cours</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
