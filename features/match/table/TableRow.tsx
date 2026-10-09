import type { ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import { BOARD_CAPACITY, type TableCardModel } from "@/features/match/table/tableModel";

/** État de dépôt d'un rang pendant une pose : `ready` = une carte est en route, `over` = elle le survole. */
export type BoardDropState = "idle" | "ready" | "over";

interface PreviewBoardProps {
  /** Nom de zone pour l'overlay de debug (`DebugOverlay`). */
  zone: "OpponentBoard" | "PlayerBoard";
  /** Le rang case par case : `undefined` = case vide (`boardSlotLayout`). */
  cards: readonly (TableCardModel | undefined)[];
  /** Nombre d'emplacements dessinés, cartes absentes comprises. */
  capacity?: number;
  /** Emplacements CONDAMNÉS (cartes de plateau) : affichés fermés, après les cases utilisables. */
  condemned?: number;
  /**
   * Rendu d'une carte (aujourd'hui `PreviewGameCard`). Le rang ne connaît
   * que ses emplacements : la carte remplit le sien (`--card-w`).
   */
  renderCard: (card: TableCardModel) => ReactNode;
  /** Rang où l'on peut poser : porte `data-drop="board"` (cf. `useTableGestures`). */
  droppable?: boolean;
  dropState?: BoardDropState;
  /**
   * Case qui recevra la carte en cours de pose — c'est ELLE qui s'allume.
   * Absente : la première case libre.
   */
  dropSlot?: number;
}

/**
 * Rang de plateau : `capacity` emplacements centrés, de largeur `--card-w`.
 * Un emplacement vide reste dessiné (pointillés) pour que la composition ne
 * bouge pas selon le nombre de cartes en jeu.
 *
 * Pendant une pose, l'emplacement VISÉ s'allume — celui sous le pointeur,
 * pas forcément la première libre : chaque case est sa propre cible de
 * dépôt (`data-drop="board:<index>"`), et la carte s'y pose, cases vides
 * comprises. Le rang entier reste une cible de repli (`data-drop="board"`,
 * première case libre) pour que lâcher entre deux cases ne rate jamais.
 */
export function TableRow({ zone, cards, capacity = BOARD_CAPACITY, condemned = 0, renderCard, droppable = false, dropState = "idle", dropSlot }: PreviewBoardProps) {
  const slots = Array.from({ length: Math.max(capacity, cards.length) }, (_, index) => cards[index]);
  const nextFree = slots.findIndex((card, index) => card === undefined && index < capacity);
  // La case mise en évidence : celle que le joueur vise si elle est libre.
  const highlighted = dropSlot !== undefined && slots[dropSlot] === undefined ? dropSlot : nextFree;

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
      {Array.from({ length: condemned }, (_, index) => (
        <div key={`${zone}-condamne-${index}`} className={styles.boardSlot} title="Emplacement condamné">
          <div className={`${styles.boardSlotEmpty} ${styles.boardSlotCondemned}`} aria-label="Emplacement condamné">
            {/* Les chaînes de Chaîne de construction, en croix, et le cadenas au centre. */}
            <span aria-hidden className={styles.condemnedChain} data-chain="a" />
            <span aria-hidden className={styles.condemnedChain} data-chain="b" />
            <span aria-hidden className={styles.condemnedLock} />
          </div>
        </div>
      ))}
    </div>
  );
}
