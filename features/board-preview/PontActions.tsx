"use client";

import styles from "@/features/board-preview/PontActions.module.css";

/** Les trois phases d'un tour : principale 1, combat, principale 2. */
export type PontPhase = "main1" | "battle" | "main2";

interface PontActionsProps {
  phase: PontPhase;
  onPhase: (phase: PontPhase) => void;
  onEndTurn: () => void;
}

const PHASE_PRINCIPALE = "/assets/board/pont/phase-principale.webp";
const PHASE_COMBAT = "/assets/board/pont/phase-combat.webp";
const FIN_DE_TOUR = "/assets/board/pont/fin-de-tour.webp";

/**
 * Le bouton de phase montre la phase SUIVANTE, celle où il mène :
 *   - phase principale 1 → « Phase de combat » (la dague) ;
 *   - phase de combat    → « Phase principale » (la main) : on passe en principale 2 ;
 *   - phase principale 2 → la main, éteinte : plus de phase après celle-ci.
 */
const NEXT: Record<PontPhase, { src: string; label: string; to: PontPhase | null }> = {
  main1: { src: PHASE_COMBAT, label: "Passer en phase de combat", to: "battle" },
  battle: { src: PHASE_PRINCIPALE, label: "Passer en phase principale 2", to: "main2" },
  main2: { src: PHASE_PRINCIPALE, label: "Phase principale 2 — dernière phase du tour", to: null },
};

/**
 * Commandes du Pont du Capitaine (labo `/game/pont-preview`), à droite de la
 * Marée : en haut UN bouton de changement de phase, dessous la FIN DE TOUR
 * (toujours possible, quelle que soit la phase), même taille ; puis le bol à
 * dés, posé sur le pont.
 */
export function PontActions({ phase, onPhase, onEndTurn }: PontActionsProps) {
  const next = NEXT[phase];
  return (
    <div className={styles.actions} data-ui-obstacle="">
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.button}
          disabled={next.to === null}
          aria-label={next.label}
          title={next.label}
          onClick={() => next.to && onPhase(next.to)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
          <img src={next.src} alt="" draggable={false} />
        </button>
        <button type="button" className={`${styles.button} ${styles.buttonEnd}`} aria-label="Fin de tour" title="Fin de tour" onClick={onEndTurn}>
          {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
          <img src={FIN_DE_TOUR} alt="" draggable={false} />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img src="/assets/board/pont/bol-des.webp" alt="" aria-hidden draggable={false} className={styles.bowl} />
    </div>
  );
}
