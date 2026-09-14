import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewBoard } from "@/features/board-preview/PreviewBoard";
import { PreviewCargo } from "@/features/board-preview/PreviewCargo";
import { PreviewShip, type ShipView } from "@/features/board-preview/PreviewShip";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface OpponentZoneProps {
  ship: ShipView;
  board: PreviewCardModel[];
  /** Emplacements du Navire (4, 5 ou 6) — les vides restent dessinés. */
  capacity?: number;
  renderCard: (card: PreviewCardModel) => ReactNode;
  /** Habillage du Navire (cible d'attaque : `data-drop="ship"`, surbrillance…). */
  wrapShip?: (ship: ReactNode) => ReactNode;
  deck: number;
  graveyard: number;
  onGraveyardClick?: () => void;
}

/**
 * Rangée adverse, sous la main adverse :
 *   [ navire ] [ plateau ] [ pioche · défausse ]
 *
 * Les trois cellules sont en `subgrid` : elles partagent exactement les
 * colonnes de la scène avec la bande centrale et la rangée du joueur, donc
 * les deux plateaux et la piste de Marée restent sur le même axe.
 */
export function OpponentZone({ ship, board, capacity, renderCard, wrapShip = (node) => node, deck, graveyard, onGraveyardClick }: OpponentZoneProps) {
  return (
    <section className={`${styles.zone} ${styles.opponentZone}`} data-zone="OpponentZone" aria-label="Zone adverse">
      <div className={styles.zoneSlotShip}>{wrapShip(<PreviewShip {...ship} />)}</div>
      <div className={styles.zoneSlotBoard}>
        <PreviewBoard zone="OpponentBoard" cards={board} capacity={capacity} renderCard={renderCard} />
      </div>
      <div className={styles.zoneSlotCargo}>
        <PreviewCargo side="opponent" deck={deck} graveyard={graveyard} onGraveyardClick={onGraveyardClick} />
      </div>
    </section>
  );
}
