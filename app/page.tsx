import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/connexion/actions";
import { MenuPanel, type MenuPanelItem } from "@/components/ui/MenuPanel";

const MENU_ITEMS: MenuPanelItem[] = [
  { href: "/partie", label: "Jouer" },
  { href: "/collection", label: "Collection" },
  { href: "/decks", label: "Decks" },
  { href: "/navires", label: "Navires" },
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

  const items: MenuPanelItem[] = [
    user ? { href: "/en-ligne", label: "Jouer en ligne" } : { href: "/connexion", label: "Connexion" },
    ...MENU_ITEMS,
    { href: "#", label: "Construction de deck", disabled: true },
  ];

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-10 bg-cover bg-center p-8 text-center"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/55" />

      <div className="relative">
        <h1 className="text-5xl font-bold tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">Tidebound</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-200 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          Tu ne combats pas seulement ton adversaire. Vous affrontez tous les deux la même mer.
        </p>
      </div>

      <div className="relative">
        <MenuPanel items={items} />
      </div>

      <p className="relative text-xs text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {user ? (
          <>
            Connecté en tant que <span className="text-slate-100">{displayName}</span> ·{" "}
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
