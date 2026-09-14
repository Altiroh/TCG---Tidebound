import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { BOARD_CAPACITY, type PreviewCardModel } from "@/features/board-preview/previewFixtures";

/** État de dépôt d'un rang pendant une pose : `ready` = une carte est en route, `over` = elle le survole. */
export type BoardDropState = "idle" | "ready" | "over";

interface PreviewBoardProps {
  /** Nom de zone pour l'overlay de debug (`DebugOverlay`). */
  zone: "OpponentBoard" | "PlayerBoard";
  cards: PreviewCardModel[];
  /** Nombre d'emplacements dessinés, cartes absentes comprises. */
  capacity?: number;
  /**
   * Rendu d'une carte (aujourd'hui `PreviewGameCard`). Le rang ne connaît
   * que ses emplacements : la carte remplit le sien (`--card-w`).
   */
  renderCard: (card: PreviewCardModel) => ReactNode;
  /** Rang où l'on peut poser : porte `data-drop="board"` (cf. `useTableGestures`). */
  droppable?: boolean;
  dropState?: BoardDropState;
}

/**
 * Rang de plateau : `capacity` emplacements centrés, de largeur `--card-w`.
 * Un emplacement vide reste dessiné (pointillés) pour que la composition ne
 * bouge pas selon le nombre de cartes en jeu.
 *
 * Pendant une pose, le PREMIER emplacement libre — celui que la carte
 * prendra, comme dans le moteur — s'allume ; tout le rang est la zone de
 * dépôt, pas seulement cet emplacement (viser au doigt une case de 50 px
 * serait pénible).
 */
export function PreviewBoard({ zone, cards, capacity = BOARD_CAPACITY, renderCard, droppable = false, dropState = "idle" }: PreviewBoardProps) {
  const slots = Array.from({ length: Math.max(capacity, cards.length) }, (_, index) => cards[index]);
  const nextFree = cards.length < capacity ? cards.length : -1;

  return (
    <div
      className={`${styles.board} ${dropState !== "idle" ? styles.boardDropReady : ""} ${dropState === "over" ? styles.boardDropOver : ""}`}
      data-zone={zone}
      data-drop={droppable ? "board" : undefined}
    >
      {slots.map((card, index) => (
        <div key={card?.id ?? `${zone}-empty-${index}`} className={styles.boardSlot}>
          {card ? (
            renderCard(card)
          ) : (
            <div className={`${styles.boardSlotEmpty} ${dropState !== "idle" && index === nextFree ? styles.boardSlotNext : ""}`} />
          )}
        </div>
      ))}
    </div>
  );
}
