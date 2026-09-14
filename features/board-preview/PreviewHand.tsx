import type { CSSProperties, ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface PreviewHandProps {
  cards: PreviewCardModel[];
  /** Idem `PreviewBoard` : point d'injection pour le futur `GameCard`. */
  renderCard: (card: PreviewCardModel) => ReactNode;
  /** Une carte est en cours de glisser : la levée au survol se coupe. */
  dragging?: boolean;
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
export function PreviewHand({ cards, renderCard, dragging = false }: PreviewHandProps) {
  const center = (cards.length - 1) / 2;

  return (
    <div className={`${styles.hand} ${dragging ? styles.handDragging : ""}`} data-zone="PlayerHand">
      <div className={styles.handRow}>
        {cards.map((card, index) => (
          <div
            key={card.id}
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
