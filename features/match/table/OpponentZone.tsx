import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import { TableRow } from "@/features/match/table/TableRow";
import { TableCargo } from "@/features/match/table/TableCargo";
import { TableShip, type ShipView } from "@/features/match/table/TableShip";
import type { TableCardModel } from "@/features/match/table/tableModel";

interface OpponentZoneProps {
  ship: ShipView;
  board: TableCardModel[];
  /** Emplacements du Navire (4, 5 ou 6) — les vides restent dessinés. */
  capacity?: number;
  renderCard: (card: TableCardModel) => ReactNode;
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
      <div className={styles.zoneSlotShip}>{wrapShip(<TableShip {...ship} />)}</div>
      <div className={styles.zoneSlotBoard}>
        <TableRow zone="OpponentBoard" cards={board} capacity={capacity} renderCard={renderCard} />
      </div>
      <div className={styles.zoneSlotCargo}>
        <TableCargo side="opponent" deck={deck} graveyard={graveyard} onGraveyardClick={onGraveyardClick} />
      </div>
    </section>
  );
}
