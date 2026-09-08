"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRECONSTRUCTED_DECKS } from "@/game";
import { Button } from "@/components/ui/Button";
import { joinOnlineMatch } from "@/features/online/actions";

export function JoinMatchForm() {
  const router = useRouter();
  const [deckId, setDeckId] = useState(PRECONSTRUCTED_DECKS[0]!.id);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleJoin() {
    if (!code.trim()) return;
    setPending(true);
    setError(null);
    const result = await joinOnlineMatch(code, deckId);
    if (!result.ok || !result.data) {
      setPending(false);
      setError(result.error ?? "Erreur inconnue.");
      return;
    }
    router.push(`/en-ligne/${result.data.matchId}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
      <h2 className="text-sm font-medium text-slate-300">Rejoindre une partie</h2>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Code d'invitation"
        maxLength={6}
        className="rounded-md border border-slate-700 bg-board-background px-2 py-1.5 text-sm uppercase tracking-widest text-slate-100"
      />
      <select
        value={deckId}
        onChange={(e) => setDeckId(e.target.value)}
        className="rounded-md border border-slate-700 bg-board-background px-2 py-1.5 text-sm text-slate-100"
      >
        {PRECONSTRUCTED_DECKS.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
      <Button onClick={handleJoin} disabled={pending || !code.trim()}>
        {pending ? "Connexion..." : "Rejoindre"}
      </Button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
