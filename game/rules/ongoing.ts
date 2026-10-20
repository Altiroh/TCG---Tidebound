import { getCardDefinition } from "@/game/cards/sets/core";
import { isPermanentCard, type CardDefinition } from "@/game/cards/types";

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

/**
 * ÉQUIPEMENT ATTACHÉ (refonte du 13/10/2026) : il est rangé dans l'état avec
 * les cartes en jeu, mais il ne prend AUCUN Slot — il fait corps avec la
 * carte qu'il équipe. Rien ne le désigne comme une unité, ne l'attaque ni ne
 * le blesse ; seuls les effets qui visent « un Équipement » l'atteignent.
 */
export function isAttachedCard(def: CardDefinition): boolean {
  return def.type === "equipement";
}

/**
 * La carte, une fois jouée, OCCUPE-t-elle un Slot ? Un permanent qui se pose
 * (unité, Structure) oui ; une carte qui se résout et part au Cimetière
 * (Sort, Anomalie non permanente — Formation Prismatique), un effet en cours
 * (Anomalie qui dure) ou un Équipement (attaché à son porteur), non.
 */
export function takesBoardSlot(def: CardDefinition): boolean {
  return isPermanentCard(def) && !isOngoingEffect(def) && !isAttachedCard(def);
}

/**
 * Faut-il un emplacement LIBRE pour jouer cette carte ? Ce qui en occupe un,
 * et l'Objet classique, qui l'exige sans s'y poser (un Objet Chaîne se joue
 * même plateau plein). Même règle que `playCard` — l'écran la lit pour
 * accepter ou refuser un lâcher sur un plateau plein.
 */
export function needsFreeSlot(def: CardDefinition): boolean {
  if (def.type === "objet") return !def.chaine;
  return takesBoardSlot(def);
}

/**
 * Les permanents d'un plateau qui occupent un Slot — sans les effets en
 * cours ni les Équipements, attachés à leur porteur.
 */
export function boardPermanents<T extends { cardId: string }>(board: readonly T[]): T[] {
  return board.filter((card) => {
    const def = getCardDefinition(card.cardId);
    return !isOngoingEffect(def) && !isAttachedCard(def);
  });
}

/** Slots occupés : les effets en cours et les Équipements n'en prennent aucun. */
export function slotsUsed(board: readonly { cardId: string }[]): number {
  return boardPermanents(board).length;
}
