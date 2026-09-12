import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";

interface ScreenShellProps {
  children: ReactNode;
}

/**
 * Coquille des écrans hors-partie (Collection, Decks, Éditeur de deck) :
 * trois rangées de grille — header / surface / barre utilitaire — sur le
 * décor marin, et la palette `--cb-*` posée ici pour toute la descendance
 * (cf. `ScreenShell.module.css`).
 *
 * Aucune coordonnée n'est calée sur une résolution donnée : chaque rangée
 * calcule sa propre taille via `clamp()`/`minmax()`.
 */
export function ScreenShell({ children }: ScreenShellProps) {
  return <div className={styles.screen}>{children}</div>;
}
