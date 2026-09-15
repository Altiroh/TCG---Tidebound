import styles from "@/features/match/table/Table.module.css";

/**
 * Décors d'angle posés sur le fond, DERRIÈRE le gameplay (jamais cliquables) —
 * les accessoires qui habillaient les coins de l'ancien `board.webp` :
 *   haut droite : cordage, bouée, lanterne et filet (derrière la colonne boussole) ;
 *   bas droite  : gouvernails ;
 *   bas gauche  : lanterne, tonneau, filet et pièces.
 * Chacun est calé sur son coin et dimensionné en hauteur d'écran (`cqh`) ;
 * les mains et les cadres passent devant.
 */
export function DecorLayer() {
  return (
    <div aria-hidden className={styles.decor}>
      {/* eslint-disable-next-line @next/next/no-img-element -- décor fixe */}
      <img src="/assets/board/decor-corner-top-right.webp" alt="" draggable={false} className={`${styles.decorItem} ${styles.decorTopRight}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- décor fixe */}
      <img src="/assets/board/decor-corner-bottom-right.webp" alt="" draggable={false} className={`${styles.decorItem} ${styles.decorBottomRight}`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- décor fixe */}
      <img src="/assets/board/decor-corner-bottom-left.webp" alt="" draggable={false} className={`${styles.decorItem} ${styles.decorBottomLeft}`} />
    </div>
  );
}
