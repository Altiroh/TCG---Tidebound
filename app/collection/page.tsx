import { CollectionScreen } from "@/features/collection/CollectionScreen";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { fetchOnboarding } from "@/features/onboarding/actions";
import { decodeShelfFilter, FAVORITES_FILTER, notebookFilter, type ShelfFilter } from "@/features/collection/shelf/shelf";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";

/** `?carnet=<id>` ouvre un carnet, `?favoris` les favoris — les liens du mur des carnets. */
function shelfFromParams(searchParams: Record<string, string | string[] | undefined>): ShelfFilter | undefined {
  if (searchParams.favoris !== undefined) return FAVORITES_FILTER;
  const carnet = searchParams.carnet;
  if (typeof carnet !== "string") return undefined;
  return decodeShelfFilter(notebookFilter(carnet)) ?? undefined;
}

export default async function CollectionPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
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
      openShelf={shelfFromParams(searchParams)}
    />
  );
}
