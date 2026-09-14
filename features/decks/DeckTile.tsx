"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerDeckSummary } from "@/app/decks/actions";
import styles from "@/features/decks/DeckScreens.module.css";

const EMPTY_SLOT_SRC = "/assets/collection/card_empty_placeholder.webp";

/** Éventail statique des premières cartes du deck — l'OBJET de la tuile. */
function DeckStack({ cardIds }: { cardIds: string[] }) {
  if (cardIds.length === 0) {
    return (
      <div className={styles.deckStack}>
        <div className={styles.deckStackEmpty}>
          {/* eslint-disable-next-line @next/next/no-img-element -- asset local, silhouette décorative */}
          <img src={EMPTY_SLOT_SRC} alt="" draggable={false} />
        </div>
      </div>
    );
  }

  const count = cardIds.length;
  return (
    <div className={styles.deckStack}>
      {cardIds.map((cardId, index) => {
        const offsetFromCenter = index - (count - 1) / 2;
        return (
          <div
            key={`${cardId}-${index}`}
            className={styles.deckStackCard}
            style={{
              // `translateX(-50%)` centre la carte, le reste ouvre l'éventail :
              // décalage latéral + rotation croissants depuis le centre de la pile.
              // 22%/6° par cran : à 5 cartes l'éventail reste dans la largeur de
              // la tuile, là où 34%/9° le faisait mordre sur la tuile voisine.
              transform: `translateX(-50%) translateX(${offsetFromCenter * 22}%) rotate(${offsetFromCenter * 6}deg)`,
              zIndex: index,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- vignette d'aperçu, pas une CardTile complète */}
            <img src={`/assets/cards/illustrations/${cardId}.webp`} alt="" draggable={false} loading="lazy" decoding="async" />
          </div>
        );
      })}
    </div>
  );
}

interface DeckTileProps {
  deck: PlayerDeckSummary;
  shipName: string;
  isRenaming: boolean;
  onRenameSubmit: (name: string) => void;
  onRenameCancel: () => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

/**
 * Une tuile de la liste des decks. Aucune boîte : ce qu'on voit est la pile
 * de cartes en éventail — l'objet physique posé sur le papier — puis le nom
 * et la ligne d'information ÉCRITS sur le papier en dessous.
 *
 * Au survol, seule la pile se soulève (même spécification que les cartes de
 * la Collection) ; le nom, qui est de l'encre, ne fait que s'assombrir.
 * C'est ce qui rend la hiérarchie lisible : l'objet est manipulable, le
 * texte non.
 */
export function DeckTile({ deck, shipName, isRenaming, onRenameSubmit, onRenameCancel, onOpen, onContextMenu }: DeckTileProps) {
  const [draftName, setDraftName] = useState(deck.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setDraftName(deck.name);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming, deck.name]);

  return (
    <button
      type="button"
      onClick={isRenaming ? undefined : onOpen}
      onContextMenu={onContextMenu}
      className={styles.deckTile}
      title={isRenaming ? undefined : `Éditer « ${deck.name} »`}
    >
      <DeckStack cardIds={deck.headerCardIds} />

      {isRenaming ? (
        <input
          ref={inputRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit(draftName);
            if (e.key === "Escape") onRenameCancel();
          }}
          onBlur={() => onRenameSubmit(draftName)}
          className={styles.deckRenameInput}
          aria-label="Nom du deck"
        />
      ) : (
        <span className={styles.deckName}>{deck.name}</span>
      )}

      <span className={styles.deckMeta}>
        {shipName} · {deck.cardCount} carte{deck.cardCount > 1 ? "s" : ""}
      </span>
    </button>
  );
}
