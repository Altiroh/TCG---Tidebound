import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/connexion/actions";

const MENU_ITEMS = [
  { href: "/partie", label: "Jouer", description: "Partie locale (hot-seat), à tour de rôle sur cet écran." },
  { href: "/decks", label: "Decks", description: "Consulter les decks de base système." },
  { href: "/navires", label: "Navires", description: "Consulter les Navires et leurs particularités." },
];

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
      <div>
        <h1 className="text-5xl font-bold tracking-tight">Tidebound</h1>
        <p className="mt-3 max-w-md text-sm text-slate-400">
          Tu ne combats pas seulement ton adversaire. Vous affrontez tous les deux la même mer.
        </p>
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-3">
        {user ? (
          <Link
            href="/en-ligne"
            className="rounded-md border border-board-accent bg-board-accent/10 px-5 py-3 text-left transition-colors hover:bg-board-accent/20"
          >
            <span className="block text-base font-medium text-board-accent">Jouer en ligne</span>
            <span className="block text-xs text-slate-400">Partie privée par code d&apos;invitation.</span>
          </Link>
        ) : (
          <Link
            href="/connexion"
            className="rounded-md border border-board-accent bg-board-accent/10 px-5 py-3 text-left transition-colors hover:bg-board-accent/20"
          >
            <span className="block text-base font-medium text-board-accent">Se connecter pour jouer en ligne</span>
            <span className="block text-xs text-slate-400">Lien magique par email, pas de mot de passe.</span>
          </Link>
        )}

        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md border border-slate-800 bg-board-surface px-5 py-3 text-left transition-colors hover:border-board-accent"
          >
            <span className="block text-base font-medium text-slate-100">{item.label}</span>
            <span className="block text-xs text-slate-500">{item.description}</span>
          </Link>
        ))}
        <span className="mt-1 cursor-not-allowed rounded-md border border-dashed border-slate-800 px-5 py-3 text-left text-slate-600">
          <span className="block text-base font-medium">Collection</span>
          <span className="block text-xs">Bientôt — construction de deck personnel, boosters.</span>
        </span>
      </nav>

      <p className="text-xs text-slate-500">
        {user ? (
          <>
            Connecté en tant que <span className="text-slate-300">{displayName}</span> ·{" "}
            <form action={signOut} className="inline">
              <button type="submit" className="text-board-accent hover:underline">
                Se déconnecter
              </button>
            </form>
          </>
        ) : (
          "Non connecté"
        )}
      </p>
    </main>
  );
}
