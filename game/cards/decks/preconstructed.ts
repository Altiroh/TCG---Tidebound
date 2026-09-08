import type { CardId } from "@/game/cards/types";

/**
 * Deux decks préconstruits pour le MVP (une seule ressource, un seul
 * plateau, 2 joueurs). Chaque entrée est un cardId répété autant de fois
 * qu'il y a de copies dans le deck.
 */
export interface DeckList {
  id: string;
  name: string;
  /** Navire principal de ce deck (voir `game/environment/shipData.ts`). */
  shipId: string;
  cardIds: CardId[];
}

function repeat(cardId: CardId, copies: number): CardId[] {
  return Array.from({ length: copies }, () => cardId);
}

export const DECK_MAREE_MONTANTE: DeckList = {
  id: "maree-montante",
  name: "Marée Montante",
  shipId: "le-brise-lames",
  cardIds: [
    ...repeat("recrue-des-marees", 2),
    ...repeat("lancier-cotier", 2),
    ...repeat("veterane-des-brisants", 2),
    ...repeat("predateur-des-vagues", 2),
    ...repeat("sentinelle-du-recif", 2),
    ...repeat("eclat-de-givre", 1),
    ...repeat("vague-destructrice", 2),
    ...repeat("marque-des-abysses", 1),
    ...repeat("rugissement-de-la-maree", 1),
    ...repeat("appel-du-large", 1),
    ...repeat("poisson-lanterne", 2),
    ...repeat("voiles-affalees", 2),
  ],
};

export const DECK_ABYSSES_SILENCIEUSES: DeckList = {
  id: "abysses-silencieuses",
  name: "Abysses Silencieuses",
  shipId: "linsondable",
  cardIds: [
    ...repeat("chaman-des-courants", 2),
    ...repeat("sentinelle-du-recif", 2),
    ...repeat("leviathan-abyssal", 2),
    ...repeat("benediction-des-flots", 2),
    ...repeat("vague-destructrice", 2),
    ...repeat("tempete-cotiere", 1),
    ...repeat("renfort-imprevu", 1),
    ...repeat("appel-du-large", 1),
    ...repeat("eclat-de-givre", 1),
    ...repeat("marque-des-abysses", 2),
    ...repeat("vigie-fragile", 2),
    ...repeat("bouchons-de-cire", 2),
  ],
};

export const PRECONSTRUCTED_DECKS: readonly DeckList[] = [
  DECK_MAREE_MONTANTE,
  DECK_ABYSSES_SILENCIEUSES,
];
