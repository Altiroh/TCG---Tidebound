import Link from "next/link";
import { CardBrowser } from "@/features/collection/CardBrowser";
import { THICK_TEXT_OUTLINE } from "@/features/match/cardDisplay";

export default function CollectionPage() {
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
          <p className="text-sm text-slate-200" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>
            Les 80 cartes du catalogue, pour vérifier les assets au fur et à mesure qu&apos;ils arrivent. Pas encore
            de deck personnel — ça viendra avec la collection persistée.
          </p>
          <CardBrowser />
        </main>
      </div>
    </div>
  );
}
