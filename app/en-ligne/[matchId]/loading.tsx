/** Entre le lancement d'une partie et l'arrivée du plateau : un fond de mer, pas un écran blanc. */
export default function Loading() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#04090f] text-xs uppercase tracking-[0.18em] text-slate-400">
      Préparation de la partie…
    </main>
  );
}
