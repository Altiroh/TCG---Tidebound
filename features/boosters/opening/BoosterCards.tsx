"use client";

import { memo, useMemo } from "react";
import { BoosterCard, type BoosterCardShowcase, type BoosterCardStyle } from "@/features/boosters/opening/BoosterCard";
import type { BoosterCardRevealState } from "@/features/boosters/opening/boosterOpeningMachine";
import type { BoosterOpeningTimings } from "@/features/boosters/opening/boosterOpeningTimings";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

interface BoosterCardsProps {
  cards: readonly BoosterOpeningCard[];
  states: readonly BoosterCardRevealState[];
  interactive: boolean;
  cardBackAvailable: boolean;
  timings: BoosterOpeningTimings;
  /** Gros plan en cours ou passé, par index de carte. */
  showcases: Readonly<Record<number, BoosterCardShowcase>>;
  onReveal: (index: number) => void;
  onInspect: (cardId: string) => void;
  onShowcaseDismiss: () => void;
  /**
   * Plusieurs sachets ouverts d'un coup : les cartes se posent en GRILLE de
   * `rows` lignes et `cols` colonnes par page, pages côte à côte (la scène
   * fait défiler la piste). Absent : l'éventail d'un seul sachet.
   */
  grid?: { cols: number; rows: number } | null;
  /** Page affichée de la grille : les cartes des autres pages s'estompent au bord. */
  page?: number;
}

/** Légère inclinaison propre à chaque carte pendant sa montée dans le sachet. */
const RISE_ROTATIONS = [-1.6, 1.1, -0.6, 1.5, -1.1, 0.8, -1.3, 0.5];

/**
 * Place les cartes : l'éventail final (`--slot-*`), l'ordre de sortie
 * (`--spawn-delay`) et le rythme de révélation propre à chaque rareté.
 * Les distances sont exprimées en `--u`, l'unité de la scène, pour que le
 * même calcul serve du mobile portrait au 1920×1080.
 */
export const BoosterCards = memo(function BoosterCards({
  cards,
  states,
  interactive,
  cardBackAvailable,
  timings,
  showcases,
  onReveal,
  onInspect,
  onShowcaseDismiss,
  grid = null,
  page = 0,
}: BoosterCardsProps) {
  const cardStyles = useMemo(
    () =>
      cards.map((card, index): BoosterCardStyle => {
        const timing = {
          "--rise-rot": `${RISE_ROTATIONS[index % RISE_ROTATIONS.length]}deg`,
          "--spawn-delay": `${index * timings.cardStagger}ms`,
          "--charge-dur": `${timings.revealPause[card.rarity]}ms`,
          "--flip-dur": `${timings.flip[card.rarity]}ms`,
          "--impact-dur": `${timings.revealImpact[card.rarity]}ms`,
        };
        if (grid) {
          // Page après page, chaque page remplie ligne par ligne : on lit
          // la grille comme un texte, puis on tourne la page vers la droite.
          const perPage = grid.cols * grid.rows;
          const page = Math.floor(index / perPage);
          const within = index % perPage;
          const column = page * grid.cols + (within % grid.cols) - (grid.cols - 1) / 2;
          const row = Math.floor(within / grid.cols) - (grid.rows - 1) / 2;
          return {
            "--i": index,
            "--slot-x": `calc(var(--slot-step) * ${column})`,
            "--slot-y": `calc(var(--row-y) + var(--row-step) * ${row})`,
            "--slot-rot": "0deg",
            ...timing,
          };
        }
        const offset = index - (cards.length - 1) / 2;
        return {
          "--i": index,
          "--slot-x": `calc(var(--slot-step) * ${offset})`,
          "--slot-y": `calc(var(--row-y) + var(--u) * ${(offset * offset * 0.7).toFixed(2)})`,
          "--slot-rot": `calc(var(--fan-deg) * ${offset} * 1deg)`,
          ...timing,
        };
      }),
    [cards, timings, grid],
  );

  return (
    <>
      {cards.map((card, index) => (
        <BoosterCard
          key={card.id}
          card={card}
          index={index}
          count={cards.length}
          state={states[index] ?? "hidden"}
          interactive={interactive && states[index] === "hidden"}
          cardBackAvailable={cardBackAvailable}
          cardStyle={cardStyles[index]!}
          showcase={showcases[index]}
          offPage={grid ? Math.floor(index / (grid.cols * grid.rows)) !== page : false}
          onReveal={onReveal}
          onInspect={onInspect}
          onShowcaseDismiss={onShowcaseDismiss}
        />
      ))}
    </>
  );
});
