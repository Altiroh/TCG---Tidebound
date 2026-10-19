"use client";

import { useMemo } from "react";
import { getCardDefinition } from "@/game";
import { cardIllustrationThumbUrl, signatureCardId } from "@/features/decks/nameplateArt";
import { cardArtworkThumbUrl } from "@/features/decks/cardArtUrl";
import type { ChosenArtwork } from "@/game/cosmetics/artworks";
import { SidePanel } from "@/features/shell/SidePanel";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DeckBuilder.module.css";
import { playButtonClick } from "@/lib/sound";

interface DeckArtPickerProps {
  /** Cartes du deck — les seules proposées : la plaque doit dire ce que le deck contient. */
  cardIds: readonly string[];
  /** Choix courant, ou `null` si la règle par défaut s'applique. */
  artCardId: string | null;
  /** Illustration de la carte choisie. */
  artArtwork?: ChosenArtwork;
  /** Cartes dont la Styled est débloquée (Styled ou Full-Art obtenue) : proposées EN PLUS de leur Classique. */
  styledCardIds?: readonly string[];
  onChoose: (cardId: string | null, artwork: ChosenArtwork) => void;
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
 * offert, et c'est le comportement par défaut. Une carte dont la Styled
 * est débloquée (obtenue, ou sa Full-Art obtenue) se propose aussi en Styled.
 *
 * PANNEAU LATÉRAL (15/10/2026), comme le Courrier et les Options : le deck
 * reste visible à gauche pendant qu'on choisit.
 */
export function DeckArtPicker({ cardIds, artCardId, artArtwork = "classique", styledCardIds = [], onChoose, onClose }: DeckArtPickerProps) {
  const options = useMemo(() => {
    const styled = new Set(styledCardIds);
    return [...new Set(cardIds)]
      .map((cardId) => ({ cardId, name: cardName(cardId) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .flatMap(({ cardId, name }) => [
        { cardId, name, artwork: "classique" as ChosenArtwork },
        ...(styled.has(cardId) ? [{ cardId, name, artwork: "styled" as ChosenArtwork }] : []),
      ]);
  }, [cardIds, styledCardIds]);
  const automatic = useMemo(() => signatureCardId(cardIds), [cardIds]);

  return (
    <SidePanel title="Illustration du deck" onClose={onClose}>
      <button
        type="button"
        className={`${artCardId === null ? game.primary : game.secondary} ${styles.artAutomatic}`}
        onClick={() => {
          playButtonClick();
          onChoose(null, "classique");
        }}
      >
        Choix automatique{automatic ? ` (${cardName(automatic)})` : ""}
      </button>
      {options.length === 0 ? (
        <p className={game.muted}>Ajoute des cartes au deck : c&apos;est parmi elles que se choisit son illustration.</p>
      ) : (
        <div className={styles.artPicker}>
          {options.map(({ cardId, name, artwork }) => (
            <button
              key={`${cardId}/${artwork}`}
              type="button"
              className={`${styles.artOption} ${cardId === artCardId && artwork === artArtwork ? styles.artOptionActive : ""}`}
              onClick={() => {
                playButtonClick();
                onChoose(cardId, artwork);
              }}
              title={artwork === "styled" ? `${name} — Styled` : name}
            >
              <span
                className={styles.artOptionArt}
                style={{ backgroundImage: `url("${artwork === "styled" ? cardArtworkThumbUrl(cardId, "styled") : cardIllustrationThumbUrl(cardId)}")` }}
                aria-hidden
              >
                {artwork === "styled" && <span className={styles.artOptionStyled}>S</span>}
              </span>
              <span className={styles.artOptionName}>{name}</span>
            </button>
          ))}
        </div>
      )}
    </SidePanel>
  );
}
