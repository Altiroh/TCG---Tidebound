import { DeckEditorScreen } from "@/features/decks/DeckEditorScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";
import { styledUnlockedFrom } from "@/lib/supabase/cardEditions";

/** Création d'un deck personnel — même éditeur que `/decks/[deckId]`, sans deck initial (première sauvegarde = création). */
export default async function NouveauDeckPage() {
  const { ownedCardIds, ownedCounts, ownedEditions } = await getOwnedCardIds({ withEditions: true });

  return <DeckEditorScreen ownedCardIds={ownedCardIds} ownedCounts={ownedCounts} ownedEditions={ownedEditions} styledCardIds={styledUnlockedFrom(ownedEditions)} initialDeck={null} />;
}
