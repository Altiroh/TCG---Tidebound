import Link from "next/link";
import { SHIP_SET } from "@/game";
import { ShipViewer } from "@/features/collection/ShipViewer";

export default function NaviresPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-6 py-8 pl-[max(2rem,var(--tb-safe-left))] pr-[max(2rem,var(--tb-safe-right))] [@media(max-height:560px)]:max-w-none [@media(max-height:560px)]:gap-4 [@media(max-height:560px)]:py-4">
      {/* Téléphone couché (≤ 560 px de haut) : marges tirées des zones sûres
          (encoche), deux Navires par rangée — un seul par écran sinon. */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Navires</h1>
        <Link href="/" className="-my-3 py-3 text-sm text-board-accent hover:underline">
          ← Menu
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Le Navire détermine comment tu survis à la mer, pas quelles cartes tu as le droit de jouer. Choisi au
        deck-building, jamais piochée.
      </p>
      <div className="grid gap-4 [@media(max-height:560px)]:grid-cols-2">
        {SHIP_SET.map((ship) => (
          <ShipViewer key={ship.id} ship={ship} />
        ))}
      </div>
    </main>
  );
}
