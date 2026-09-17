"use client";

import styles from "@/features/decks/DeckBox.module.css";

const ASSETS = {
  box: "/assets/decks/deck-visual.webp",
  logo: "/assets/menu/logo/tidebound-logo.webp",
} as const;

interface DeckBoxProps {
  /** Illustration de la face avant (`nameplateArtUrl` / `plateArtUrl`), `null` = face vide. */
  art: string | null;
  /**
   * Vers où regarde la boîte. `right` : sa tranche est à gauche (l'image
   * telle quelle). `left` : la boîte est retournée, tranche à droite — pour
   * un socle de droite, qui se tourne vers le centre de la scène.
   */
  facing: "left" | "right";
  /** Pastille sur la boîte (« Débloqué »). */
  badge?: string;
  className?: string;
}

/**
 * Une BOÎTE DE DECK (`decks/deck-visual.webp`) : le cadre de laiton vu de
 * trois quarts, l'illustration du deck dans la fenêtre de la face avant —
 * en légère perspective pour épouser le cadre — et le logo en bas de la
 * face, comme sur la référence. Mesures de la fenêtre relevées dans
 * l'image : x 21,6 % → 89,7 %, y 11 % → 87 % ; l'image garde 8,6 % de marge
 * transparente sous la boîte.
 */
export function DeckBox({ art, facing, badge, className }: DeckBoxProps) {
  return (
    <span className={`${styles.box}${className ? ` ${className}` : ""}`} data-facing={facing}>
      <span className={styles.face}>
        <span className={styles.art} style={art ? { backgroundImage: `url("${art}")` } : undefined} />
        {/* eslint-disable-next-line @next/next/no-img-element -- logo local, taille pilotée par la boîte */}
        <img src={ASSETS.logo} alt="" draggable={false} className={styles.logo} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- cadre de la boîte, détouré */}
      <img src={ASSETS.box} alt="" draggable={false} className={styles.frame} />
      {badge && <span className={styles.badge}>{badge}</span>}
    </span>
  );
}
