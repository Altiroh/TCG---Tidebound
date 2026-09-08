import Link from "next/link";
import { PRECONSTRUCTED_DECKS } from "@/game";
import { DeckViewer } from "@/features/collection/DeckViewer";

export default function DecksPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Decks de base système</h1>
        <Link href="/" className="text-sm text-board-accent hover:underline">
          ← Menu
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Un deck par Navire, fournis par le système. Pas encore de construction de deck personnel — à venir avec la
        collection.
      </p>
      <div className="flex flex-col gap-6">
        {PRECONSTRUCTED_DECKS.map((deck) => (
          <DeckViewer key={deck.id} deck={deck} />
        ))}
      </div>
    </main>
  );
}
