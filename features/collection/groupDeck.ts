import { getCardDefinition, type CardDefinition, type DeckList } from "@/game";

export interface DeckEntry {
  def: CardDefinition;
  count: number;
}

/** Regroupe les `cardIds` répétés d'un deck en (carte, quantité), triés par coût puis nom. */
export function groupDeck(deck: DeckList): DeckEntry[] {
  const counts = new Map<string, number>();
  for (const cardId of deck.cardIds) {
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([cardId, count]) => ({ def: getCardDefinition(cardId), count }))
    .sort((a, b) => a.def.cost - b.def.cost || a.def.name.localeCompare(b.def.name, "fr"));
}
