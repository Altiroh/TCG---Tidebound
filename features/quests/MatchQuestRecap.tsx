"use client";

import { useEffect, useState } from "react";
import { QUEST_CATEGORY_META } from "@/game/quests";
import { fetchMatchQuestRecap, type QuestRecapEntry } from "@/features/quests/actions";
import { fetchMatchVoyageRecap, type VoyageRecap } from "@/features/quests/voyageActions";
import styles from "@/features/quests/MatchQuestRecap.module.css";
import { playQuestCompleted } from "@/lib/sound";

interface MatchQuestRecapProps {
  /** Partie arbitrée dont on montre le relevé. Absent : rien à montrer (partie locale non persistée). */
  matchId?: string;
  /** Relevé FABRIQUÉ (labo `/game/fin-preview`) : aucune lecture serveur. */
  preview?: QuestRecapEntry[];
  /** Escale de Traversée FABRIQUÉE, pour le même labo. */
  voyagePreview?: VoyageRecap | null;
}

/** Délai avant la première ligne — la fiche Victoire/Défaite a le temps de s'installer. */
const FIRST_DELAY_MS = 900;
/** Écart entre deux lignes : assez pour les lire une à une, pas au point d'attendre. */
const STAGGER_MS = 550;
/** Durée du remplissage d'une jauge (`.fill`, MatchQuestRecap.module.css) : le son tombe quand la jaune touche le bout. */
const FILL_MS = 900;

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
export function MatchQuestRecap({ matchId, preview, voyagePreview }: MatchQuestRecapProps) {
  const [entries, setEntries] = useState<QuestRecapEntry[]>(() => preview ?? []);
  /** L'escale de la Traversée en cours, si la partie l'a fait avancer — elle entre en dernier. */
  const [voyage, setVoyage] = useState<VoyageRecap | null>(() => voyagePreview ?? null);
  /** Nombre de lignes déjà entrées en scène. */
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!matchId || preview) return;
    let cancelled = false;
    void fetchMatchQuestRecap(matchId).then((result) => !cancelled && setEntries(result));
    void fetchMatchVoyageRecap(matchId).then((result) => !cancelled && setVoyage(result));
    return () => {
      cancelled = true;
    };
  }, [matchId, preview]);

  // Une minuterie par ligne, toutes posées d'un coup : plus simple à
  // annuler qu'une chaîne de `setTimeout` qui se relance elle-même, et le
  // rythme ne dérive pas si un rendu tarde.
  const rowCount = entries.length + (voyage ? 1 : 0);

  useEffect(() => {
    if (rowCount === 0) return;
    setShown(0);
    const timers = Array.from({ length: rowCount }, (_, index) =>
      setTimeout(() => setShown((current) => Math.max(current, index + 1)), FIRST_DELAY_MS + index * STAGGER_MS)
    );
    // Un seul son, sur la PREMIÈRE jauge qui arrive au bout : il dure 6 s,
    // deux quêtes finies le superposeraient à lui-même. L'escale bouclée
    // compte comme une quête finie.
    const doneFlags = [...entries.map((entry) => entry.completed), Boolean(voyage?.completedStep)];
    const firstDone = doneFlags.findIndex(Boolean);
    if (firstDone >= 0) timers.push(setTimeout(playQuestCompleted, FIRST_DELAY_MS + firstDone * STAGGER_MS + FILL_MS));
    return () => timers.forEach(clearTimeout);
  }, [entries, voyage, rowCount]);

  if (rowCount === 0) return null;

  const finished = entries.filter((entry) => entry.completed).length;
  const voyageVisible = voyage !== null && shown >= rowCount;

  return (
    <section className={styles.recap} aria-label="Quêtes de la partie">
      <header className={styles.head}>
        <p className={styles.eyebrow}>Quêtes de la partie</p>
        <h3 className={styles.title}>
          {finished > 0
            ? `${finished} quête${finished > 1 ? "s" : ""} terminée${finished > 1 ? "s" : ""}`
            : voyage?.completedStep
              ? `Traversée ${voyage.numeral} : palier ${voyage.tier} atteint`
              : "Tes quêtes avancent"}
        </h3>
      </header>

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

        {/* L'escale de la Traversée, en dernier : c'est la progression
            longue, celle qu'on garde pour la fin. */}
        {voyage && (
          <li className={`${styles.row} ${styles.rowVoyage} ${voyageVisible ? styles.rowIn : ""} ${voyageVisible && voyage.completedStep ? styles.rowDone : ""}`}>
            <span className={styles.voyageMark} aria-hidden>
              {voyage.numeral}
            </span>
            <div className={styles.body}>
              <span className={styles.name}>
                {voyage.stepName} <span className={styles.voyageOf}>· Traversée {voyage.numeral}</span>
              </span>
              <div className={styles.track} role="progressbar" aria-valuenow={voyage.after} aria-valuemin={0} aria-valuemax={voyage.target} aria-label={voyage.stepLabel}>
                <div
                  className={voyage.completedStep ? styles.fillDone : styles.fill}
                  style={{ width: `${Math.min(1, (voyageVisible ? voyage.after : voyage.before) / voyage.target) * 100}%` }}
                />
              </div>
            </div>
            <span className={styles.count}>
              {voyageVisible && voyage.completedStep ? (
                <span className={styles.claimable}>Palier {voyage.tier}</span>
              ) : (
                <>
                  {Math.min(voyageVisible ? voyage.after : voyage.before, voyage.target)} / {voyage.target}
                </>
              )}
            </span>
          </li>
        )}
      </ul>

      {shown >= rowCount && (finished > 0 || voyage?.completedStep) && (
        <p className={styles.foot} role="status">
          À réclamer dans ton journal de bord.
        </p>
      )}
    </section>
  );
}
