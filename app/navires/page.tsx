import Link from "next/link";
import { SHIP_SET } from "@/game";
import { ShipViewer } from "@/features/collection/ShipViewer";

export default function NaviresPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Navires</h1>
        <Link href="/" className="text-sm text-board-accent hover:underline">
          ← Menu
        </Link>
      </div>
      <p className="text-sm text-slate-400">
        Le Navire détermine comment tu survis à la mer, pas quelles cartes tu as le droit de jouer. Choisi au
        deck-building, jamais piochée.
      </p>
      <div className="flex flex-col gap-4">
        {SHIP_SET.map((ship) => (
          <ShipViewer key={ship.id} ship={ship} />
        ))}
      </div>
    </main>
  );
}
