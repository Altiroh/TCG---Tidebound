import Link from "next/link";
import { CardBrowser } from "@/features/collection/CardBrowser";
import { THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ViewerCollection {
  isSignedIn: boolean;
  ownedCardIds: string[];
}

/**
 * Résout la collection du joueur connecté, sans jamais faire planter la page
 * (même garde-fou que `resolveViewer` sur la page d'accueil). Un compte tout
 * juste créé n'a encore ouvert aucun booster : `player_cards` est vide et la
 * grille l'est donc aussi, volontairement — seuls les decks préconstruits
 * sont jouables en attendant.
 */
async function resolveViewerCollection(): Promise<ViewerCollection> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isSignedIn: false, ownedCardIds: [] };

    const { data } = await supabase.from("player_cards").select("card_id").eq("user_id", user.id).gt("quantity", 0);
    return { isSignedIn: true, ownedCardIds: (data ?? []).map((row) => row.card_id) };
  } catch (error) {
    console.error("[CollectionPage] Impossible de résoudre la collection du joueur :", error);
    return { isSignedIn: false, ownedCardIds: [] };
  }
}

export default async function CollectionPage() {
  const { isSignedIn, ownedCardIds } = await resolveViewerCollection();

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="min-h-screen bg-board-background/85">
        <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
          <div className="flex items-baseline justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-white" style={{ textShadow: THICK_TEXT_OUTLINE }}>
              Collection
            </h1>
            <Link
              href="/"
              className="rounded-md bg-board-surface/70 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:text-board-accent"
            >
              ← Menu
            </Link>
          </div>

          {isSignedIn ? (
            <>
              <p className="text-sm text-slate-200" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
                {ownedCardIds.length > 0
                  ? "Les cartes que tu possèdes."
                  : "Tu ne possèdes encore aucune carte : joue avec un deck préconstruit en attendant d'ouvrir des boosters."}
              </p>
              <CardBrowser ownedCardIds={ownedCardIds} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.07] p-10 text-center backdrop-blur-2xl">
              <p className="text-slate-200">Connecte-toi pour voir ta collection de cartes.</p>
              <div className="flex gap-3">
                <Link
                  href="/connexion"
                  className="rounded-md bg-board-accent px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:opacity-90"
                >
                  Se connecter
                </Link>
                <Link
                  href="/inscription"
                  className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur-md transition-colors hover:bg-white/20"
                >
                  Créer un compte
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
