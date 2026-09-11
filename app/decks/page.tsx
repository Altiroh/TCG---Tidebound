import { listPlayerDecks } from "@/app/decks/actions";
import { DecksScreen } from "@/features/decks/DecksScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function resolveIsSignedIn(): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch (error) {
    console.error("[DecksPage] Impossible de résoudre l'utilisateur connecté :", error);
    return false;
  }
}

export default async function DecksPage() {
  const isSignedIn = await resolveIsSignedIn();
  const initialDecks = isSignedIn ? await listPlayerDecks() : [];

  return <DecksScreen isSignedIn={isSignedIn} initialDecks={initialDecks} />;
}
