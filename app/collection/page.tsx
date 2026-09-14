import { CollectionScreen } from "@/features/collection/CollectionScreen";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";

export default async function CollectionPage() {
  const { isSignedIn, ownedCardIds, ownedCounts } = await getOwnedCardIds();

  return <CollectionScreen isSignedIn={isSignedIn} ownedCardIds={ownedCardIds} ownedCounts={ownedCounts} />;
}
