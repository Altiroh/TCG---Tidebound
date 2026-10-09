"use client";

import type { CSSProperties, ReactNode } from "react";
import type { PlayerId } from "@/game";
import { useCardBackSrcFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import styles from "@/features/match/table/Table.module.css";
import type { BoardDropState } from "@/features/match/table/TableRow";

/**
 * Même dos que le vrai plateau : celui que le joueur a équipé
 * (`features/cosmetics/CardBackProvider.tsx`). Le bac à sable visuel doit
 * montrer ce que la partie montrera, cosmétique compris.
 */
export { useCardBackSrc as usePreviewCardBack } from "@/features/cosmetics/CardBackProvider";

interface PreviewCargoProps {
  /** Camp : sert de repère aux vols de cartes (`data-deck`, `data-graveyard`). */
  side: "player" | "opponent";
  /** Propriétaire de la pioche : c'est SON dos de carte qui la coiffe. Absent (labo) : le dos local. */
  ownerId?: PlayerId;
  deck: number;
  graveyard: number;
  /**
   * Dernière carte défaussée, en tuile de plateau (`CardTile variant="board"`),
   * posée ASSOMBRIE sous le crâne : on voit ce qui vient de tomber sans ouvrir
   * la consultation. Absent (pile vide, labo) : le creux seul.
   */
  graveyardTop?: ReactNode;
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
export function TableCargo({ side, ownerId, deck, graveyard, graveyardTop, graveyardDropState, onDraw, onGraveyardClick }: PreviewCargoProps) {
  const cardBack = useCardBackSrcFor(ownerId);
  // Épaisseur de chaque pile, 0 → 1 : une carte seule n'a pas de tranche,
  // la pioche s'amincit à mesure qu'on pioche (pleine vers 30 cartes, le
  // Cimetière vers 20). Lue par le décor du pont (`--pile-depth`).
  const deckDepth = { "--pile-depth": Math.min(1, Math.max(0, deck - 1) / 30) } as CSSProperties;
  const graveyardDepth = Math.min(1, Math.max(0, graveyard - 1) / 20);

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
          style={deckDepth}
          data-deck={side}
          onClick={onDraw}
          disabled={deck === 0}
          title="Piocher une carte"
          aria-label={`Piocher une carte (${deck} restantes)`}
        >
          {deckContent}
        </button>
      ) : (
        <div className={styles.cargoDeck} data-deck={side} title="Pioche" style={deckDepth}>
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
        style={{ "--pile-depth": graveyardDepth, ...(onGraveyardClick ? { cursor: "var(--tb-cursor-pointer)" } : {}) } as CSSProperties}
        data-drop={graveyardDropState ? "graveyard" : undefined}
      >
        {graveyard > 0 && graveyardTop && (
          <span className={styles.graveyardTop} aria-hidden>
            {graveyardTop}
          </span>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element -- icône décorative */}
        <img src="/assets/board/graveyard-skull.webp" alt="" aria-hidden draggable={false} className={styles.graveyardSkull} />
        {/* Plaque gravée : la pile se lit « Cimetière » au premier coup d'œil, même coiffée d'une carte. */}
        <span className={styles.graveyardLabel} aria-hidden>
          Cimetière
        </span>
        <span className={styles.pileCount}>{graveyard}</span>
      </div>
    </div>
  );
}
