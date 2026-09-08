"use client";

import { useState } from "react";
import { PRECONSTRUCTED_DECKS, type DeckList } from "@/game";
import { Button } from "@/components/ui/Button";

interface NewMatchScreenProps {
  onStart: (deck1: DeckList, deck2: DeckList) => void;
}

/** Écran de sélection des Navires/decks avant une partie locale (hot-seat). */
export function NewMatchScreen({ onStart }: NewMatchScreenProps) {
  const [deck1Id, setDeck1Id] = useState(PRECONSTRUCTED_DECKS[0]!.id);
  const [deck2Id, setDeck2Id] = useState(PRECONSTRUCTED_DECKS[1]!.id);

  const deck1 = PRECONSTRUCTED_DECKS.find((d) => d.id === deck1Id)!;
  const deck2 = PRECONSTRUCTED_DECKS.find((d) => d.id === deck2Id)!;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nouvelle partie</h1>
        <p className="mt-2 text-sm text-slate-400">
          Mode local : les deux joueurs jouent sur le même écran, à tour de rôle.
        </p>
      </div>

      <div className="flex w-full flex-col gap-4 sm:flex-row">
        <DeckPicker label="Joueur 1" value={deck1Id} onChange={setDeck1Id} />
        <DeckPicker label="Joueur 2" value={deck2Id} onChange={setDeck2Id} />
      </div>

      <Button onClick={() => onStart(deck1, deck2)}>Commencer la partie</Button>
    </main>
  );
}

function DeckPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-2 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-700 bg-board-background px-2 py-1.5 text-sm text-slate-100"
      >
        {PRECONSTRUCTED_DECKS.map((deck) => (
          <option key={deck.id} value={deck.id}>
            {deck.name}
          </option>
        ))}
      </select>
    </label>
  );
}
