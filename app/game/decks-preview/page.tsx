import type { Metadata } from "next";
import { PRECON_DECKS, deckOwnership } from "@/game";
import type { PlayerDeckSummary } from "@/app/decks/actions";
import { DecksScreen } from "@/features/decks/DecksScreen";

export const metadata: Metadata = {
  title: "Decks Preview · Tidebound",
  description: "Écran temporaire de réglage de la table des decks (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/** Un deck « du joueur » fabriqué à partir d'un préconstruit : le contenu d'une vraie liste, rien en base. */
function fakeDeck(index: number): PlayerDeckSummary {
  const source = PRECON_DECKS[index % PRECON_DECKS.length]!;
  const counts = new Map<string, number>();
  for (const cardId of source.cardIds) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  const date = new Date(Date.UTC(2026, 8, 20 - index)).toISOString();
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: index === 0 ? "Deck du labo" : `${source.name} ${index}`,
    shipId: source.shipId,
    cardCount: source.cardIds.length,
    isValid: true,
    deletedAt: null,
    isDefault: index === 0,
    headerCardIds: source.cardIds.slice(0, 5),
    artCardId: source.cardIds[0] ?? null,
    artCardChosen: null,
    cards: [...counts].map(([cardId, quantity]) => ({ cardId, quantity })),
    description: source.description,
    profile: { styleId: null, difficulty: null, mechanics: null },
    createdAt: date,
    updatedAt: date,
  };
}

/**
 * Route de laboratoire : `/game/decks-preview` — la TABLE DES DECKS
 * (`DecksScreen`) avec sept decks personnels fabriqués et tout le rayon des
 * préconstruits. Aucune lecture de session : les actions (renommer,
 * dupliquer…) échouent proprement, c'est attendu.
 */
export default function DecksPreviewRoute() {
  const allOwned = Object.fromEntries(PRECON_DECKS.flatMap((deck) => deck.cardIds).map((cardId) => [cardId, 9]));
  return (
    <DecksScreen
      isSignedIn
      initialDecks={Array.from({ length: 7 }, (_, index) => fakeDeck(index))}
      catalog={{
        decks: PRECON_DECKS.map((deck, index) => ({ deck, ownership: deckOwnership(deck.cardIds, allOwned), unlocked: index < 2 })),
        freeDeckId: PRECON_DECKS[0]!.id,
        preconTokens: 1,
      }}
    />
  );
}
