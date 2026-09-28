"use client";

import { GameScreen } from "@/features/shell/GameScreen";
import type { ScreenHeaderProps } from "@/features/shell/ScreenHeader";
import type { ScreenBackdrop } from "@/features/shell/GameScreen";
import styles from "@/features/shell/GameScreen.module.css";

interface ScreenLoadingProps {
  active: ScreenHeaderProps["active"];
  nav?: ScreenHeaderProps["nav"];
  /** Décor de la page annoncée, quand sa section ne le dit pas (le Profil). */
  backdrop?: ScreenBackdrop;
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
export function ScreenLoading({ active, nav, backdrop }: ScreenLoadingProps) {
  return (
    <GameScreen active={active} nav={nav} backdrop={backdrop}>
      {/* `data-screen-loading` : l'ombre de changement de page attend qu'il ait disparu (`pageReady`). */}
      <div className={styles.loading} role="status" aria-live="polite" data-screen-loading>
        <span className={styles.loadingMark} aria-hidden />
        <span className={styles.loadingLabel}>Chargement…</span>
      </div>
    </GameScreen>
  );
}
