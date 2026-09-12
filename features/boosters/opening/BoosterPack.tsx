"use client";

import { memo } from "react";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
import { BOOSTER_OPENING_ASSETS } from "@/features/boosters/opening/boosterOpeningAssets";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";

interface BoosterPackProps {
  /** Le paquet a été découpé : pièces ouvertes visibles, morceau supérieur en vol. */
  torn: boolean;
  /** Toutes les cartes sont sorties : le sachet vide s'efface. */
  retreating: boolean;
}

/**
 * Le sachet. Sa boîte a les proportions EXACTES de `defaut-open-bottom.png`
 * (le corps ouvert, qui ne bouge jamais) ; le paquet fermé et la bande
 * arrachée sont positionnés en pourcentages de cette boîte, donc restent
 * alignés à toutes les tailles d'écran (cf. `.packClosed` / `.packTop`).
 *
 * Les attributs `data-*` pilotent des animations CSS qui ne redémarrent pas
 * quand la phase de la scène change : elles ne dépendent que de `torn` et
 * `retreating`, qui ne repassent jamais à `false`.
 */
export const BoosterPack = memo(function BoosterPack({ torn, retreating }: BoosterPackProps) {
  return (
    <div className={styles.packAnchor} data-retreat={retreating || undefined} aria-hidden>
      <div className={styles.packMotion}>
        <div className={styles.packFloat} data-torn={torn || undefined}>
          <span className={styles.packShadow} />

          <span className={styles.packOpenLayer}>
            {/* eslint-disable-next-line @next/next/no-img-element -- asset préchargé et décodé, animé en transform */}
            <img className={styles.packBottom} src={BOOSTER_OPENING_ASSETS.packOpenBottom} alt="" draggable={false} />
          </span>

          {/* Deux mouvements, deux éléments : l'envol (repère écran) enveloppe la déchirure (charnière à droite). */}
          <span className={styles.packTopLayer}>
            <span className={styles.packTopFly}>
              {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
              <img className={styles.packTop} src={BOOSTER_OPENING_ASSETS.packOpenTop} alt="" draggable={false} />
            </span>
          </span>

          {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
          <img className={styles.packClosed} src={BOOSTER_OPENING_ASSETS.packClosed} alt="" draggable={false} />

          {torn && (
            <span className={styles.tearEffects}>
              <span className={styles.tearPoint} />
              <span className={styles.tearFlash} />
              <span className={styles.tearBreath} />
              <BoosterParticles variant="tear" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
