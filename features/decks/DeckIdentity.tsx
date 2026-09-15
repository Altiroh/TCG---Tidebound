"use client";

import { ShipPortrait, shipNameOf } from "@/features/ships/ShipPortrait";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckIdentityProps {
  shipId: string;
  onChangeShip: () => void;
  onBack: () => void;
}

/**
 * Tête de la colonne de gauche du Deck Builder : le Navire dans son cadre,
 * son nom, de quoi en changer, et le retour à la liste.
 *
 * Le NOM du deck n'est plus ici : il a rejoint le panneau de droite, juste
 * au-dessus de la liste qu'il nomme (`DeckNamePlate`). Il était loin d'elle,
 * et sa plaque prenait ici une hauteur que les filtres réclamaient.
 */
export function DeckIdentity({ shipId, onChangeShip, onBack }: DeckIdentityProps) {
  return (
    <div className={styles.identity}>
      <button type="button" className={game.link} onClick={onBack}>
        <span aria-hidden>←</span> Mes decks
      </button>

      <ShipPortrait shipId={shipId} width="100%" showName={false} className={styles.identityPortrait} />

      <div className={styles.identityShip}>
        <span className={styles.identityShipName}>{shipNameOf(shipId)}</span>
        <button
          type="button"
          className={game.link}
          onClick={() => {
            playButtonClick();
            onChangeShip();
          }}
        >
          Changer de navire
        </button>
      </div>
    </div>
  );
}
