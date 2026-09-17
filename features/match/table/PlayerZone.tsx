import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import { TableRow, type BoardDropState } from "@/features/match/table/TableRow";
import { TableCargo } from "@/features/match/table/TableCargo";
import { TableShip, type ShipView } from "@/features/match/table/TableShip";
import type { TableCardModel } from "@/features/match/table/tableModel";

interface PlayerZoneProps {
  ship: ShipView;
  board: TableCardModel[];
  /** Emplacements du Navire (4, 5 ou 6) — les vides restent dessinés. */
  capacity?: number;
  renderCard: (card: TableCardModel) => ReactNode;
  /** Habillage du Navire (repère d'animation `data-ship-target`…). */
  wrapShip?: (ship: ReactNode) => ReactNode;
  /** État de dépôt du plateau pendant une pose depuis la main. */
  dropState?: BoardDropState;
  deck: number;
  graveyard: number;
  /** État du crâne pendant qu'une carte est prise (zone de Sabordage). */
  graveyardDropState: BoardDropState;
  /** Toucher / cliquer la pioche (labo : piocher). Absent = pioche inerte. */
  onDraw?: () => void;
  onGraveyardClick?: () => void;
}

/**
 * Rangée du joueur — même gabarit que la rangée adverse, SANS miroir
 * gauche/droite (comme sur l'ancien board : les deux navires sont à gauche,
 * les deux piles à droite) :
 *   [ navire ] [ plateau ] [ pioche · défausse ]
 *
 * La main n'en fait plus partie : elle vit dans sa propre bande en bas de la
 * scène (`TableHand`), en éventail coupé par le bord de l'écran.
 */
export function PlayerZone({
  ship,
  board,
  capacity,
  renderCard,
  wrapShip = (node) => node,
  dropState,
  deck,
  graveyard,
  graveyardDropState,
  onDraw,
  onGraveyardClick,
}: PlayerZoneProps) {
  return (
    <section className={`${styles.zone} ${styles.playerZone}`} data-zone="PlayerZone" aria-label="Zone du joueur">
      <div className={styles.zoneSlotShip}>{wrapShip(<TableShip {...ship} />)}</div>
      <div className={styles.zoneSlotBoard}>
        <TableRow zone="PlayerBoard" cards={board} capacity={capacity} renderCard={renderCard} droppable dropState={dropState} />
      </div>
      <div className={styles.zoneSlotCargo}>
        <TableCargo
          side="player"
          ownerId={ship.ownerId}
          deck={deck}
          graveyard={graveyard}
          graveyardDropState={graveyardDropState}
          onDraw={onDraw}
          onGraveyardClick={onGraveyardClick}
        />
      </div>
    </section>
  );
}
