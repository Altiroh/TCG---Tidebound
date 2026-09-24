"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
// Import direct du catalogue de quêtes et non de `@/game/quests` : ce tiroir
// est monté par l'en-tête de CHAQUE écran, et le point d'entrée des quêtes
// tire leur calcul de progression — donc tout le catalogue de cartes.
import { QUEST_CATEGORY_META } from "@/game/quests/catalog";
import { claimQuestReward, fetchQuestBoard, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import styles from "@/features/quests/QuestDrawer.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";

interface QuestDrawerProps {
  onClose: () => void;
}

/**
 * Panneau de quêtes glissé depuis la DROITE, ouvert depuis la zone de
 * compte du bandeau.
 *
 * Volontairement ÉPURÉ, et donc différent de l'écran `/quetes` : ici on
 * vient jeter un œil entre deux parties — ce qui compte est « qu'est-ce que
 * je peux réclamer, et où j'en suis ». Les filtres par catégorie, les
 * comptes à rebours de période et les remplacements restent sur l'écran
 * complet, à un lien d'ici. Une copie conforme de l'écran dans un tiroir
 * n'aurait fait que le rendre plus difficile à lire.
 *
 * Les quêtes RÉCLAMABLES remontent en tête : c'est la seule chose qui
 * demande une action, et la faire chercher dans une liste chronologique
 * serait la cacher.
 */
export function QuestDrawer({ onClose }: QuestDrawerProps) {
  const [board, setBoard] = useState<QuestBoard | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Lecture à l'ouverture seulement : le tiroir n'est pas un écran qu'on
  // laisse ouvert, et une relecture en boucle pour un panneau consultatif
  // coûterait plus qu'elle ne rapporte.
  useEffect(() => {
    let cancelled = false;
    fetchQuestBoard()
      .then((result) => !cancelled && setBoard(result))
      .catch((cause) => {
        console.error("[QuestDrawer] Lecture des quêtes impossible :", cause);
        if (!cancelled) setError("Tes quêtes n'ont pas pu être chargées.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Échap ferme, comme tout panneau superposé.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [mounted]);

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
        playRewardClaimed();
        notifyProgressionChanged();
        // Ligne marquée réclamée sur place : recharger tout le panneau pour
        // une case à cocher ferait clignoter la liste entière.
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

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <aside ref={panelRef} className={styles.drawer} role="dialog" aria-label="Quêtes" aria-modal="true" tabIndex={-1}>
        <header className={styles.head}>
          <h2 className={styles.title}>Quêtes</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        {board === null && !error ? (
          // Squelettes de la forme des lignes : le tiroir ne saute pas quand
          // les quêtes arrivent.
          <div aria-busy aria-label="Chargement des quêtes">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeletonRow}>
                <span className={game.skeleton} style={{ width: 28, height: 28 }} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className={game.skeletonText} style={{ width: "60%" }} />
                  <span className={game.skeletonText} style={{ width: "85%" }} />
                </span>
              </div>
            ))}
          </div>
        ) : !board?.isSignedIn ? (
          <p className={styles.muted}>Connecte-toi pour recevoir des quêtes.</p>
        ) : entries.length === 0 ? (
          <p className={styles.muted}>Aucune quête en cours.</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => {
              const key = `${entry.questId}|${entry.periodKey}`;
              const claimable = entry.completed && !entry.claimed;
              const ratio = Math.min(1, entry.progress / entry.target);
              const meta = QUEST_CATEGORY_META[entry.category];

              // Une quête terminée : TOUTE la ligne encaisse. Un petit
              // bouton à viser dans une liste est un obstacle de plus entre
              // le joueur et ce qu'il a déjà gagné.
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
        )}

        {/* L'écran complet garde ce que le tiroir laisse de côté : filtres
            par catégorie, échéances, remplacements. */}
        <Link href="/quetes" className={styles.more} onClick={() => { playButtonClick(); onClose(); }}>
          Journal de bord complet →
        </Link>
      </aside>
    </>,
    document.body
  );
}
