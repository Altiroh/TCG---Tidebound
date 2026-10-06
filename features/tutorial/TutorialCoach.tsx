"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TUTORIAL_STEPS, tutorialAnchor, tutorialProgress, type GameState, type PlayerId } from "@/game";
import { placeCoach, type CoachPlacement } from "@/features/tutorial/coachPlacement";
import { useAnchorRect } from "@/features/tutorial/useAnchorRect";
import styles from "@/features/tutorial/Tutorial.module.css";
import { playButtonClick } from "@/lib/sound";

interface TutorialCoachProps {
  state: GameState;
  playerId: PlayerId;
  /**
   * Rang le plus avancé atteint, tenu par l'écran : il s'en sert aussi
   * pour décider quelles cartes sont jouables. « Compris » et « Passer
   * l'étape » l'incrémentent.
   */
  furthest: number;
  onFurthest: (index: number) => void;
  /** Abandonner le tutoriel en cours — vaut « Passer », donc aucun booster. */
  onSkip: () => void;
  /** Toutes les leçons vues : « Terminer le tutoriel » depuis le bandeau discret. */
  onFinish: () => void;
}

/**
 * Délai avant d'allumer le halo d'une ACTION : une consigne lue et
 * comprise n'a pas besoin qu'on lui tienne la main. Une LEÇON, elle,
 * désigne d'emblée ce dont elle parle — c'est tout son propos.
 */
const ACTION_HINT_DELAY_MS = 3000;

/**
 * Compagnon de bord du tutoriel, posé À CÔTÉ de la zone dont il parle,
 * pendant une vraie partie.
 *
 * - LEÇON : explique ce qu'on voit, halo sur l'élément, « Compris ».
 * - ACTION : se valide toute seule quand le joueur a fait le geste. Si le
 *   geste n'est pas encore possible (tour adverse, aucune unité prête), la
 *   fiche dit ce qu'on attend au lieu de laisser chercher.
 * - Une fois tout vu, la fiche se réduit à un bandeau discret : la partie
 *   se joue jusqu'au bout, et l'on peut terminer le tutoriel à tout moment.
 *
 * Rien ne bloque : on peut jouer pendant une leçon, « Passer l'étape » ou
 * passer le tutoriel entier.
 */
export function TutorialCoach({ state, playerId, furthest, onFurthest, onSkip, onFinish }: TutorialCoachProps) {
  const [flash, setFlash] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [placement, setPlacement] = useState<CoachPlacement | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  const progress = tutorialProgress(state, playerId, furthest);
  const step = progress.step;
  const isLesson = Boolean(step && !step.isDone);
  const waiting = step?.waitingFor?.(state, playerId) ?? null;
  const selector = step ? tutorialAnchor(step, state, playerId) : null;
  const anchorRect = useAnchorRect(selector, Boolean(step) && (isLesson || hinting) && !waiting);

  useEffect(() => setMounted(true), []);

  // Une action faite fait avancer le rang : on le retient, et la fiche pulse.
  useEffect(() => {
    if (progress.index <= furthest) return;
    onFurthest(progress.index);
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(timer);
  }, [progress.index, furthest, onFurthest]);

  // Le compte à rebours du halo repart à CHAQUE étape.
  useEffect(() => {
    setHinting(false);
    if (!step) return;
    const timer = setTimeout(() => setHinting(true), ACTION_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [step?.id, step]);

  // Placement mesuré APRÈS rendu : la hauteur de la fiche dépend du texte.
  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    // Sans zone désignée (leçon générale), la fiche se pose en haut au centre.
    const anchor = anchorRect ?? { left: viewport.width / 2 - 1, top: viewport.height * 0.4, width: 2, height: 2 };
    setPlacement(placeCoach(anchor, { width: panel.width, height: panel.height }, viewport));
    // `mounted` : au tout premier rendu la fiche n'existe pas encore (rien n'est
    // rendu avant le montage) ; sans lui, la mesure ne se refaisait jamais sur
    // une leçon sans ancre, et la fiche restait invisible.
  }, [anchorRect, step?.id, waiting, mounted]);

  if (!mounted) return null;

  // --- Tout est vu : bandeau discret, la partie continue ----------------
  if (progress.complete || !step) {
    return createPortal(
      <aside className={styles.coachMini} aria-label="Tutoriel terminé">
        <span className={styles.coachMiniText}>Leçons terminées — joue jusqu&apos;au bout si tu veux.</span>
        <button
          type="button"
          className={styles.coachMiniButton}
          onClick={() => {
            playButtonClick();
            onFinish();
          }}
        >
          Terminer le tutoriel
        </button>
      </aside>,
      document.body
    );
  }

  const next = () => {
    playButtonClick();
    onFurthest(progress.index + 1);
  };
  const positioned = placement !== null;

  return createPortal(
    <aside
      ref={panelRef}
      className={`${styles.coach} ${flash ? styles.coachDone : ""} ${positioned ? "" : styles.coachMeasuring}`}
      style={positioned ? { left: placement.left, top: placement.top } : undefined}
      data-side={placement?.side}
      aria-label="Guide du tutoriel"
      aria-live="polite"
    >
      <div className={styles.coachHead}>
        <span className={styles.coachStep}>
          {step.chapter} · {progress.doneCount + 1} / {progress.total}
        </span>
      </div>
      <h2 className={styles.coachTitle}>{step.title}</h2>
      <p className={styles.coachInstruction}>{step.instruction}</p>
      {step.detail && <p className={styles.coachDetail}>{step.detail}</p>}
      {waiting && <p className={styles.coachWaiting}>{waiting}</p>}

      <div className={styles.coachTrack} aria-hidden>
        {TUTORIAL_STEPS.map((tutorialStep, index) => (
          <span key={tutorialStep.id} className={index < progress.doneCount ? styles.coachTickDone : styles.coachTick} />
        ))}
      </div>

      <div className={styles.coachActions}>
        {isLesson ? (
          <button type="button" className={styles.coachPrimary} onClick={next}>
            Compris
          </button>
        ) : (
          // Échappatoire : une action impossible ne bloque jamais la suite.
          <button type="button" className={styles.coachGhost} onClick={next}>
            Passer l&apos;étape
          </button>
        )}
        <button type="button" className={styles.coachGhost} onClick={onSkip}>
          Passer le tutoriel
        </button>
      </div>
    </aside>,
    document.body
  );
}
