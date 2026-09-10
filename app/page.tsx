import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/connexion/actions";
import { TideboundMenuChest } from "@/components/menu/TideboundMenuChest";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    displayName = profile?.display_name ?? user.email ?? null;
  }

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/35" />

      <div className="relative z-10 w-full">
        <TideboundMenuChest />
      </div>

      <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-xs text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {user ? (
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
