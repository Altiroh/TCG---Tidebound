"use client";

import { useEffect, useState } from "react";
import { QUEST_CATEGORY_META } from "@/game/quests";
import { fetchMatchQuestRecap, type QuestRecapEntry } from "@/features/quests/actions";
import styles from "@/features/quests/MatchQuestRecap.module.css";

interface MatchQuestRecapProps {
  /** Partie arbitrée dont on montre le relevé. Absent : rien à montrer (partie locale non persistée). */
  matchId?: string;
}

/** Délai avant la première ligne — la fiche Victoire/Défaite a le temps de s'installer. */
const FIRST_DELAY_MS = 900;
/** Écart entre deux lignes : assez pour les lire une à une, pas au point d'attendre. */
const STAGGER_MS = 550;

/**
 * Relevé des quêtes sous la fiche de fin de partie.
 *
 * Les lignes arrivent UNE À UNE et leur jauge se remplit de l'avant vers
 * l'après. C'est le seul moment où le joueur voit ce que sa partie a
 * réellement rapporté : hors de là, une quête qui passe de 4 à 7 ne se
 * remarque pas.
 *
 * Les quêtes qui ont seulement AVANCÉ y figurent aussi, pas uniquement
 * celles qui se terminent. Voir une jauge grimper sans se remplir dit qu'on
 * est sur la bonne voie — c'est précisément ce qui donne envie de relancer
 * une partie.
 *
 * Le relevé vient du serveur, figé à l'arbitrage (`fetchMatchQuestRecap`) :
 * il ne bouge plus, même si le joueur réclame une récompense entre-temps.
 */
export function MatchQuestRecap({ matchId }: MatchQuestRecapProps) {
  const [entries, setEntries] = useState<QuestRecapEntry[]>([]);
  /** Nombre de lignes déjà entrées en scène. */
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    void fetchMatchQuestRecap(matchId).then((result) => !cancelled && setEntries(result));
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // Une minuterie par ligne, toutes posées d'un coup : plus simple à
  // annuler qu'une chaîne de `setTimeout` qui se relance elle-même, et le
  // rythme ne dérive pas si un rendu tarde.
  useEffect(() => {
    if (entries.length === 0) return;
    setShown(0);
    const timers = entries.map((_, index) =>
      setTimeout(() => setShown((current) => Math.max(current, index + 1)), FIRST_DELAY_MS + index * STAGGER_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [entries]);

  if (entries.length === 0) return null;

  const finished = entries.filter((entry) => entry.completed).length;

  return (
    <section className={styles.recap} aria-label="Quêtes de la partie">
      <h3 className={styles.title}>
        {finished > 0 ? `${finished} quête${finished > 1 ? "s" : ""} terminée${finished > 1 ? "s" : ""}` : "Progression des quêtes"}
      </h3>

      <ul className={styles.list}>
        {entries.map((entry, index) => {
          const visible = index < shown;
          const meta = QUEST_CATEGORY_META[entry.category];
          // La jauge part de l'AVANT et n'avance qu'une fois la ligne
          // entrée : c'est le remplissage qu'on veut voir, pas un état
          // final déjà là.
          const ratio = (visible ? entry.after : entry.before) / entry.target;

          return (
            <li
              key={entry.code}
              className={`${styles.row} ${visible ? styles.rowIn : ""} ${visible && entry.completed ? styles.rowDone : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
              <img src={meta.icon} alt="" aria-hidden draggable={false} className={styles.icon} />

              <div className={styles.body}>
                <span className={styles.name}>{entry.name}</span>
                <div className={styles.track} role="progressbar" aria-valuenow={entry.after} aria-valuemin={0} aria-valuemax={entry.target}>
                  <div
                    className={entry.completed ? styles.fillDone : styles.fill}
                    style={{ width: `${Math.min(1, ratio) * 100}%` }}
                  />
                </div>
              </div>

              <span className={styles.count}>
                {visible && entry.completed ? (
                  <span className={styles.claimable}>
                    {entry.rewardBoosterId ? "1 booster" : `+${entry.rewardTides} Tides`}
                  </span>
                ) : (
                  <>
                    {Math.min(visible ? entry.after : entry.before, entry.target)} / {entry.target}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {shown >= entries.length && finished > 0 && (
        <p className={styles.foot} role="status">
          À réclamer dans ton journal de bord.
        </p>
      )}
    </section>
  );
}
