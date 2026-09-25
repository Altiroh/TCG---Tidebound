import { listDeckFavorites, listPlayerDecks } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { DecksScreen } from "@/features/decks/DecksScreen";
import { readRecentlyPlayedDecks } from "@/features/decks/recentDecks";
import { getSessionUser } from "@/lib/supabase/sessionUser";

async function resolveUserId(): Promise<string | null> {
  try {
    const user = await getSessionUser();
    return user?.id ?? null;
  } catch (error) {
    console.error("[DecksPage] Impossible de résoudre l'utilisateur connecté :", error);
    return null;
  }
}

export default async function DecksPage() {
  const userId = await resolveUserId();
  const isSignedIn = userId !== null;
  // Le catalogue est lu même hors connexion : les decks fournis par le jeu
  // sont consultables sans compte (§4, « les préconstruits verrouillés
  // doivent rester visibles »). Seule la possession est alors vide.
  const [initialDecks, catalog, recent, favorites] = await Promise.all([
    isSignedIn ? listPlayerDecks() : [],
    fetchDeckCatalog(),
    userId ? readRecentlyPlayedDecks(userId) : [],
    isSignedIn ? listDeckFavorites() : null,
  ]);

  return (
    <DecksScreen
      isSignedIn={isSignedIn}
      initialDecks={initialDecks}
      catalog={catalog}
      recentDeckIds={recent.map((entry) => entry.deckId)}
      accountFavorites={favorites}
    />
  );
}
