import { CARD_FINISHES, CARD_FINISH_DESCRIPTIONS, CARD_FINISH_LABELS, type CardFinish } from "@/game/cosmetics/finishes";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * FINITIONS de la carte (16/10/2026) : les cinq, de la Classique à la
 * Prismatic. Toucher une finition la montre sur la carte de la fiche —
 * possédée ou non, c'est un aperçu ; celles que le joueur a tirées portent
 * leur marque. Les quatre rares ne sortent que des boosters, très rarement.
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
