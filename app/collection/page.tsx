import { CollectionScreen } from "@/features/collection/CollectionScreen";
import { readDeckCatalogSummary } from "@/features/decks/catalogSummary";
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
  // `player_cards` n'est lu qu'UNE fois : le rayon des préconstruits calcule
  // sa possession sur la collection que la page lit déjà (hors connexion
  // ou lecture en échec, il relit lui-même).
  const collectionPromise = getOwnedCardIds();
  const [{ isSignedIn, ownedCardIds, ownedCounts }, catalog, onboarding] = await Promise.all([
    collectionPromise,
    readDeckCatalogSummary(collectionPromise.then((collection) => (collection.isSignedIn ? collection.ownedCounts : null))),
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
