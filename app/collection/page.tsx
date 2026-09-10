import Link from "next/link";
import { CardBrowser } from "@/features/collection/CardBrowser";

export default function CollectionPage() {
  return (
    <>
      <div aria-hidden className="fixed inset-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- calque de fond plein écran, cf. features/match/BoardBackdrop.tsx pour le raisonnement (img plutôt que background-image CSS) */}
        <img
          src="/assets/collection/background.jpg"
          alt=""
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(6,10,18,0.55), rgba(6,10,18,0.82))" }} />
      </div>
      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
          <Link href="/" className="text-sm text-board-accent hover:underline">
            ← Menu
          </Link>
        </div>
        <p className="text-sm text-slate-400">
          Les 81 cartes du catalogue, pour vérifier les assets au fur et à mesure qu&apos;ils arrivent. Pas encore de
          deck personnel — ça viendra avec la collection persistée.
        </p>
        <CardBrowser />
      </main>
    </>
  );
}
