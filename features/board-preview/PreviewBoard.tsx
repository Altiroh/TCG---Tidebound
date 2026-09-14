import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewCard } from "@/features/board-preview/PreviewCard";
import { BOARD_CAPACITY, type PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface PreviewBoardProps {
  /** Nom de zone pour l'overlay de debug (`DebugOverlay`). */
  zone: "OpponentBoard" | "PlayerBoard";
  cards: PreviewCardModel[];
  /** Nombre d'emplacements dessinés, cartes absentes comprises. */
  capacity?: number;
  /**
   * Point d'injection du rendu de carte. Par défaut `PreviewCard` ; c'est
   * ce paramètre qui permettra de brancher le vrai `GameCard` sans rien
   * changer à la disposition du rang.
   */
  renderCard?: (card: PreviewCardModel) => ReactNode;
}

/**
 * Rang de plateau : `capacity` emplacements centrés, de largeur `--card-w`.
 * Un emplacement vide reste dessiné (pointillés) pour que la composition ne
 * bouge pas selon le nombre de cartes en jeu.
 */
export function PreviewBoard({ zone, cards, capacity = BOARD_CAPACITY, renderCard }: PreviewBoardProps) {
  const slots = Array.from({ length: Math.max(capacity, cards.length) }, (_, index) => cards[index]);

  return (
    <div className={styles.board} data-zone={zone}>
      {slots.map((card, index) => (
        <div key={card?.id ?? `${zone}-empty-${index}`} className={styles.boardSlot}>
          {card ? (renderCard ? renderCard(card) : <PreviewCard card={card} />) : <div className={styles.boardSlotEmpty} />}
        </div>
      ))}
    </div>
  );
}
