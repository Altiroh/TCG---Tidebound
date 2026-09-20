import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import { BOARD_CAPACITY, type TableCardModel } from "@/features/match/table/tableModel";

/** État de dépôt d'un rang pendant une pose : `ready` = une carte est en route, `over` = elle le survole. */
export type BoardDropState = "idle" | "ready" | "over";

interface PreviewBoardProps {
  /** Nom de zone pour l'overlay de debug (`DebugOverlay`). */
  zone: "OpponentBoard" | "PlayerBoard";
  cards: TableCardModel[];
  /** Nombre d'emplacements dessinés, cartes absentes comprises. */
  capacity?: number;
  /**
   * Rendu d'une carte (aujourd'hui `PreviewGameCard`). Le rang ne connaît
   * que ses emplacements : la carte remplit le sien (`--card-w`).
   */
  renderCard: (card: TableCardModel) => ReactNode;
  /** Rang où l'on peut poser : porte `data-drop="board"` (cf. `useTableGestures`). */
  droppable?: boolean;
  dropState?: BoardDropState;
  /**
   * Emplacement qui recevra la carte en cours de pose — c'est LUI qui
   * s'allume. Absent : le premier emplacement libre, c'est-à-dire la fin
   * du rang.
   */
  dropSlot?: number;
}

/**
 * Rang de plateau : `capacity` emplacements centrés, de largeur `--card-w`.
 * Un emplacement vide reste dessiné (pointillés) pour que la composition ne
 * bouge pas selon le nombre de cartes en jeu.
 *
 * Pendant une pose, l'emplacement VISÉ s'allume — celui sous le pointeur,
 * pas forcément le dernier : chaque emplacement est sa propre cible de
 * dépôt (`data-drop="board:<index>"`), et la carte s'insère là. Le rang
 * entier reste une cible de repli (`data-drop="board"`, fin de rang) pour
 * que lâcher entre deux cases ne fasse jamais rien rater.
 */
export function TableRow({ zone, cards, capacity = BOARD_CAPACITY, renderCard, droppable = false, dropState = "idle", dropSlot }: PreviewBoardProps) {
  const slots = Array.from({ length: Math.max(capacity, cards.length) }, (_, index) => cards[index]);
  const nextFree = cards.length < capacity ? cards.length : -1;
  // L'emplacement mis en évidence : celui que le joueur vise, ramené dans
  // le rang (le rang est DENSE, viser la case 5 sur un plateau qui en
  // compte deux revient à se ranger en troisième).
  const highlighted = dropSlot === undefined ? nextFree : Math.min(dropSlot, cards.length);

  return (
    <div
      className={`${styles.board} ${dropState !== "idle" ? styles.boardDropReady : ""} ${dropState === "over" ? styles.boardDropOver : ""}`}
      data-zone={zone}
      data-drop={droppable ? "board" : undefined}
    >
      {slots.map((card, index) => (
        <div
          key={card?.id ?? `${zone}-empty-${index}`}
          className={styles.boardSlot}
          data-drop={droppable ? `board:${index}` : undefined}
        >
          {card ? (
            renderCard(card)
          ) : (
            <div className={`${styles.boardSlotEmpty} ${dropState !== "idle" && index === highlighted ? styles.boardSlotNext : ""}`} />
          )}
        </div>
      ))}
    </div>
  );
}
