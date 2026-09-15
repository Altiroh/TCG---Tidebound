import type { CSSProperties, ReactNode } from "react";
import styles from "@/features/shell/ArtPlate.module.css";

interface ArtPlateProps {
  /** Illustration de fond, ou `null` : la plaque se contente alors de son dégradé. */
  artUrl: string | null;
  /** Contenu posé sur la plaque — titre, champ de saisie, métadonnées. */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Le cadre bleuté à tentacules, avec une illustration au fond.
 *
 * Employé partout où une entité du jeu se présente par son image avant de
 * se lire — deck (éditeur, liste, fiche), profil du joueur. L'uniformité
 * est le but : un seul composant, donc un seul endroit à retoucher, et
 * aucune divergence possible entre deux écrans.
 *
 * UNE SEULE taille, volontairement : trois jetons `sm`/`md`/`lg` avaient
 * fini par diverger à chaque retouche — on réduisait l'un en croyant les
 * réduire tous. Un appelant qui a besoin d'autre chose le dit dans sa
 * propre feuille, sur `className`, et c'est visible dans sa revue.
 *
 * Purement présentationnel : QUELLE illustration afficher se décide
 * ailleurs (`features/decks/nameplateArt.ts` pour un deck), jamais ici.
 */
export function ArtPlate({ artUrl, children, className, style }: ArtPlateProps) {
  return (
    <div
      className={`${styles.plate}${className ? ` ${className}` : ""}`}
      data-art={artUrl ? "card" : "none"}
      style={style}
    >
      {artUrl && <span className={styles.art} aria-hidden style={{ backgroundImage: `url("${artUrl}")` }} />}
      {/* Ordre voulu : illustration, tentacules, voile, contenu. Les
          tentacules passent SOUS le voile pour en prendre la teinte. */}
      <span className={styles.tentacles} aria-hidden />
      <span className={styles.veil} aria-hidden />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
