"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GameState } from "@/game";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { submitOnlineAction } from "@/features/online/actions";
import { OnlineBoard } from "@/features/online/OnlineBoard";
import type { Database } from "@/lib/supabase/types";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

interface OnlineMatchProps {
  matchId: string;
  initialMatch: MatchRow;
  myUserId: string;
}

/** Orchestre une partie en ligne : écran d'attente puis plateau, synchronisés via Supabase Realtime. */
export function OnlineMatch({ matchId, initialMatch, myUserId }: OnlineMatchProps) {
  const [match, setMatch] = useState<MatchRow>(initialMatch);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`match-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => setMatch(payload.new as MatchRow)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  if (match.status === "waiting") {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">En attente d&apos;un adversaire</h1>
        <p className="text-4xl font-bold tracking-widest text-board-accent">{match.invite_code}</p>
        <p className="text-sm text-slate-400">Partage ce code. La partie démarre dès qu&apos;il/elle rejoint.</p>
        <Link href="/en-ligne" className="text-sm text-board-accent hover:underline">
          ← Annuler
        </Link>
      </main>
    );
  }

  if (!match.state) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-slate-400">
        Chargement de la partie...
      </main>
    );
  }

  async function handleAction(action: Parameters<typeof submitOnlineAction>[1]) {
    setPending(true);
    setError(null);
    const result = await submitOnlineAction(matchId, action);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Action refusée.");
      return;
    }
    // Mise à jour optimiste : Realtime confirmera juste après.
    if (result.data) setMatch((current) => ({ ...current, state: result.data }));
  }

  return (
    <OnlineBoard
      state={match.state as unknown as GameState}
      myUserId={myUserId}
      onAction={handleAction}
      pending={pending}
      error={error}
    />
  );
}
