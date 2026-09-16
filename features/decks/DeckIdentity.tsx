"use client";

import { SHIP_DATABASE } from "@/game";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import styles from "@/features/decks/DeckBuilder.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckIdentityProps {
  shipId: string;
  onChangeShip: () => void;
  onBack: () => void;
}

/**
 * Tête de la colonne de gauche du Deck Builder : l'illustration du Navire,
 * sans cadre, son nom, un texte cliquable pour en changer, et le retour à
 * la liste.
 *
 * Le NOM du deck n'est plus ici : il vit dans l'encart d'identité du panneau
 * de droite (`DeckNamePlate`), juste au-dessus de la liste qu'il nomme.
 */
export function DeckIdentity({ shipId, onChangeShip, onBack }: DeckIdentityProps) {
  const ship = SHIP_DATABASE.get(shipId);
  const illustration = ship?.illustration ? shipIllustrationUrl(ship.illustration) : null;

  function changeShip() {
    playButtonClick();
    onChangeShip();
  }

  return (
    <div className={styles.identity}>
      <button type="button" className={styles.backLink} onClick={onBack}>
        <span aria-hidden>←</span> Mes decks
      </button>

      <button
        type="button"
        className={styles.shipArt}
        style={illustration ? { backgroundImage: `url("${illustration}")` } : undefined}
        onClick={changeShip}
        aria-label={`${shipNameOf(shipId)} — changer de navire`}
        title="Changer de navire"
      />

      <div className={styles.identityShip}>
        <span className={styles.identityShipName}>{shipNameOf(shipId)}</span>
        <button type="button" className={styles.shipChange} onClick={changeShip}>
          Changer de navire
        </button>
      </div>
    </div>
  );
}
