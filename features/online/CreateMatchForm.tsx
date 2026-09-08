"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRECONSTRUCTED_DECKS } from "@/game";
import { Button } from "@/components/ui/Button";
import { createOnlineMatch } from "@/features/online/actions";

export function CreateMatchForm() {
  const router = useRouter();
  const [deckId, setDeckId] = useState(PRECONSTRUCTED_DECKS[0]!.id);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    setPending(true);
    setError(null);
    const result = await createOnlineMatch(deckId);
    if (!result.ok || !result.data) {
      setPending(false);
      setError(result.error ?? "Erreur inconnue.");
      return;
    }
    router.push(`/en-ligne/${result.data.matchId}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
      <h2 className="text-sm font-medium text-slate-300">Créer une partie</h2>
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
      <Button onClick={handleCreate} disabled={pending}>
        {pending ? "Création..." : "Créer la partie"}
      </Button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
