"use client";

import { useEffect, useRef, useState } from "react";
import { TUTORIAL_STEPS, tutorialProgress, type GameState, type PlayerId } from "@/game";
import styles from "@/features/tutorial/Tutorial.module.css";

interface TutorialCoachProps {
  state: GameState;
  playerId: PlayerId;
  /** Abandonner le tutoriel en cours — vaut « Passer », donc aucun booster. */
  onSkip: () => void;
  /** Appelé UNE fois, quand la dernière étape tombe. */
  onComplete: () => void;
}

/**
 * Compagnon de bord du tutoriel : une fiche posée au bord de l'écran
 * pendant une VRAIE partie, qui dit quoi faire et se valide toute seule
 * quand le joueur l'a fait (`tutorialProgress`).
 *
 * Aucun bouton « Suivant », aucune modale : la spec demande une partie
 * jouable, « pas une succession de fenêtres techniques ». Le joueur peut
 * ignorer la consigne, jouer autre chose, se tromper — la fiche attend.
 *
 * L'avancement ne recule jamais : `furthest` retient le rang le plus loin
 * atteint, sinon perdre sa dernière Créature ramènerait la consigne
 * « pose une Créature » après coup.
 */
export function TutorialCoach({ state, playerId, onSkip, onComplete }: TutorialCoachProps) {
  const [furthest, setFurthest] = useState(0);
  const [flash, setFlash] = useState(false);
  const completed = useRef(false);

  const progress = tutorialProgress(state, playerId, furthest);

  useEffect(() => {
    if (progress.index === furthest) return;
    setFurthest(progress.index);
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timer);
  }, [progress.index, furthest]);

  useEffect(() => {
    if (!progress.complete || completed.current) return;
    completed.current = true;
    onComplete();
  }, [progress.complete, onComplete]);

  if (progress.complete) return null;
  const step = progress.step;
  if (!step) return null;

  return (
    <aside className={`${styles.coach} ${flash ? styles.coachDone : ""}`} aria-label="Guide du tutoriel">
      <div className={styles.coachHead}>
        <span className={styles.coachStep}>
          Étape {progress.doneCount + 1} / {progress.total}
        </span>
      </div>
      <h2 className={styles.coachTitle}>{step.title}</h2>
      <p className={styles.coachInstruction}>{step.instruction}</p>
      {step.detail && <p className={styles.coachDetail}>{step.detail}</p>}

      <div className={styles.coachTrack} aria-hidden>
        {TUTORIAL_STEPS.map((tutorialStep, index) => (
          <span key={tutorialStep.id} className={index < progress.doneCount ? styles.coachTickDone : styles.coachTick} />
        ))}
      </div>

      <div className={styles.coachActions}>
        <button type="button" className={styles.coachGhost} onClick={onSkip}>
          Passer le tutoriel
        </button>
      </div>
    </aside>
  );
}
