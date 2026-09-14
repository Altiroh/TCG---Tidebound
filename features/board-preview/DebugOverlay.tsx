"use client";

import styles from "@/features/board-preview/BoardPreview.module.css";
import type { BoardPreviewMetrics } from "@/features/board-preview/useBoardPreviewMetrics";

const BREAKPOINT_LABELS: Record<BoardPreviewMetrics["breakpoint"], string> = {
  "mobile-landscape": "Mobile Landscape",
  laptop: "Laptop",
  "desktop-large": "Desktop Large",
};

interface DebugOverlayProps {
  metrics: BoardPreviewMetrics;
  zonesVisible: boolean;
  onToggleZones: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Remet la table dans son état de départ (cartes posées rendues à la main). */
  onReset: () => void;
  /** Passe à l'état de Marée suivant (Calme → Houle → Tempête → Abysses → Calme). */
  onNextTide: () => void;
  tideLabel: string;
}

/**
 * Panneau de debug — EXCLUSIF à `/game/board-preview`, jamais monté par le
 * board réel.
 *
 * Donne les mesures réelles du viewport de jeu (largeur, hauteur, ratio,
 * mode responsive actif) et permet d'afficher les limites de chaque zone :
 * contours + étiquettes colorées, pilotés par `data-debug-zones` sur le
 * viewport (cf. les règles `[data-zone]` du module CSS). C'est l'outil qui
 * doit permettre de voir immédiatement QUELLE boîte se comporte mal.
 *
 * Tenu sur une seule ligne, et repliable : il ne doit jamais masquer le
 * plateau qu'on est justement en train de régler.
 */
export function DebugOverlay({
  metrics,
  zonesVisible,
  onToggleZones,
  collapsed,
  onToggleCollapsed,
  onReset,
  onNextTide,
  tideLabel,
}: DebugOverlayProps) {
  if (collapsed) {
    return (
      <div className={`${styles.debug} ${styles.debugCollapsed}`}>
        <button type="button" className={styles.debugButton} onClick={onToggleCollapsed}>
          Debug
        </button>
      </div>
    );
  }

  return (
    <div className={styles.debug}>
      <span className={styles.debugItem}>
        <span className={styles.debugValue}>
          {metrics.width}×{metrics.height}
        </span>
      </span>
      <span className={styles.debugItem}>
        <span className={styles.debugKey}>Ratio</span>
        <span className={styles.debugValue}>{metrics.ratio.toFixed(2)}</span>
      </span>
      <span className={styles.debugItem}>
        <span className={styles.debugKey}>Mode</span>
        <span className={styles.debugValue}>{BREAKPOINT_LABELS[metrics.breakpoint]}</span>
      </span>
      {metrics.orientation === "portrait" ? (
        // Le jeu vise le paysage : le signaler plutôt que de laisser croire
        // à un bug de layout quand la fenêtre est plus haute que large.
        <span className={styles.debugItem}>
          <span className={styles.debugKey}>Portrait</span>
        </span>
      ) : null}
      <button
        type="button"
        className={`${styles.debugButton} ${zonesVisible ? styles.debugButtonActive : ""}`}
        onClick={onToggleZones}
        aria-pressed={zonesVisible}
      >
        {zonesVisible ? "Masquer les zones" : "Afficher les zones"}
      </button>
      <button type="button" className={styles.debugButton} onClick={onNextTide} title="Marée suivante">
        Marée : {tideLabel} ›
      </button>
      <button type="button" className={styles.debugButton} onClick={onReset}>
        Réinitialiser
      </button>
      <button type="button" className={styles.debugButton} onClick={onToggleCollapsed}>
        Replier
      </button>
    </div>
  );
}
