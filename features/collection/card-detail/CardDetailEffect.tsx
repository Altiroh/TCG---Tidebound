import { segmentEffectText } from "@/features/collection/card-detail/cardDetailData";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

const EMPHASIS_CLASS = {
  none: "",
  value: styles.effectValue ?? "",
  term: styles.effectTerm ?? "",
} as const;

/**
 * Texte de règles de la carte, avec mise en valeur du vocabulaire de jeu.
 *
 * La mise en valeur est purement typographique : `segmentEffectText`
 * découpe le texte ORIGINAL sans jamais le réécrire, et la concaténation
 * des fragments rendus redonne la phrase exacte du catalogue.
 */
export function CardDetailEffect({ text }: { text: string }) {
  return (
    <section>
      <span className={styles.sectionLabel}>Effet de carte</span>
      <div className={styles.effect}>
        <p className={styles.effectText}>
          {segmentEffectText(text).map((segment, index) =>
            segment.emphasis === "none" ? (
              segment.text
            ) : (
              <span key={index} className={EMPHASIS_CLASS[segment.emphasis]}>
                {segment.text}
              </span>
            )
          )}
        </p>
      </div>
    </section>
  );
}
