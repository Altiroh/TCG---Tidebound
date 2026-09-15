import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPlayerDeckLists } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { PartieScreen } from "@/features/match/PartieScreen";

export default async function PartiePage() {
  // Jouer localement ne demande pas de compte : une config Supabase absente
  // ou une session expirée dégrade simplement vers "non connecté".
  let isSignedIn = false;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isSignedIn = Boolean(user);
  } catch {
    isSignedIn = false;
  }

  const [personalDecks, catalog] = await Promise.all([isSignedIn ? listPlayerDeckLists() : [], fetchDeckCatalog()]);
  const unlockedDeckIds = [...catalog.borrowed, ...catalog.precon].filter((entry) => entry.unlocked).map((entry) => entry.deck.id);

  // `useSearchParams` (essai d'un préconstruit) impose une frontière de
  // suspense : sans elle, Next rend toute la page en client au build.
  return (
    <Suspense>
      <PartieScreen isSignedIn={isSignedIn} personalDecks={personalDecks} unlockedDeckIds={unlockedDeckIds} />
    </Suspense>
  );
}
