"use client";

import { ShipPortrait, shipNameOf } from "@/features/ships/ShipPortrait";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckIdentityProps {
  name: string;
  onNameChange: (name: string) => void;
  shipId: string;
  onChangeShip: () => void;
  onBack: () => void;
}

/**
 * Tête de la colonne de gauche du Deck Builder : ce QUE le deck est, avant
 * les filtres qui disent ce qu'on y cherche. Le Navire dans son cadre, le
 * nom du deck (de l'encre, pas un champ), le nom du Navire et de quoi en
 * changer, et le retour à la liste.
 */
export function DeckIdentity({ name, onNameChange, shipId, onChangeShip, onBack }: DeckIdentityProps) {
  return (
    <div className={styles.identity}>
      <button type="button" className={game.link} onClick={onBack}>
        <span aria-hidden>←</span> Mes decks
      </button>

      <ShipPortrait shipId={shipId} width="100%" showName={false} className={styles.identityPortrait} />

      <input
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="Nom du deck"
        aria-label="Nom du deck"
        className={styles.deckName}
        maxLength={60}
      />

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
