"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TUTORIAL_STEPS, tutorialProgress, type GameState, type PlayerId } from "@/game";
import { COACH_GAP, placeCoach, type CoachPlacement } from "@/features/tutorial/coachPlacement";
import { useAnchorRect } from "@/features/tutorial/useAnchorRect";
import styles from "@/features/tutorial/Tutorial.module.css";

interface TutorialCoachProps {
  state: GameState;
  playerId: PlayerId;
  /**
   * Rang le plus avancé atteint, tenu par l'écran : il s'en sert aussi
   * pour décider quelles cartes sont jouables. Deux compteurs séparés
   * finiraient par diverger d'une étape, et le plateau autoriserait alors
   * autre chose que ce que le guide demande.
   */
  furthest: number;
  onFurthest: (index: number) => void;
  /** Abandonner le tutoriel en cours — vaut « Passer », donc aucun booster. */
  onSkip: () => void;
  /** Appelé UNE fois, quand la dernière étape tombe. */
  onComplete: () => void;
}

/**
 * Délai après lequel on montre où cliquer.
 *
 * Le guide ne surligne pas d'emblée : une consigne lue et comprise n'a pas
 * besoin qu'on lui tienne la main, et un halo permanent transforme la
 * partie en rail. Cinq secondes, c'est le temps de lire la consigne et de
 * chercher — au-delà, c'est qu'on ne trouve pas.
 */
const HINT_DELAY_MS = 5000;

/**
 * Compagnon de bord du tutoriel : une fiche posée À CÔTÉ de la zone où le
 * geste se fait, pendant une VRAIE partie, qui se valide toute seule quand
 * le joueur a agi (`tutorialProgress`).
 *
 * Aucun bouton « Suivant », aucune modale : la spec demande une partie
 * jouable, « pas une succession de fenêtres techniques ». Le joueur peut
 * ignorer la consigne, jouer autre chose, se tromper — la fiche attend.
 *
 * L'avancement ne recule jamais : `furthest` retient le rang le plus loin
 * atteint, sinon perdre sa dernière Créature ramènerait la consigne « pose
 * une unité » après coup.
 *
 * Pendant une étape qui demande de poser une carte, le plateau n'autorise
 * que les cartes qui conviennent (`playableHandCards`, posé par l'écran) et
 * le guide DÉSIGNE la première d'entre elles. Sans cette désignation, le
 * joueur essaie les autres, les trouve inertes, et croit à une panne.
 */
export function TutorialCoach({ state, playerId, furthest, onFurthest, onSkip, onComplete }: TutorialCoachProps) {
  const [flash, setFlash] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [placement, setPlacement] = useState<CoachPlacement | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const completed = useRef(false);

  const progress = tutorialProgress(state, playerId, furthest);
  const step = progress.step;

  // Étape qui demande de poser une carte : on désigne LA carte, pas la main
  // entière — « pose une unité » sans montrer laquelle laisse le joueur
  // essayer les autres, qui sont inertes, et croire à un bug.
  const eligible = step?.eligibleHandCards?.(state, playerId) ?? [];
  const focused = eligible[0] ?? null;
  const anchorRect = useAnchorRect(focused ? `[data-hand-card="${focused}"]` : (step?.anchor ?? null));

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (progress.index === furthest) return;
    onFurthest(progress.index);
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timer);
  }, [progress.index, furthest, onFurthest]);

  // Le compte à rebours repart à CHAQUE étape : on n'hérite pas de
  // l'hésitation de la précédente.
  useEffect(() => {
    setHinting(false);
    if (!step) return;
    const timer = setTimeout(() => setHinting(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step?.id, step]);

  // Placement mesuré APRÈS rendu : la fiche a une hauteur variable selon la
  // longueur de la consigne, on ne peut pas la deviner avant de l'avoir.
  useLayoutEffect(() => {
    if (!anchorRect || !panelRef.current) return;
    const panel = panelRef.current.getBoundingClientRect();
    setPlacement(
      placeCoach(anchorRect, { width: panel.width, height: panel.height }, { width: window.innerWidth, height: window.innerHeight })
    );
  }, [anchorRect, step?.id, focused]);

  useEffect(() => {
    if (!progress.complete || completed.current) return;
    completed.current = true;
    onComplete();
  }, [progress.complete, onComplete]);

  if (progress.complete || !step) return null;

  const positioned = placement !== null;
  const card = (
    <aside
      ref={panelRef}
      className={`${styles.coach} ${flash ? styles.coachDone : ""} ${positioned ? "" : styles.coachMeasuring}`}
      style={positioned ? { left: placement.left, top: placement.top } : undefined}
      data-side={placement?.side}
      aria-label="Guide du tutoriel"
    >
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

  // Portail sur le `body` : la fiche est positionnée en coordonnées
  // d'écran, elle ne doit hériter d'aucun conteneur transformé du plateau.
  if (!mounted) return null;

  return createPortal(
    <>
      {/* Halo sur la zone à utiliser. Purement décoratif et sans capture de
          clic : il montre où agir, il ne s'interpose jamais entre le doigt
          et la carte. */}
      {hinting && anchorRect && (
        <div
          aria-hidden
          className={styles.spotlight}
          style={{
            left: anchorRect.left - COACH_GAP / 2,
            top: anchorRect.top - COACH_GAP / 2,
            width: anchorRect.width + COACH_GAP,
            height: anchorRect.height + COACH_GAP,
          }}
        />
      )}
      {card}
    </>,
    document.body
  );
}
