import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewBoard } from "@/features/board-preview/PreviewBoard";
import { PreviewHand } from "@/features/board-preview/PreviewHand";
import { PreviewResources } from "@/features/board-preview/PreviewResources";
import { PreviewShip } from "@/features/board-preview/PreviewShip";
import type { PreviewCardModel, PreviewSideModel } from "@/features/board-preview/previewFixtures";

interface PlayerZoneProps {
  side: PreviewSideModel;
  board: PreviewCardModel[];
  hand: PreviewCardModel[];
}

/**
 * Camp du joueur, collé au bord bas de la scène. Miroir du camp adverse
 * (navire côté extérieur, ressources côté intérieur) :
 *   [ ressources ] [ plateau ] [ navire ]
 *   [            main sur toute la largeur            ]
 */
export function PlayerZone({ side, board, hand }: PlayerZoneProps) {
  return (
    <section className={`${styles.zone} ${styles.playerZone}`} data-zone="PlayerZone" aria-label="Zone du joueur">
      <div className={styles.zoneSlotResources}>
        <PreviewResources resources={side.resources} />
      </div>
      <div className={styles.zoneSlotBoard}>
        <PreviewBoard zone="PlayerBoard" cards={board} />
      </div>
      <div className={styles.zoneSlotShip}>
        <PreviewShip name={side.shipName} hull={side.hull} maxHull={side.maxHull} />
      </div>
      <div className={styles.handSlot}>
        <PreviewHand cards={hand} />
      </div>
    </section>
  );
}
