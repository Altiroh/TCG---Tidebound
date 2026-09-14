import type { CardInstance } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import styles from "@/features/collection/card-detail/CardDetail.module.css";

/** Instance factice : la Collection affiche des DÉFINITIONS, pas des cartes en jeu (aucun dégât, aucun modificateur, aucune Marée active). */
function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: cardId,
    cardId,
    ownerId: "collection",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/**
 * Rendu de la carte, en grand.
 *
 * Aucune logique de carte n'est réécrite ici : c'est le `CardTile` du jeu,
 * simplement plus grand (`widthClassName="w-full"`, la largeur réelle étant
 * fixée par `.artwork` en `clamp()`). La carte garde donc exactement le
 * même cadre, le même visuel et les mêmes statistiques qu'en jeu — et le
 * jour où `CardTile` évolue, cette fiche suit sans retouche.
 *
 * Les badges d'état (Inactive, Engourdi, Durée…) sont explicitement
 * éteints : ils décrivent une carte EN PARTIE, alors qu'ici on inspecte une
 * définition de catalogue.
 */
export function CardDetailArtwork({ cardId }: { cardId: string }) {
  return (
    <div className={styles.artwork} key={cardId}>
      <CardTile
        instance={displayInstance(cardId)}
        tideState="calme"
        widthClassName="w-full"
        scaleOnHover={false}
        // Hors partie, « Inactive » / « Engourdi » seraient déduits d'une
        // Marée arbitraire : la fiche montre la carte, pas un état de jeu.
        showStatusBadges={false}
      />
    </div>
  );
}
