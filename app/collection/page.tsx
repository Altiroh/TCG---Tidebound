import Link from "next/link";
import { CardBrowser } from "@/features/collection/CardBrowser";

export default function CollectionPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
        <Link href="/" className="text-sm text-board-accent hover:underline">
          ← Menu
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Les 80 cartes du catalogue, pour vérifier les assets au fur et à mesure qu&apos;ils arrivent. Pas encore de
        deck personnel — ça viendra avec la collection persistée.
      </p>
      <CardBrowser />
    </main>
  );
}
