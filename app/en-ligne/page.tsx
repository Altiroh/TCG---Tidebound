import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPlayerDeckLists } from "@/app/decks/actions";
import { readPlayableCatalogDecks } from "@/features/decks/catalogService";
import { QuickMatchPanel } from "@/features/matchmaking/QuickMatchPanel";
import { CreateMatchForm } from "@/features/online/CreateMatchForm";
import { JoinMatchForm } from "@/features/online/JoinMatchForm";

export default async function EnLignePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Decks engageables : ceux que le jeu lui a débloqués, et les siens. Même
  // ensemble que ce que `resolveMatchDeck` acceptera côté serveur — proposer
  // un deck qu'il refuserait ensuite serait une impasse.
  const [catalogDecks, personalDecks] = await Promise.all([readPlayableCatalogDecks(user.id), listPlayerDeckLists()]);
  const decks = [...catalogDecks, ...personalDecks].map((deck) => ({ id: deck.id, name: deck.name }));

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Jouer en ligne</h1>
        <p className="mt-2 text-sm text-slate-400">Recherche rapide, ou partie privée par code d&apos;invitation.</p>
      </div>

      <QuickMatchPanel decks={decks} />

      <div className="flex w-full flex-col gap-6 sm:flex-row">
        <CreateMatchForm />
        <JoinMatchForm />
      </div>

      <Link href="/" className="text-sm text-board-accent hover:underline">
        ← Menu
      </Link>
    </main>
  );
}
