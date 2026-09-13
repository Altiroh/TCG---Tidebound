"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PaperSurface } from "@/features/shell/PaperSurface";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { ScreenShell } from "@/features/shell/ScreenShell";
import { UtilityBar } from "@/features/shell/UtilityBar";
import shell from "@/features/shell/ScreenShell.module.css";
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
 * Écran Quêtes — même coquille que Collection, Decks et Boosters. Un
 * registre posé sur le papier : une ligne par quête, sa progression à
 * l'encre, et la récompense à réclamer une fois la cible atteinte.
 *
 * Aucune progression n'est calculée ici : elle est écrite par le serveur à
 * la fin de chaque partie arbitrée (`features/matches/matchStore.ts`).
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

  return (
    <ScreenShell>
      <ScreenHeader active="quetes" />

      <PaperSurface>
        <div className={shell.paperScrollFill}>
          {!board.isSignedIn ? (
            <div className={shell.emptyState}>
              <span className={shell.emptyStateTitle}>Connecte-toi pour recevoir des quêtes</span>
              <p>Tes quêtes avancent à chaque partie en ligne ou contre le bot, et rapportent des Tides.</p>
              <Link href="/connexion" className={shell.primaryAction} onClick={() => playButtonClick()}>
                Se connecter
              </Link>
            </div>
          ) : board.unavailable ? (
            <div className={shell.emptyState}>
              <span className={shell.emptyStateTitle}>Quêtes indisponibles pour le moment</span>
              <p>Le serveur n&apos;a pas pu charger tes quêtes. Réessaie dans un instant.</p>
            </div>
          ) : !hasQuests ? (
            <div className={shell.emptyState}>
              <span className={shell.emptyStateTitle}>Aucune quête disponible</span>
              <p>
                Le catalogue de quêtes est vide en base. Applique les migrations Supabase, puis lance{" "}
                <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <div className={styles.ledger}>
              {error && <p className={styles.error}>{error}</p>}
              {lastGain !== null && lastGain > 0 && (
                <p className={styles.gain} role="status">
                  +{lastGain} Tides
                </p>
              )}

              <QuestSection
                title="Quotidiennes"
                subtitle={formatRemaining(board.dailyEndsAt)}
                entries={board.daily}
                busyKey={isPending ? "*" : busyKey}
                onClaim={handleClaim}
              />
              <QuestSection
                title="Hebdomadaires"
                subtitle={formatRemaining(board.weeklyEndsAt)}
                entries={board.weekly}
                busyKey={isPending ? "*" : busyKey}
                onClaim={handleClaim}
              />
            </div>
          )}
        </div>
      </PaperSurface>

      <UtilityBar
        left={
          <Link href="/partie" className={shell.ghostAction} onClick={() => playButtonClick()}>
            Jouer une partie
          </Link>
        }
        right={
          board.isSignedIn ? (
            <Link href="/boosters" className={shell.ghostAction} onClick={() => playButtonClick()}>
              Dépenser mes Tides
            </Link>
          ) : undefined
        }
      />
    </ScreenShell>
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
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionMeta}>{subtitle}</span>
      </header>

      <ul className={styles.list}>
        {entries.map((entry) => {
          const key = `${entry.questId}|${entry.periodKey}`;
          const busy = busyKey === key || busyKey === "*";
          const ratio = Math.min(1, entry.progress / entry.target);
          const claimable = entry.completed && !entry.claimed;

          return (
            <li key={key} className={`${styles.row} ${entry.claimed ? styles.rowClaimed : ""}`}>
              <div className={styles.rowMain}>
                <span className={styles.label}>{entry.label}</span>
                <span className={styles.tags}>
                  {!entry.botProgressAllowed && <span className={styles.tag}>PvP</span>}
                  {entry.fromPreviousPeriod && <span className={styles.tag}>Période passée</span>}
                </span>
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={entry.target}
                  aria-valuenow={entry.progress}
                  aria-label={entry.label}
                >
                  <div className={styles.fill} style={{ width: `${ratio * 100}%` }} />
                </div>
              </div>

              <span className={styles.count}>
                {entry.progress}/{entry.target}
              </span>

              <span className={styles.reward}>
                {entry.rewardTides}
                <span className={styles.rewardUnit}>Tides</span>
              </span>

              <div className={styles.action}>
                {entry.claimed ? (
                  <span className={styles.claimed}>Réclamée</span>
                ) : claimable ? (
                  <button type="button" className={shell.primaryAction} onClick={() => onClaim(entry)} disabled={busy}>
                    {busyKey === key ? "…" : "Réclamer"}
                  </button>
                ) : (
                  <span className={styles.inProgress}>En cours</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
