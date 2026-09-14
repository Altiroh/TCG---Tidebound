import styles from "@/features/board-preview/BoardPreview.module.css";

interface PreviewShipProps {
  /** Étiquette du placeholder — « PLAYER SHIP » / « ENEMY SHIP » pour l'instant. */
  name: string;
  hull: number;
  maxHull: number;
}

/**
 * Placeholder de navire (joueur comme adversaire) : un bloc au ratio 16:9,
 * plafonné à la hauteur d'un rang de cartes pour ne jamais imposer sa
 * propre hauteur à la zone qui le contient.
 *
 * Le vrai cadre Navire viendra le remplacer ici même : tant que le
 * remplaçant respecte `width: 100%` + un plafond de hauteur, aucune zone
 * n'aura à bouger.
 */
export function PreviewShip({ name, hull, maxHull }: PreviewShipProps) {
  const ratio = maxHull > 0 ? Math.max(0, Math.min(1, hull / maxHull)) : 0;

  return (
    <div className={styles.ship}>
      <span className={styles.shipName}>{name}</span>
      <span className={styles.shipHull}>
        {hull}/{maxHull}
      </span>
      {/* Jauge décorative : masquée en mobile paysage (cf. module CSS), la
          valeur chiffrée au-dessus restant, elle, toujours lisible. */}
      <div className={styles.shipBar}>
        <div className={styles.shipBarFill} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
