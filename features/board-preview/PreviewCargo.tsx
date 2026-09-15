"use client";

import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import styles from "@/features/board-preview/BoardPreview.module.css";
import type { BoardDropState } from "@/features/board-preview/PreviewBoard";

/**
 * Même dos que le vrai plateau : celui que le joueur a équipé
 * (`features/cosmetics/CardBackProvider.tsx`). Le bac à sable visuel doit
 * montrer ce que la partie montrera, cosmétique compris.
 */
export { useCardBackSrc as usePreviewCardBack } from "@/features/cosmetics/CardBackProvider";

interface PreviewCargoProps {
  /** Camp : sert de repère aux vols de cartes (`data-deck`, `data-graveyard`). */
  side: "player" | "opponent";
  deck: number;
  graveyard: number;
  /** Crâne du joueur : zone de Sabordage (`data-drop="graveyard"`). Absent = crâne inerte (adversaire). */
  graveyardDropState?: BoardDropState;
  /** Pioche cliquable (joueur) : pioche une carte. */
  onDraw?: () => void;
  /** Défausse cliquable : ouvre sa consultation. */
  onGraveyardClick?: () => void;
}

/**
 * Pioche et défausse d'un camp, au bout de sa rangée de plateau : deux piles
 * à la taille exacte d'une carte en jeu (`--card-w`) — la pioche montre le dos
 * de carte, la défausse un creux marqué du crâne (repris de `cargo-frame.webp`).
 */
export function PreviewCargo({ side, deck, graveyard, graveyardDropState, onDraw, onGraveyardClick }: PreviewCargoProps) {
  const cardBack = useCardBackSrc();

  const deckContent = (
    <>
      {deck > 0 && (
        // eslint-disable-next-line @next/next/no-img-element -- dos de carte standard
        <img src={cardBack} alt="" aria-hidden draggable={false} className={styles.fillCover} />
      )}
      <span className={styles.pileCount}>{deck}</span>
    </>
  );

  return (
    <div className={styles.cargo}>
      {onDraw ? (
        <button
          type="button"
          className={`${styles.cargoDeck} ${styles.cargoDeckButton}`}
          data-deck={side}
          onClick={onDraw}
          disabled={deck === 0}
          title="Piocher une carte"
          aria-label={`Piocher une carte (${deck} restantes)`}
        >
          {deckContent}
        </button>
      ) : (
        <div className={styles.cargoDeck} data-deck={side} title="Pioche">
          {deckContent}
        </div>
      )}
      <div
        className={`${styles.cargoGraveyard} ${graveyardDropState && graveyardDropState !== "idle" ? styles.graveyardReady : ""} ${
          graveyardDropState === "over" ? styles.graveyardOver : ""
        }`}
        title={onGraveyardClick ? "Défausse — cliquer pour consulter" : "Défausse"}
        data-graveyard={side}
        onClick={onGraveyardClick}
        role={onGraveyardClick ? "button" : undefined}
        style={onGraveyardClick ? { cursor: "pointer" } : undefined}
        data-drop={graveyardDropState ? "graveyard" : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- icône décorative */}
        <img src="/assets/board/graveyard-skull.webp" alt="" aria-hidden draggable={false} className={styles.graveyardSkull} />
        <span className={styles.pileCount}>{graveyard}</span>
      </div>
    </div>
  );
}
