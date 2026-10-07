"use client";

import styles from "@/features/board-preview/PontActions.module.css";

export type PontPhase = "main" | "battle";

interface PontActionsProps {
  phase: PontPhase;
  onPhase: (phase: PontPhase) => void;
  onEndTurn: () => void;
}

const BUTTONS = {
  main: { src: "/assets/board/pont/phase-principale.webp", label: "Phase principale" },
  battle: { src: "/assets/board/pont/phase-combat.webp", label: "Phase de combat" },
  end: { src: "/assets/board/pont/fin-de-tour.webp", label: "Fin de tour" },
};

/**
 * Commandes du Pont du Capitaine (labo `/game/pont-preview`, 07/10/2026), à
 * droite de la Marée, comme sur la maquette : en haut le CHANGEMENT DE PHASE
 * (principale · combat — la phase en cours est allumée), dessous la FIN DE
 * TOUR ; puis le bol à dés, posé sur le pont.
 */
export function PontActions({ phase, onPhase, onEndTurn }: PontActionsProps) {
  return (
    <div className={styles.actions} data-ui-obstacle="">
      <div className={styles.buttons}>
        <div className={styles.phases} role="group" aria-label="Changement de phase">
          {(["main", "battle"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.button} ${phase === id ? styles.buttonOn : ""}`}
              aria-pressed={phase === id}
              aria-label={BUTTONS[id].label}
              title={BUTTONS[id].label}
              onClick={() => onPhase(id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
              <img src={BUTTONS[id].src} alt="" draggable={false} />
            </button>
          ))}
        </div>
        <button type="button" className={`${styles.button} ${styles.buttonEnd}`} aria-label={BUTTONS.end.label} title={BUTTONS.end.label} onClick={onEndTurn}>
          {/* eslint-disable-next-line @next/next/no-img-element -- bouton peint */}
          <img src={BUTTONS.end.src} alt="" draggable={false} />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img src="/assets/board/pont/bol-des.webp" alt="" aria-hidden draggable={false} className={styles.bowl} />
    </div>
  );
}
