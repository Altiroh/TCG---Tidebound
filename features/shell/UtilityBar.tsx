import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";

interface UtilityBarProps {
  /** Actions de l'écran (créer, sauvegarder…). */
  left?: ReactNode;
  /** Filtres, ou toute information contextuelle. */
  center?: ReactNode;
  /** Recherche. */
  right?: ReactNode;
}

/**
 * Barre utilitaire basse — volontairement basse et translucide : ce n'est
 * pas une seconde barre de navigation. Un seul filet de laiton la sépare du
 * papier, et aucun de ses composants ne porte de contour propre.
 *
 * Les trois emplacements sont toujours rendus (un `<span/>` vide à défaut)
 * pour que les colonnes de grille restent alignées d'un écran à l'autre :
 * l'action primaire tombe toujours au même endroit, la recherche aussi.
 */
export function UtilityBar({ left, center, right }: UtilityBarProps) {
  return (
    <footer className={styles.toolbar}>
      {left ? <div className={styles.toolbarGroup}>{left}</div> : <span />}
      {center ? <div className={styles.toolbarGroup}>{center}</div> : <span />}
      {right ?? <span />}
    </footer>
  );
}
