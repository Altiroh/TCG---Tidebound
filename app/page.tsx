import Link from "next/link";
import type { Route } from "next";

const MENU_ITEMS: Array<{ href: Route; label: string; description: string }> = [
  { href: "/partie" as Route, label: "Jouer", description: "Partie locale (hot-seat), à tour de rôle sur cet écran." },
  { href: "/decks" as Route, label: "Decks", description: "Consulter les decks de base système." },
  { href: "/navires" as Route, label: "Navires", description: "Consulter les Navires et leurs particularités." },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
      <div>
        <h1 className="text-5xl font-bold tracking-tight">Tidebound</h1>
        <p className="mt-3 max-w-md text-sm text-slate-400">
          Tu ne combats pas seulement ton adversaire. Vous affrontez tous les deux la même mer.
        </p>
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-3">
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
    </main>
  );
}
