import { ARCHETYPE_LABELS } from "@/game/cards/archetypes";
import type { CardDetailModel } from "@/features/collection/card-detail/cardDetailData";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

interface CardDetailMetaProps {
  model: CardDetailModel;
  /** Ouvre la contrepartie Standard/Abyssale sans fermer la fiche ; absent si elle n'est pas dans le catalogue affiché. */
  onShowCounterpart?: (cardId: string) => void;
}

/**
 * Informations secondaires, en pied de fiche.
 *
 * Uniquement ce que les données portent réellement :
 *   - la limite d'exemplaires par deck (`getMaxCopies`) ;
 *   - la contrepartie Standard ↔ Abyssale quand elle existe dans le
 *     catalogue, et alors cliquable ;
 *   - l'archétype, qui est une donnée de MOTEUR jamais montrée sur la
 *     carte elle-même (`game/cards/archetypes.ts`) mais légitime dans un
 *     inspecteur de collection, où le joueur cherche justement les
 *     synergies d'une famille.
 *
 * Pas de quantité possédée : `CollectionScreen` ne reçoit que des
 * identifiants de cartes possédées, jamais leur nombre d'exemplaires.
 */
export function CardDetailMeta({ model, onShowCounterpart }: CardDetailMetaProps) {
  const { def, maxCopies, counterpart } = model;

  return (
    <div className={styles.meta}>
      {def.archetype && (
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Archétype</span>
          <span className={styles.metaValue}>{ARCHETYPE_LABELS[def.archetype]}</span>
        </div>
      )}

      <div className={styles.metaItem}>
        <span className={styles.metaLabel}>Limite</span>
        <span className={styles.metaValue}>
          {maxCopies} exemplaire{maxCopies > 1 ? "s" : ""} / deck
        </span>
      </div>

      {counterpart && (
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Version {counterpart.kind === "abyssal" ? "Abyssale" : "Standard"}</span>
          {onShowCounterpart ? (
            <button type="button" className={styles.metaLink} onClick={() => onShowCounterpart(counterpart.id)}>
              {counterpart.name}
            </button>
          ) : (
            <span className={styles.metaValue}>{counterpart.name}</span>
          )}
        </div>
      )}
    </div>
  );
}
