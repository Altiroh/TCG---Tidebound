"use client";

import { useMemo } from "react";
import { getCardDefinition } from "@/game";
import { cardIllustrationUrl, signatureCardId } from "@/features/decks/nameplateArt";
import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DeckBuilder.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckArtPickerProps {
  /** Cartes du deck — les seules proposées : la plaque doit dire ce que le deck contient. */
  cardIds: readonly string[];
  /** Choix courant, ou `null` si la règle par défaut s'applique. */
  artCardId: string | null;
  onChoose: (cardId: string | null) => void;
  onClose: () => void;
}

/** Nom lisible d'une carte, son identifiant à défaut — jamais d'exception à l'affichage. */
function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * Choix de l'illustration du deck.
 *
 * La plaque tirait son image d'une règle — la carte la plus CHÈRE — sans
 * qu'on puisse y toucher. Déterministe et jamais vide, mais imposée : deux
 * decks bâtis autour de la même grosse carte se ressemblaient, et la carte
 * qui fait vraiment l'identité du deck n'avait aucun moyen d'être mise en
 * avant.
 *
 * Seules les cartes DU DECK sont proposées : une plaque qui montrerait une
 * carte absente mentirait sur son contenu. « Choix automatique » reste
 * offert, et c'est le comportement par défaut.
 */
export function DeckArtPicker({ cardIds, artCardId, onChoose, onClose }: DeckArtPickerProps) {
  const options = useMemo(
    () =>
      [...new Set(cardIds)]
        .map((cardId) => ({ cardId, name: cardName(cardId) }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [cardIds]
  );
  const automatic = useMemo(() => signatureCardId(cardIds), [cardIds]);

  return (
    <Dialog
      title="Illustration du deck"
      width={820}
      onClose={onClose}
      actions={
        <button
          type="button"
          className={artCardId === null ? game.primary : game.secondary}
          onClick={() => {
            playButtonClick();
            onChoose(null);
          }}
        >
          Choix automatique{automatic ? ` (${cardName(automatic)})` : ""}
        </button>
      }
    >
      {options.length === 0 ? (
        <p className={game.muted}>Ajoute des cartes au deck : c&apos;est parmi elles que se choisit son illustration.</p>
      ) : (
        <div className={styles.artPicker}>
          {options.map(({ cardId, name }) => (
            <button
              key={cardId}
              type="button"
              className={`${styles.artOption} ${cardId === artCardId ? styles.artOptionActive : ""}`}
              onClick={() => {
                playButtonClick();
                onChoose(cardId);
              }}
              title={name}
            >
              <span className={styles.artOptionArt} style={{ backgroundImage: `url("${cardIllustrationUrl(cardId)}")` }} aria-hidden />
              <span className={styles.artOptionName}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
