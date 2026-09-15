import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import type { CardDetailModel } from "@/features/collection/card-detail/cardDetailData";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/**
 * Rareté, badges de type, nom.
 *
 * Ce que le modèle Tidebound ne porte PAS et qui n'est donc pas affiché :
 * numéro de collection, texte d'ambiance séparé (`CardDefinition.text` est
 * le texte de RÈGLES, rendu par `CardDetailEffect`), artiste, extension
 * (aucune carte ne déclare de `setCode` aujourd'hui). Ces lignes
 * apparaîtront d'elles-mêmes le jour où les données existeront.
 */
export function CardDetailHeader({ model, titleId }: { model: CardDetailModel; titleId: string }) {
  const { def, rarity, isAbyssal, otherSubtype } = model;

  return (
    <header>
      <div className={styles.eyebrow}>
        {rarity && (
          <span className={styles.rarity}>
            <span className={styles.rarityMark} aria-hidden />
            {CARD_RARITY_LABELS[rarity]}
          </span>
        )}
        {def.token && <span>Jeton</span>}
      </div>

      <div className={`${styles.badges} mt-2`}>
        {/* Pas d'icône de type ici : les assets `type-*.webp` sont
            des pastilles avec le mot déjà écrit dedans — les afficher à côté
            du libellé donnait « structure STRUCTURE ». Le texte seul est
            aussi plus net à petite taille et reste sélectionnable. */}
        <span className={styles.badge}>{CARD_TYPE_LABELS[def.type]}</span>
        {isAbyssal && <span className={`${styles.badge} ${styles.badgeAccent}`}>Abyssal</span>}
        {otherSubtype && <span className={styles.badge}>{otherSubtype}</span>}
      </div>

      <h2 id={titleId} className={`${styles.title} mt-3`}>
        {def.name}
      </h2>
    </header>
  );
}
