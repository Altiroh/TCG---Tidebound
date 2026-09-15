import type { CSSProperties, ReactNode } from "react";
import styles from "@/features/shell/ArtPlate.module.css";

export type ArtPlateSize = "sm" | "md" | "lg";

interface ArtPlateProps {
  /** Illustration de fond, ou `null` : la plaque se contente alors de son dégradé. */
  artUrl: string | null;
  size?: ArtPlateSize;
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
 * Purement présentationnel : QUELLE illustration afficher se décide
 * ailleurs (`features/decks/nameplateArt.ts` pour un deck), jamais ici.
 */
export function ArtPlate({ artUrl, size = "md", children, className, style }: ArtPlateProps) {
  return (
    <div
      className={`${styles.plate} ${styles[size]}${className ? ` ${className}` : ""}`}
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
