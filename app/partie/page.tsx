import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  return <PartieScreen isSignedIn={isSignedIn} />;
}
