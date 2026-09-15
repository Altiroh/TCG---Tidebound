"use client";

import { nameplateArtUrl, plateArtUrl } from "@/features/decks/nameplateArt";
import { useFitText } from "@/features/decks/useFitText";
import { ArtPlate } from "@/features/shell/ArtPlate";
import styles from "@/features/decks/DeckBuilder.module.css";

/** Bornes de la police du nom : il tient sur une ligne, et reste lisible. */
const NAME_MAX_PX = 22;
const NAME_MIN_PX = 11;

interface DeckNamePlateProps {
  name: string;
  onNameChange: (name: string) => void;
  shipId: string;
  /** Contenu du deck — sert d'illustration par défaut, et de choix possibles. */
  cardIds: readonly string[];
  /** Carte choisie explicitement, ou `null` pour laisser le deck décider. */
  artCardId: string | null;
  onPickArt: () => void;
}

/**
 * Nom du deck, en tête du panneau de droite — juste au-dessus de la liste
 * qu'il nomme.
 *
 * Il vivait dans la colonne de GAUCHE, sous le Navire, loin de la liste. La
 * plaque y prenait aussi beaucoup de hauteur, au détriment des filtres.
 *
 * Le nom tient sur UNE ligne : au-delà d'une certaine longueur, c'est la
 * police qui rétrécit (`useFitText`), pas le nom qui se coupe — un deck
 * tronqué ne se reconnaît plus.
 */
export function DeckNamePlate({ name, onNameChange, shipId, cardIds, artCardId, onPickArt }: DeckNamePlateProps) {
  const artUrl = artCardId ? plateArtUrl(artCardId, shipId) : nameplateArtUrl(cardIds, shipId);
  const { ref, size } = useFitText(name, NAME_MAX_PX, NAME_MIN_PX);

  return (
    <ArtPlate artUrl={artUrl} size="sm" className={styles.namePlate}>
      <div className={styles.nameRow}>
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Nom du deck"
          aria-label="Nom du deck"
          className={styles.deckName}
          style={{ fontSize: `${size}px` }}
          maxLength={60}
        />
        <button type="button" className={styles.artPick} onClick={onPickArt} title="Choisir l'illustration du deck" aria-label="Choisir l'illustration du deck">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth={1.7} />
            <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
            <circle cx="9" cy="9.5" r="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>
    </ArtPlate>
  );
}
