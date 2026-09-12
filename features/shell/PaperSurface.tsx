import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";

interface PaperSurfaceProps {
  children: ReactNode;
}

/**
 * Surface de travail des trois écrans — plus un « grand panneau ». Le cadre
 * laiton et ses quatre rivets symétriques n'existent pas : le papier
 * (`.parchment`) occupe toute la zone et se dissout dans le bleu nuit en
 * haut et en bas via un masque, ses flancs recevant une simple ombre
 * douce. Il ne reste du métal que quelques détails ASYMÉTRIQUES
 * (`.parchmentDetails`) — une équerre dans un coin, un rivet isolé, des
 * marques d'usure — qui donnent la matérialité sans refermer une fenêtre
 * autour du contenu.
 *
 * Le conteneur sert d'ancre `position:relative` aux contrôles d'encre
 * (`.inkControl`) posés dessus — jamais l'écran entier.
 */
export function PaperSurface({ children }: PaperSurfaceProps) {
  return (
    <div className={styles.surface}>
      <div className={styles.parchment} aria-hidden />

      <div className={styles.parchmentDetails} aria-hidden>
        <span className={styles.cornerBracket} />
        <span className={styles.saltStain} />
        <span className={styles.saltStainSmall} />
        <span className={styles.scuff} />
        <span className={styles.rivet} />

        <svg className={styles.compassRose} viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth={0.8} />
          <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth={0.4} />
          <path d="M50 6L50 94M6 50L94 50M18 18L82 82M82 18L18 82" stroke="currentColor" strokeWidth={0.5} />
          <path d="M50 12L56 50L50 88L44 50Z" fill="currentColor" opacity={0.6} />
          <path d="M12 50L50 44L88 50L50 56Z" fill="currentColor" opacity={0.6} />
        </svg>
      </div>

      {children}
    </div>
  );
}
