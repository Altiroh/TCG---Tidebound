import type { CardId } from "@/game/cards/types";

/**
 * UNE LISTE DE DECK — la forme commune à tout ce qui se joue : les decks
 * fournis par le jeu (`borrowed.ts`, `precon.ts`) comme les decks montés
 * par le joueur, relus depuis la base.
 *
 * Taille : 40 à 50 cartes (`RULES.DECK_SIZE_MIN`/`DECK_SIZE_MAX`), chaque
 * entrée dans la limite d'exemplaires de SA carte (`getMaxCopies`, jamais
 * dérivée de la rareté). `validateDeckList` est le seul juge.
 */
export interface DeckList {
  id: string;
  name: string;
  /** Navire principal de ce deck (voir `game/environment/shipData.ts`). */
  shipId: string;
  /** Résumé du style de jeu, affiché à l'écran de sélection — le joueur doit savoir ce que le deck fait avant de le choisir, pas juste son nom. */
  description: string;
  cardIds: CardId[];
  /**
   * Deck PERSONNEL marqué « par défaut » par le joueur : présélectionné à
   * l'écran Jouer. Jamais posé sur une liste du catalogue.
   */
  isDefault?: boolean;
}

/** N exemplaires d'une carte, pour écrire une liste comme on la lit. */
export function repeat(cardId: CardId, copies: number): CardId[] {
  return Array.from({ length: copies }, () => cardId);
}
