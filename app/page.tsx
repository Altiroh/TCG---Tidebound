export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Tidebound</h1>
      <p className="max-w-md text-slate-400">
        Bootstrap du projet. Le moteur de jeu vit dans{" "}
        <code className="rounded bg-board-surface px-1.5 py-0.5">/game</code>,
        indépendant de cette interface. Les prochaines étapes viendront
        brancher l&apos;authentification, la collection, les decks et les
        parties.
      </p>
    </main>
  );
}
