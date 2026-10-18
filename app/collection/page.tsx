import { CollectionScreen } from "@/features/collection/CollectionScreen";
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
  // Le rayon des préconstruits n'est plus lu ici (15/10/2026) : l'invite du
  // premier deck gratuit, seule à s'en servir, cède la place à l'annonce de
  // la PREMIÈRE MISSION, dont les starters sont accordés par le serveur
  // (`fetchOnboarding` rattrape aussi les comptes existants).
  const [{ isSignedIn, ownedCardIds, ownedCounts, ownedEditions, displayedEditions }, onboarding] = await Promise.all([
    getOwnedCardIds({ withEditions: true }),
    fetchOnboarding(),
  ]);

  return (
    <CollectionScreen
      isSignedIn={isSignedIn}
      ownedCardIds={ownedCardIds}
      ownedCounts={ownedCounts}
      ownedEditions={ownedEditions}
      displayedEditions={displayedEditions}
      showStarterMission={onboarding.showStarterMission}
      openShelf={shelfFromParams(searchParams)}
    />
  );
}
