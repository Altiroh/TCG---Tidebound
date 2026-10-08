"use client";

import type { GamePhase } from "@/game";
import styles from "@/features/match/table/pont/PontActions.module.css";

interface PontActionsProps {
  /** La phase en cours (moteur : principale 1 → combat → principale 2). */
  phase: GamePhase;
  /**
   * Rien ne peut se battre ce tour-ci (`hasCombatToPlay` : tout premier
   * tour, aucune unité prête, Navire qui ne tire pas). Le bouton de combat
   * s'éteint et la Fin de tour s'allume dès la Phase principale 1.
   */
  noCombat?: boolean;
  /** Pas mon tour, ou une fenêtre de réaction ouverte : rien ne se clique. */
  disabled?: boolean;
  /** Passer à la phase suivante (`advancePhase`). */
  onAdvance: () => void;
  /** Terminer le tour (`endTurn`) : dès la Phase de combat — en Phase principale 1, seulement quand rien ne peut se battre. */
  onEndTurn: () => void;
}

const PHASE_PRINCIPALE = "/assets/board/pont/phase-principale.webp";
const PHASE_COMBAT = "/assets/board/pont/phase-combat.webp";
const FIN_DE_TOUR = "/assets/board/pont/fin-de-tour.webp";

/**
 * Le bouton de phase montre la phase SUIVANTE, celle où il mène :
 *   - phase principale 1 → « Phase de combat » (la dague) ;
 *   - phase de combat    → « Phase principale 2 » (la main) ;
 *   - phase principale 2 → la main, éteinte : plus de phase après celle-ci.
 */
function nextPhaseButton(phase: GamePhase): { src: string; label: string; advance: boolean } {
  if (phase === "mainPhase") return { src: PHASE_COMBAT, label: "Passer en phase de combat", advance: true };
  if (phase === "combatPhase") return { src: PHASE_PRINCIPALE, label: "Passer en phase principale 2", advance: true };
  return { src: PHASE_PRINCIPALE, label: "Phase principale 2 — dernière phase du tour", advance: false };
}

/**
 * Commandes du Pont du Capitaine, à droite de la Marée : en haut UN bouton de
 * changement de phase, dessous la FIN DE TOUR, même taille ; puis le bol à
 * dés, posé sur le pont. `data-zone="PhaseActions"` : le tutoriel y pointe
 * (« le bouton à droite »).
 */
export function PontActions({ phase, noCombat = false, disabled = false, onAdvance, onEndTurn }: PontActionsProps) {
  const next = nextPhaseButton(phase);
  // Fin de tour interdite en Phase principale 1, sauf quand rien ne peut se battre.
  const endLocked = phase === "mainPhase" && !noCombat;
  return (
    <div className={styles.actions} data-ui-obstacle="" data-zone="PhaseActions">
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || !next.advance || (noCombat && phase === "mainPhase")}
          aria-label={next.label}
          title={next.label}
          onClick={onAdvance}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
          <img src={next.src} alt="" draggable={false} />
        </button>
        <button
          type="button"
          className={styles.button}
          // Pas de fin de tour en Phase principale 1 (sauf sans rien pour se battre) : passer d'abord en combat.
          disabled={disabled || endLocked}
          aria-label="Fin de tour"
          title={endLocked ? "Fin de tour — passez d'abord en Phase de combat" : "Fin de tour"}
          onClick={onEndTurn}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
          <img src={FIN_DE_TOUR} alt="" draggable={false} />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img src="/assets/board/pont/bol-des.webp" alt="" aria-hidden draggable={false} className={styles.bowl} />
    </div>
  );
}
