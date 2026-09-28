import type { Metadata } from "next";
import { CORE_SET, PRECON_DECK_LISTS } from "@/game";
import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";

export const metadata: Metadata = {
  title: "Éditeur de deck Preview · Tidebound",
  description: "Écran temporaire de réglage de l'éditeur de deck « sur le livre » (développement).",
  // Écran de développement : jamais indexé.
  robots: { index: false, follow: false },
};

/**
 * Route de laboratoire : `/game/deck-preview` — l'ÉDITEUR DE DECK ouvert
 * sur un préconstruit de 40 cartes (Le Grand Banc, comme la maquette du
 * 26/09/2026), tout le catalogue possédé. `?vide=1` pour un deck neuf.
 * Aucune lecture de session : sauvegarder échoue proprement, c'est attendu.
 */
export default function DeckPreviewRoute({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const deck = PRECON_DECK_LISTS[0]!;
  return (
    <DeckEditorScreen
      ownedCardIds={CORE_SET.map((def) => def.id)}
      ownedCounts={Object.fromEntries(CORE_SET.map((def) => [def.id, 99]))}
      initialDeck={
        searchParams.vide
          ? null
          : { id: "00000000-0000-4000-8000-00000000d3c0", name: "Cra-Poi - Swarm", shipId: deck.shipId, cardIds: [...deck.cardIds], artCardId: null, description: deck.description }
      }
    />
  );
}
