import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/connexion/actions";
import { TideboundMenuChest } from "@/components/menu/TideboundMenuChest";
import { AuthGateModal } from "@/components/auth/AuthGateModal";

/**
 * Résout l'utilisateur connecté, sans jamais faire planter la page
 * d'accueil : une config Supabase manquante/invalide dégrade juste vers
 * "non connecté" (le menu marche toujours en local) plutôt qu'un 500 sur
 * la toute première page vue par n'importe quel visiteur.
 */
async function resolveViewer(): Promise<{ displayName: string | null; isSignedIn: boolean }> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { displayName: null, isSignedIn: false };

    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    return { displayName: profile?.display_name ?? user.email ?? null, isSignedIn: true };
  } catch (error) {
    console.error("[HomePage] Impossible de résoudre l'utilisateur connecté :", error);
    return { displayName: null, isSignedIn: false };
  }
}

export default async function HomePage() {
  const { displayName, isSignedIn } = await resolveViewer();

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/35" />

      <AuthGateModal isSignedIn={isSignedIn} />

      <div className="relative z-10 w-full">
        <TideboundMenuChest />
      </div>

      <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-xs text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {isSignedIn ? (
          <>
            Connecté en tant que <span className="text-slate-100">{displayName}</span> ·{" "}
            <Link href="/en-ligne" className="text-board-accent hover:underline">
              Jouer en ligne
            </Link>{" "}
            ·{" "}
            <form action={signOut} className="inline">
              <button type="submit" className="text-board-accent hover:underline">
                Se déconnecter
              </button>
            </form>
          </>
        ) : (
          <Link href="/connexion" className="text-board-accent hover:underline">
            Connexion (pour jouer en ligne)
          </Link>
        )}
      </p>
    </main>
  );
}
