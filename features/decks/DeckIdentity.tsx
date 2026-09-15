"use client";

import { useMemo } from "react";
import { ShipPortrait, shipNameOf } from "@/features/ships/ShipPortrait";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { ArtPlate } from "@/features/shell/ArtPlate";
import styles from "@/features/decks/DeckBuilder.module.css";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckIdentityProps {
  name: string;
  onNameChange: (name: string) => void;
  shipId: string;
  /** Contenu du deck — sert à choisir l'illustration de fond de la plaque de nom. */
  cardIds: readonly string[];
  onChangeShip: () => void;
  onBack: () => void;
}

/**
 * Tête de la colonne de gauche du Deck Builder : ce QUE le deck est, avant
 * les filtres qui disent ce qu'on y cherche. Le Navire dans son cadre, le
 * nom du deck gravé sur sa plaque, le nom du Navire et de quoi en changer,
 * et le retour à la liste.
 *
 * La plaque de nom est l'`ArtPlate` partagée (`features/shell/`), avec au
 * fond une illustration TIRÉE DU DECK (`nameplateArtUrl`) : le deck se
 * reconnaît à son image avant de se lire, et la même plaque sert dans la
 * liste des decks et au profil.
 */
export function DeckIdentity({ name, onNameChange, shipId, cardIds, onChangeShip, onBack }: DeckIdentityProps) {
  // Recalculée seulement quand le deck ou le Navire change : la plaque ne
  // doit pas se redessiner à chaque frappe dans le champ.
  const artUrl = useMemo(() => nameplateArtUrl(cardIds, shipId), [cardIds, shipId]);

  return (
    <div className={styles.identity}>
      <button type="button" className={game.link} onClick={onBack}>
        <span aria-hidden>←</span> Mes decks
      </button>

      <ShipPortrait shipId={shipId} width="100%" showName={false} className={styles.identityPortrait} />

      <ArtPlate artUrl={artUrl} size="md">
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nom du deck"
          aria-label="Nom du deck"
          className={styles.deckName}
          maxLength={60}
        />
      </ArtPlate>

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
