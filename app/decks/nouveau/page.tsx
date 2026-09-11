import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";

/** Création d'un deck personnel — même éditeur que `/decks/[deckId]`, sans deck initial (première sauvegarde = création). */
export default async function NouveauDeckPage() {
  const { ownedCardIds } = await getOwnedCardIds();

  return <DeckEditorScreen ownedCardIds={ownedCardIds} initialDeck={null} />;
}
