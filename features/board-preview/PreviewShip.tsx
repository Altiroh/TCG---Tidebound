import styles from "@/features/board-preview/BoardPreview.module.css";
import {
  SHIP_FRAME_SRC,
  SHIP_ILLUSTRATION_CLIP,
  SHIP_ILLUSTRATION_ZONE,
  shipIllustrationUrl,
} from "@/features/ships/shipFrame";

export interface ShipView {
  /** Nom lisible, pour les lecteurs d'écran uniquement. */
  name: string;
  /** Fichier de `public/assets/ships/illu/` — arche vide si absent. */
  illustration?: string;
  /** Ancrage (pastille rouge). */
  hull: number;
  maxHull: number;
  /** Raison (pastille bleue) — peut être négative (Déraison). */
  reason: number;
  /** Dégâts d'Ancrage que la Déraison infligera en fin de tour (0 = rien à annoncer). */
  deraisonDamage?: number;
}

/**
 * Cadre Navire réel (`ship-frame-empty.webp`, illustration dans l'arche,
 * médaillons Ancrage/Raison sur la plaque), à la place qu'il occupait sur
 * l'ancien board : colonne de gauche, calé sur la hauteur de sa rangée.
 *
 * Même assemblage que `ShipInstrumentCluster`, mais dimensionné en
 * pourcentages du cadre plutôt qu'en pixels : il remplit sa cellule
 * (`height: 100%`, ratio du cadre), c'est la grille qui décide de sa taille.
 * La géométrie de l'arche vient de `features/ships/shipFrame.ts` (aucun
 * import de `@/game`).
 */
export function PreviewShip({ name, illustration, hull, maxHull, reason, deraisonDamage = 0 }: ShipView) {
  return (
    <div className={styles.ship} role="img" aria-label={`${name} — Ancrage ${hull}/${maxHull}, Raison ${reason}`}>
      <div className={styles.shipArt} style={{ ...SHIP_ILLUSTRATION_ZONE, clipPath: SHIP_ILLUSTRATION_CLIP }}>
        {illustration && (
          // eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par la grille
          <img src={shipIllustrationUrl(illustration)} alt="" draggable={false} className={styles.fill} />
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- cadre décoratif */}
      <img src={SHIP_FRAME_SRC} alt="" aria-hidden draggable={false} className={styles.shipFrame} />
      <div className={styles.shipGauges}>
        <span className={styles.shipGauge}>
          {/* eslint-disable-next-line @next/next/no-img-element -- médaillon décoratif */}
          <img src="/assets/ships/gauge-anchor.webp" alt="" aria-hidden draggable={false} className={styles.fill} />
          <span className={styles.shipGaugeValue}>{hull}</span>
        </span>
        <span className={styles.shipGauge}>
          {/* eslint-disable-next-line @next/next/no-img-element -- médaillon décoratif */}
          <img src="/assets/ships/gauge-reason.webp" alt="" aria-hidden draggable={false} className={styles.fill} />
          <span className={styles.shipGaugeValue}>{reason}</span>
        </span>
      </div>
      {/* Dette de Déraison : la conséquence à venir, lisible sans survol (comme `ShipInstrumentCluster`). */}
      {reason < 0 && deraisonDamage > 0 && (
        <span className={styles.shipDebt} title="Déraison : chaque point sous 0 inflige 1 dégât d'Ancrage à la fin du tour si la Raison n'est pas remontée.">
          ⚓ −{deraisonDamage} en fin de tour
        </span>
      )}
    </div>
  );
}
