import styles from "@/features/board-preview/BoardPreview.module.css";
import type { PreviewCardModel } from "@/features/board-preview/previewFixtures";

interface PreviewCardProps {
  card: PreviewCardModel;
}

/**
 * Placeholder de carte : ratio 5:7, fond simple, bordure légère, numéro.
 *
 * Ne connaît RIEN du gameplay et ne décide pas de sa propre largeur :
 * elle remplit son emplacement (`width: 100%`), c'est la zone qui la
 * contient qui fixe la taille (token `--card-w`). C'est la condition pour
 * pouvoir la remplacer un jour par le vrai `GameCard` sans toucher au
 * layout.
 */
export function PreviewCard({ card }: PreviewCardProps) {
  return (
    <div className={`${styles.card} ${card.faceDown ? styles.cardFaceDown : ""}`} aria-hidden={card.faceDown}>
      {card.faceDown ? null : (
        <>
          <span className={styles.cardIndex}>{card.index}</span>
          <span className={styles.cardLabel}>{card.label}</span>
        </>
      )}
    </div>
  );
}
