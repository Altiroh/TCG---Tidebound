import { CollectionScreen } from "@/features/collection/CollectionScreen";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";

export default async function CollectionPage() {
  const [{ isSignedIn, ownedCardIds, ownedCounts }, catalog, onboarding] = await Promise.all([
    getOwnedCardIds(),
    fetchDeckCatalog(),
    fetchOnboarding(),
  ]);

  return (
    <CollectionScreen
      isSignedIn={isSignedIn}
      ownedCardIds={ownedCardIds}
      ownedCounts={ownedCounts}
      catalog={catalog}
      needsFirstDeck={onboarding.needsFirstDeck}
    />
  );
}
