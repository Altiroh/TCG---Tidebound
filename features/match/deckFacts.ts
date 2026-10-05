import { deckProfile, deckStyleFromText, type DeckList, type DeckStyleId } from "@/game";

/** Une source de decks du panneau « Changer de deck » (Mes decks, Préconstruits). */
export interface DeckSource {
  id: string;
  label: string;
  decks: readonly DeckList[];
  /** Pourquoi un deck n'est pas jouable — la tuile reste visible, éteinte, avec la raison. */
  issueFor: (deck: DeckList) => string | null;
}

/** Style (énumération), libellé écrit et difficulté (1 à 5) d'un deck — écrits pour le catalogue, lus dans la liste sinon. */
export function deckFacts(deck: DeckList): { styleId: DeckStyleId | null; style: string; difficulty: number } {
  const meta = deck as Partial<{ style: string; difficulty: number }>;
  if (typeof meta.style === "string" && typeof meta.difficulty === "number") {
    return { styleId: deckStyleFromText(meta.style), style: meta.style, difficulty: meta.difficulty };
  }
  const profile = deckProfile(deck.cardIds);
  return { styleId: profile?.styleId ?? null, style: profile?.style ?? "Deck personnel", difficulty: profile?.difficulty ?? 3 };
}
