import type { ReactNode } from "react";
import styles from "@/features/board-preview/BoardPreview.module.css";
import { PreviewCard } from "@/features/board-preview/PreviewCard";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface PreviewHandProps {
  cards: PreviewCardModel[];
  /** Idem `PreviewBoard` : point d'injection pour le futur `GameCard`. */
  renderCard?: (card: PreviewCardModel) => ReactNode;
}

/**
 * Main du joueur : rang centré, chevauchement piloté par le token
 * `--hand-overlap` (nul sur grand écran, marqué en mobile paysage) et
 * resserré automatiquement par Flexbox si la place vient à manquer — voir
 * le commentaire de `.hand` dans `BoardPreview.module.css`.
 *
 * Préparation des interactions futures (éventail, survol, sélection, drag,
 * agrandissement) : chaque carte est déjà isolée dans son propre créneau,
 * avec un `transform-origin` en bas et une transition prête. Aucune de ces
 * animations n'est codée ici — seule l'architecture qui les rendra
 * possibles l'est. Le `z-index` croissant garantit que la carte survolée
 * pourra passer au-dessus de ses voisines de droite.
 */
export function PreviewHand({ cards, renderCard }: PreviewHandProps) {
  return (
    <div className={styles.hand} data-zone="PlayerHand">
      <div className={styles.handRow}>
        {cards.map((card, index) => (
          <div key={card.id} className={styles.handCardSlot} style={{ zIndex: index + 1 }}>
            <div className={styles.handCard}>{renderCard ? renderCard(card) : <PreviewCard card={card} />}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
