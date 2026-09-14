"use client";

import Link from "next/link";
import styles from "@/features/board-preview/BoardPreview.module.css";

interface PreviewHudProps {
  turn: number;
  phaseLabel: string;
  handCount: number;
  /** Facultatif : aucun gameplay derrière ces boutons, ils ne servent qu'au réglage des positions. */
  onPhaseAction?: () => void;
}

/**
 * Calque HUD : boutons et compteurs, au-dessus du gameplay.
 *
 * `pointer-events: none` sur le calque entier, réactivé sur les seules
 * grappes de contrôles (cf. `.hud` / `.hudGroup`) — le calque ne vole donc
 * jamais un clic destiné à une carte.
 *
 * Le padding du calque intègre la safe area (`env(safe-area-inset-*)`) :
 * aucun contrôle ne peut se retrouver derrière une encoche ou une barre
 * système sur un téléphone en paysage.
 *
 * Les contrôles sont volontairement des placeholders inertes : cet écran ne
 * touche à aucun moteur de partie.
 */
export function PreviewHud({ turn, phaseLabel, handCount, onPhaseAction }: PreviewHudProps) {
  return (
    <div className={styles.hud} data-zone="HudLayer">
      <div className={styles.hudLeft}>
        <div className={styles.hudGroup}>
          {/* Seul contrôle réellement fonctionnel de l'écran : le retour au menu. */}
          <Link href="/" className={styles.hudButton}>
            Menu
          </Link>
          <span className={styles.hudChip}>
            Tour <span className={styles.hudChipValue}>{turn}</span>
          </span>
        </div>
      </div>

      <div className={styles.hudRight}>
        <div className={`${styles.hudGroup} ${styles.hudGroupRight}`}>
          <span className={styles.hudChip}>
            Main <span className={styles.hudChipValue}>{handCount}</span>
          </span>
          <button type="button" className={`${styles.hudButton} ${styles.hudButtonPrimary}`} onClick={onPhaseAction}>
            {phaseLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
