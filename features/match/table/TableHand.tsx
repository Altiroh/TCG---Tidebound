import type { CSSProperties, ReactNode } from "react";
import styles from "@/features/match/table/Table.module.css";
import type { TableCardModel } from "@/features/match/table/tableModel";

interface PreviewHandProps {
  cards: TableCardModel[];
  /** Idem `TableRow` : point d'injection pour le futur `GameCard`. */
  renderCard: (card: TableCardModel) => ReactNode;
  /** Une carte est en cours de glisser : la levée au survol se coupe. */
  dragging?: boolean;
  /**
   * Main DÉPLOYÉE (téléphone couché) : les cartes se relèvent en entier et
   * grandissent, au-dessus d'un voile qui assombrit le plateau.
   */
  raised?: boolean;
  /** Toucher sur le voile : la main se replie. */
  onLower?: () => void;
}

/**
 * Main du joueur : un éventail posé sur le bord bas de l'écran, pas un rang
 * complet. Les cartes sont plus petites qu'en jeu (`--hand-card-h`), se
 * chevauchent fortement et ne montrent que leur partie haute
 * (`--hand-peek`) — le reste passe sous le bord, comme sur l'ancien board.
 * Survolée, une carte se lève et se remet à plat pour être lue en entier.
 *
 * Rotation et creux de l'arc sont calculés en CSS à partir de deux
 * variables posées par carte : `--fan-offset` (écart signé au centre) et
 * `--fan-dist` (sa valeur absolue — `abs()` CSS n'est pas encore partout).
 */
export function TableHand({ cards, renderCard, dragging = false, raised = false, onLower }: PreviewHandProps) {
  const center = (cards.length - 1) / 2;

  return (
    <div className={`${styles.hand} ${dragging ? styles.handDragging : ""} ${raised ? styles.handRaised : ""}`} data-zone="PlayerHand">
      {/* Le voile ATTRAPE le toucher qui replie la main : sans lui, ce toucher
          tombait sur le plateau (armer une unité, finir le tour…). */}
      {raised && (
        <div
          className={styles.handVeil}
          aria-hidden
          onPointerDown={(event) => {
            event.stopPropagation();
            onLower?.();
          }}
        />
      )}
      <div className={styles.handRow}>
        {cards.map((card, index) => (
          <div
            key={card.id}
            // Ancre par carte : le guide du tutoriel désigne UNE carte
            // précise, pas la main entière.
            data-hand-card={card.id}
            className={styles.handCardSlot}
            style={{ zIndex: index + 1, "--fan-offset": index - center, "--fan-dist": Math.abs(index - center) } as CSSProperties}
          >
            <div className={styles.handCard}>{renderCard(card)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
