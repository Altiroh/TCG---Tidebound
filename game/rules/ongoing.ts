import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";

/**
 * EFFETS EN COURS (décision du 05/10/2026) — une Anomalie se joue « comme
 * un bris » : elle n'est pas un permanent. Celles dont le texte DURE
 * (« Pendant 2 tours… », « Jusqu'à la fin du tour… ») restent actives le
 * temps de leur effet, mais :
 *   - elles n'occupent AUCUN Slot ;
 *   - rien ne les désigne, ne les attaque ni ne les touche (« toutes les
 *     unités », « un permanent au hasard ») ;
 *   - le plateau les montre à part, près de la Marée, pas dans les rangs.
 * À la fin de leur durée, elles partent au Cimetière de leur propriétaire.
 *
 * Elles restent rangées, dans l'état, avec les cartes en jeu
 * (`PlayerState.board`) : c'est là que le moteur lit déjà les capacités,
 * durées et « une fois par tour » de tout ce qui est en jeu. Ce module dit
 * qui, parmi elles, est un vrai permanent.
 */
export function isOngoingEffect(def: CardDefinition): boolean {
  return def.type === "anomalie";
}

/** Les permanents d'un plateau — sans les effets en cours. */
export function boardPermanents<T extends { cardId: string }>(board: readonly T[]): T[] {
  return board.filter((card) => !isOngoingEffect(getCardDefinition(card.cardId)));
}

/** Slots occupés : les effets en cours n'en prennent aucun. */
export function slotsUsed(board: readonly { cardId: string }[]): number {
  return boardPermanents(board).length;
}
