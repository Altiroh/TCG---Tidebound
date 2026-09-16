"use client";

import { memo, type CSSProperties } from "react";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
import type { BoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";

interface BoosterPackProps {
  visual: BoosterPackVisual;
  /** Le sachet est au centre et attend le geste d'ouverture. */
  ready: boolean;
  /** Le paquet a été découpé : pièces ouvertes visibles, bande en train de se déchirer. */
  torn: boolean;
  /** Toutes les cartes sont sorties : le sachet vide s'efface. */
  retreating: boolean;
  /** Variables de trajectoire d'entrée (`--enter-*`) : d'où le sachet arrive. */
  enterStyle?: CSSProperties;
  onOpen: () => void;
}

/**
 * Le sachet. Sa boîte a les proportions EXACTES du corps ouvert (qui ne
 * bouge jamais) ; le paquet fermé et la bande arrachée sont positionnés en
 * pourcentages de cette boîte, d'après le calage de `boosterPackVisuals.ts`
 * poussé en variables CSS par la scène — donc alignés à toutes les tailles.
 *
 * `ready` : arrivé au centre, il pulse doucement et attend qu'on le touche.
 * C'est le joueur qui l'ouvre — l'ouverture est le geste qu'on vient faire.
 *
 * Les attributs `data-*` pilotent des animations CSS qui ne redémarrent pas
 * quand la phase de la scène change : elles ne dépendent que de `torn` et
 * `retreating`, qui ne repassent jamais à `false`.
 */
export const BoosterPack = memo(function BoosterPack({ visual, ready, torn, retreating, enterStyle, onOpen }: BoosterPackProps) {
  return (
    <div
      className={styles.packAnchor}
      style={enterStyle}
      data-retreat={retreating || undefined}
      data-ready={ready || undefined}
      role={ready ? "button" : undefined}
      tabIndex={ready ? 0 : -1}
      aria-label={ready ? "Ouvrir le booster" : undefined}
      aria-hidden={ready ? undefined : true}
      onClick={ready ? onOpen : undefined}
      onKeyDown={(event) => {
        if (!ready || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onOpen();
      }}
    >
      <div className={styles.packMotion}>
        <div className={styles.packFloat} data-torn={torn || undefined}>
          <span className={styles.packShadow} />
          <span className={styles.packReadyHalo} />

          <span className={styles.packOpenLayer}>
            {/* eslint-disable-next-line @next/next/no-img-element -- asset préchargé et décodé, animé en transform */}
            <img className={styles.packBottom} src={visual.assets.openBottom} alt="" draggable={false} />
          </span>

          {/* Deux mouvements, deux éléments : l'envol (repère écran) enveloppe la déchirure (charnière à droite). */}
          <span className={styles.packTopLayer}>
            <span className={styles.packTopFly}>
              {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
              <img className={styles.packTop} src={visual.assets.openTop} alt="" draggable={false} />
            </span>
          </span>

          {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
          <img className={styles.packClosed} src={visual.assets.closed} alt="" draggable={false} />
          {/* Reflet qui balaie le sachet fermé, découpé à sa silhouette. */}
          <span className={styles.packShine} />

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
