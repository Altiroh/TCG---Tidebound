import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewBoard, type BoardDropState } from "@/features/board-preview/PreviewBoard";
import { PreviewCargo } from "@/features/board-preview/PreviewCargo";
import { PreviewShip, type ShipView } from "@/features/board-preview/PreviewShip";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface PlayerZoneProps {
  ship: ShipView;
  board: PreviewCardModel[];
  /** Emplacements du Navire (4, 5 ou 6) — les vides restent dessinés. */
  capacity?: number;
  renderCard: (card: PreviewCardModel) => ReactNode;
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
 * scène (`PreviewHand`), en éventail coupé par le bord de l'écran.
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
      <div className={styles.zoneSlotShip}>{wrapShip(<PreviewShip {...ship} />)}</div>
      <div className={styles.zoneSlotBoard}>
        <PreviewBoard zone="PlayerBoard" cards={board} capacity={capacity} renderCard={renderCard} droppable dropState={dropState} />
      </div>
      <div className={styles.zoneSlotCargo}>
        <PreviewCargo
          side="player"
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
