"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { findMyActiveMatch, joinMatchmakingQueue, leaveMatchmakingQueue } from "@/features/matchmaking/actions";

/** Cadence d'interrogation pendant l'attente — cf. `findMyActiveMatch` pour le choix du sondage. */
const POLL_MS = 3000;

interface QuickMatchPanelProps {
  /** Decks que ce joueur peut engager : emprunt et préconstruits débloqués, plus ses decks personnels. */
  decks: { id: string; name: string }[];
}

/**
 * Recherche rapide : rejoindre la file, attendre, partir dès qu'un
 * adversaire est trouvé.
 *
 * L'appariement lui-même vit côté serveur depuis longtemps
 * (`features/matchmaking/actions.ts`) — il n'avait simplement aucune
 * interface, et n'était donc joignable par personne.
 *
 * Deux façons d'être apparié, et l'écran doit couvrir les deux :
 *   - on ARRIVE et quelqu'un attendait : la partie est créée dans la foulée,
 *     l'appel qui nous a mis en file rend directement son identifiant ;
 *   - on attendait DÉJÀ et quelqu'un arrive : c'est lui qui crée la partie,
 *     notre propre appel est terminé depuis longtemps. D'où le sondage.
 */
export function QuickMatchPanel({ decks }: QuickMatchPanelProps) {
  const router = useRouter();
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [state, setState] = useState<"idle" | "joining" | "queued">("idle");
  const [error, setError] = useState<string | null>(null);
  const [waitedSeconds, setWaitedSeconds] = useState(0);

  /** Évite deux navigations si un sondage et l'appel de départ concluent ensemble. */
  const leaving = useRef(false);

  function goToMatch(matchId: string) {
    if (leaving.current) return;
    leaving.current = true;
    router.push(`/en-ligne/${matchId}`);
  }

  // Sondage pendant l'attente, et compteur de temps écoulé : une file qui
  // n'affiche rien donne l'impression d'être bloquée.
  useEffect(() => {
    if (state !== "queued") return;
    let cancelled = false;

    const poll = setInterval(async () => {
      const found = await findMyActiveMatch().catch(() => null);
      if (cancelled || !found?.ok) return;
      if (found.data?.matchId) goToMatch(found.data.matchId);
    }, POLL_MS);
    const tick = setInterval(() => setWaitedSeconds((s) => s + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne dépend que de l'entrée/sortie de file.
  }, [state]);

  // Quitter la page pendant l'attente doit libérer la place : sans ça, un
  // joueur parti resterait appariable et son adversaire tomberait dans une
  // partie que personne ne joue.
  useEffect(() => {
    if (state !== "queued") return;
    const release = () => void leaveMatchmakingQueue().catch(() => undefined);
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      if (!leaving.current) release();
    };
  }, [state]);

  async function join() {
    setState("joining");
    setError(null);
    setWaitedSeconds(0);
    const result = await joinMatchmakingQueue(deckId).catch(() => null);
    if (!result?.ok || !result.data) {
      setState("idle");
      setError(result?.error ?? "Recherche impossible pour l'instant.");
      return;
    }
    if (result.data.status === "matched") {
      goToMatch(result.data.matchId);
      return;
    }
    setState("queued");
  }

  async function cancel() {
    setState("idle");
    await leaveMatchmakingQueue().catch(() => undefined);
  }

  if (decks.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-3 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
        <h2 className="text-sm font-medium text-slate-300">Recherche rapide</h2>
        <p className="text-xs text-slate-400">
          Il te faut un deck jouable pour être apparié. Choisis ton deck d&apos;emprunt dans la Collection, ou monte le tien.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
      <h2 className="text-sm font-medium text-slate-300">Recherche rapide</h2>

      {state === "queued" ? (
        <>
          <p className="text-xs text-slate-400" role="status">
            Recherche d&apos;un adversaire… {waitedSeconds}s
          </p>
          <p className="text-[11px] text-slate-500">
            Tu peux fermer cette page : ta place est libérée automatiquement.
          </p>
          <Button onClick={cancel}>Annuler la recherche</Button>
        </>
      ) : (
        <>
          <select
            value={deckId}
            onChange={(event) => setDeckId(event.target.value)}
            className="rounded-md border border-slate-700 bg-board-background px-2 py-1.5 text-sm text-slate-100"
            aria-label="Deck engagé"
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <Button onClick={join} disabled={state === "joining" || !deckId}>
            {state === "joining" ? "Recherche…" : "Chercher un adversaire"}
          </Button>
        </>
      )}

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
