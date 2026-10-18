import { CARD_FINISHES, CARD_FINISH_DESCRIPTIONS, CARD_FINISH_LABELS, type CardFinish } from "@/game/cosmetics/finishes";
import { CARD_ARTWORK_DESCRIPTIONS, CARD_ARTWORK_LABELS, artworksOf, type CardArtwork } from "@/game/cosmetics/artworks";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * FINITIONS de la carte (16/10/2026) : les six, de la Classique à la
 * Star Foil. Toucher une finition la montre sur la carte de la fiche —
 * possédée ou non, c'est un aperçu ; celles que le joueur a tirées portent
 * leur marque. Les cinq rares ne sortent que des boosters, très rarement.
 */
export function CardDetailFinishes({
  shown,
  owned,
  onShow,
}: {
  shown: CardFinish;
  /** Finitions rares possédées ; `undefined` : possession inconnue (visiteur). */
  owned?: readonly CardFinish[];
  onShow: (finish: CardFinish) => void;
}) {
  return (
    <section aria-label="Finitions">
      <span className={styles.sectionLabel}>Finitions</span>
      <div className={styles.finishes} role="radiogroup" aria-label="Aperçu de la finition">
        {CARD_FINISHES.map((finish) => {
          const possedee = finish === "classique" || owned?.includes(finish);
          return (
            <button
              key={finish}
              type="button"
              role="radio"
              aria-checked={shown === finish}
              className={styles.finishChip}
              data-finish={finish}
              data-owned={owned && possedee ? "" : undefined}
              title={`${CARD_FINISH_DESCRIPTIONS[finish]}${owned && finish !== "classique" ? (possedee ? " — possédée" : " — aperçu, jamais tirée") : ""}`}
              onClick={() => onShow(finish)}
            >
              {CARD_FINISH_LABELS[finish]}
              {owned && finish !== "classique" && possedee && <span aria-label="possédée"> ✦</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * ILLUSTRATIONS de la carte (Collection visuelle V2, 18/10/2026) : Classique,
 * et Styled / Styled Full-Art quand la carte en a. Même principe que les
 * finitions : toucher une illustration la montre sur la carte de la fiche,
 * en aperçu. Rien pour une carte qui n'a que sa Classique.
 */
export function CardDetailArtworks({ cardId, shown, onShow }: { cardId: string; shown: CardArtwork; onShow: (artwork: CardArtwork) => void }) {
  const artworks = artworksOf(cardId);
  if (artworks.length < 2) return null;
  return (
    <section aria-label="Illustrations">
      <span className={styles.sectionLabel}>Illustrations</span>
      <div className={styles.finishes} role="radiogroup" aria-label="Aperçu de l'illustration">
        {artworks.map((artwork) => (
          <button
            key={artwork}
            type="button"
            role="radio"
            aria-checked={shown === artwork}
            className={styles.finishChip}
            data-artwork={artwork}
            title={CARD_ARTWORK_DESCRIPTIONS[artwork]}
            onClick={() => onShow(artwork)}
          >
            {CARD_ARTWORK_LABELS[artwork]}
          </button>
        ))}
      </div>
    </section>
  );
}
