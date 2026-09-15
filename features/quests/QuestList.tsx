"use client";

import { useEffect, useMemo, useState } from "react";
import { QUEST_CATEGORY_META } from "@/game/quests";
import { claimQuestReward, fetchQuestBoard, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/quests/QuestList.module.css";
import { playButtonClick } from "@/lib/sound";

/**
 * Les quêtes en cours, en liste — sans cadre ni en-tête.
 *
 * Volontairement ÉPURÉE, et donc différente de l'écran `/quetes` : ici on
 * vient jeter un œil entre deux parties — ce qui compte est « qu'est-ce que
 * je peux réclamer, et où j'en suis ». Les filtres par catégorie, les
 * comptes à rebours de période et les remplacements restent sur l'écran
 * complet. Une copie conforme de l'écran n'aurait fait que le rendre plus
 * difficile à lire.
 *
 * Les quêtes RÉCLAMABLES remontent en tête : c'est la seule chose qui
 * demande une action, et la faire chercher dans une liste chronologique
 * serait la cacher.
 *
 * Aucun chrome ici : cette liste vivait dans un tiroir à elle, elle est
 * aujourd'hui une section du panneau du joueur. En la laissant sans cadre,
 * le déplacement n'a rien coûté.
 */
export function QuestList() {
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lecture à l'ouverture seulement : ce panneau n'est pas un écran qu'on
  // laisse ouvert, et une relecture en boucle pour une liste consultative
  // coûterait plus qu'elle ne rapporte.
  useEffect(() => {
    let cancelled = false;
    fetchQuestBoard()
      .then((result) => !cancelled && setBoard(result))
      .catch((cause) => {
        console.error("[QuestList] Lecture des quêtes impossible :", cause);
        if (!cancelled) setError("Tes quêtes n'ont pas pu être chargées.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(() => {
    const all = [...(board?.daily ?? []), ...(board?.weekly ?? [])];
    // Réclamables d'abord, puis en cours, puis réclamées : l'ordre de
    // l'URGENCE, pas celui de la période.
    const rank = (entry: QuestEntry) => (entry.completed && !entry.claimed ? 0 : entry.claimed ? 2 : 1);
    return all.sort((a, b) => rank(a) - rank(b) || b.progress / b.target - a.progress / a.target);
  }, [board]);

  function claim(entry: QuestEntry) {
    playButtonClick();
    setError(null);
    const key = `${entry.questId}|${entry.periodKey}`;
    setBusyKey(key);

    void claimQuestReward(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Réclamation impossible.");
          return;
        }
        notifyProgressionChanged();
        // Ligne marquée réclamée sur place : recharger toute la liste pour
        // une case à cocher la ferait clignoter en entier.
        setBoard((current) =>
          current
            ? {
                ...current,
                daily: current.daily.map((q) => (q.questId === entry.questId ? { ...q, claimed: true } : q)),
                weekly: current.weekly.map((q) => (q.questId === entry.questId ? { ...q, claimed: true } : q)),
              }
            : current
        );
      })
      .finally(() => setBusyKey(null));
  }

  if (error) return <p className={styles.error}>{error}</p>;
  if (board === null) return <p className={styles.muted}>Chargement…</p>;
  if (!board.isSignedIn) return <p className={styles.muted}>Connecte-toi pour recevoir des quêtes.</p>;
  if (entries.length === 0) return <p className={styles.muted}>Aucune quête en cours.</p>;

  return (
    <ul className={styles.list}>
      {entries.map((entry) => {
        const key = `${entry.questId}|${entry.periodKey}`;
        const claimable = entry.completed && !entry.claimed;
        const ratio = Math.min(1, entry.progress / entry.target);
        const meta = QUEST_CATEGORY_META[entry.category];

        // Une quête terminée : TOUTE la ligne encaisse. Un petit bouton à
        // viser dans une liste est un obstacle de plus entre le joueur et
        // ce qu'il a déjà gagné.
        const Row = claimable ? "button" : "div";

        return (
          <li key={key}>
            <Row
              {...(claimable
                ? {
                    type: "button" as const,
                    onClick: () => claim(entry),
                    disabled: busyKey === key,
                    "aria-label": `${entry.name || entry.label} — terminée, encaisser ${
                      entry.rewardBoosterId ? "un booster" : `${entry.rewardTides} Tides`
                    }`,
                  }
                : {})}
              className={`${styles.row} ${claimable ? styles.rowClaimable : ""} ${entry.claimed ? styles.rowClaimed : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
              <img src={meta.icon} alt="" aria-hidden draggable={false} className={styles.icon} />

              <div className={styles.body}>
                <span className={styles.name}>{entry.name || entry.label}</span>
                <span className={styles.objective}>{entry.label}</span>
                <div className={styles.track} role="progressbar" aria-valuenow={entry.progress} aria-valuemin={0} aria-valuemax={entry.target}>
                  <div className={entry.completed ? styles.fillDone : styles.fill} style={{ width: `${ratio * 100}%` }} />
                </div>
              </div>

              <div className={styles.side}>
                <span className={claimable ? styles.rewardReady : styles.reward}>
                  {entry.rewardBoosterId ? "1 booster" : `${entry.rewardTides} Tides`}
                </span>
                {claimable ? (
                  <span className={styles.claimHint}>{busyKey === key ? "…" : "Encaisser"}</span>
                ) : (
                  <span className={styles.count}>
                    {Math.min(entry.progress, entry.target)} / {entry.target}
                  </span>
                )}
              </div>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
