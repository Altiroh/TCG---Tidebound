"use client";

import { GameScreen } from "@/features/shell/GameScreen";
import type { ScreenHeaderProps } from "@/features/shell/ScreenHeader";
import styles from "@/features/shell/GameScreen.module.css";

interface ScreenLoadingProps {
  active: ScreenHeaderProps["active"];
  nav?: ScreenHeaderProps["nav"];
}

/**
 * Écran de chargement d'une route (`loading.tsx`).
 *
 * Les pages hors plateau sont rendues côté serveur à chaque visite (session,
 * collection, solde…). Sans cet écran, un clic sur un onglet ne montrait
 * RIEN tant que ce rendu n'était pas revenu : l'ancien écran restait figé,
 * et le jeu paraissait lent même quand le serveur répondait vite.
 *
 * Préchargé avec la route (`router.prefetch`), il s'affiche dès le clic : le
 * bandeau est déjà là, à l'onglet visé, et seul le contenu attend.
 */
export function ScreenLoading({ active, nav }: ScreenLoadingProps) {
  return (
    <GameScreen active={active} nav={nav}>
      <div className={styles.loading} role="status" aria-live="polite">
        <span className={styles.loadingMark} aria-hidden />
        <span className={styles.loadingLabel}>Chargement…</span>
      </div>
    </GameScreen>
  );
}
