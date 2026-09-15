import { listPlayerDecks } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { DecksScreen } from "@/features/decks/DecksScreen";
import { getSessionUser } from "@/lib/supabase/sessionUser";

async function resolveIsSignedIn(): Promise<boolean> {
  try {
    const user = await getSessionUser();
    return Boolean(user);
  } catch (error) {
    console.error("[DecksPage] Impossible de résoudre l'utilisateur connecté :", error);
    return false;
  }
}

export default async function DecksPage() {
  const isSignedIn = await resolveIsSignedIn();
  // Le catalogue est lu même hors connexion : les decks fournis par le jeu
  // sont consultables sans compte (§4, « les préconstruits verrouillés
  // doivent rester visibles »). Seule la possession est alors vide.
  const [initialDecks, catalog] = await Promise.all([isSignedIn ? listPlayerDecks() : [], fetchDeckCatalog()]);

  return <DecksScreen isSignedIn={isSignedIn} initialDecks={initialDecks} catalog={catalog} />;
}
