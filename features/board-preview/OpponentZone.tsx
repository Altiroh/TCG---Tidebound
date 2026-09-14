import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewBoard } from "@/features/board-preview/PreviewBoard";
import { PreviewResources } from "@/features/board-preview/PreviewResources";
import { PreviewShip } from "@/features/board-preview/PreviewShip";
import type { PreviewCardModel, PreviewSideModel } from "@/features/board-preview/previewFixtures";

interface OpponentZoneProps {
  side: PreviewSideModel;
  board: PreviewCardModel[];
}

/**
 * Camp adverse, collé au bord haut de la scène :
 *   [ navire ] [ plateau ] [ ressources ]
 *
 * Seule la colonne centrale est élastique ; navire et ressources ont une
 * largeur fluide mais bornée (`--ship-w`, `--res-w`) et ne mangent donc
 * jamais le plateau, même en 740×360.
 *
 * La main adverse n'est pas représentée ici : sur cette itération elle
 * n'apporte rien au réglage du layout et coûterait de la hauteur. Sa place
 * est réservée par la gouttière haute de la scène.
 */
export function OpponentZone({ side, board }: OpponentZoneProps) {
  return (
    <section className={`${styles.zone} ${styles.opponentZone}`} data-zone="OpponentZone" aria-label="Zone adverse">
      <div className={styles.zoneSlotShip}>
        <PreviewShip name={side.shipName} hull={side.hull} maxHull={side.maxHull} />
      </div>
      <div className={styles.zoneSlotBoard}>
        <PreviewBoard zone="OpponentBoard" cards={board} />
      </div>
      <div className={styles.zoneSlotResources}>
        <PreviewResources resources={side.resources} />
      </div>
    </section>
  );
}
