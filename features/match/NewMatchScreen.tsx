"use client";

import { useState } from "react";
import { PRECONSTRUCTED_DECKS, type BotDifficulty, type DeckList } from "@/game";
import { Button } from "@/components/ui/Button";

export type MatchOpponent = { type: "pvp" } | { type: "bot"; difficulty: BotDifficulty };

interface NewMatchScreenProps {
  onStart: (deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) => void;
}

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "facile", label: "Facile", description: "Joue quasiment au hasard, évite juste les pires coups." },
  { id: "moyen", label: "Moyen", description: "Vise généralement le meilleur coup, avec des erreurs occasionnelles." },
  { id: "difficile", label: "Difficile", description: "Cherche systématiquement le meilleur coup possible." },
];

/** Écran de sélection des Navires/decks avant une partie locale : contre un autre joueur (hot-seat) ou contre un bot. */
export function NewMatchScreen({ onStart }: NewMatchScreenProps) {
  const [deck1Id, setDeck1Id] = useState(PRECONSTRUCTED_DECKS[0]!.id);
  const [deck2Id, setDeck2Id] = useState(PRECONSTRUCTED_DECKS[1]!.id);
  const [opponentType, setOpponentType] = useState<"pvp" | "bot">("pvp");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("moyen");

  const deck1 = PRECONSTRUCTED_DECKS.find((d) => d.id === deck1Id)!;
  const deck2 = PRECONSTRUCTED_DECKS.find((d) => d.id === deck2Id)!;

  function handleStart() {
    const opponent: MatchOpponent = opponentType === "bot" ? { type: "bot", difficulty: botDifficulty } : { type: "pvp" };
    onStart(deck1, deck2, opponent);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 p-8 text-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nouvelle partie</h1>
        <p className="mt-2 text-sm text-slate-400">
          {opponentType === "pvp"
            ? "Mode local : les deux joueurs jouent sur le même écran, à tour de rôle."
            : "Vous affrontez un bot — il jouera le second Navire."}
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 rounded-md border border-slate-800 bg-board-surface p-4 text-left">
        <span className="text-sm font-medium text-slate-300">Adversaire</span>
        <div className="flex gap-2">
          <Button
            variant={opponentType === "pvp" ? "primary" : "secondary"}
            onClick={() => setOpponentType("pvp")}
          >
            Joueur contre joueur
          </Button>
          <Button
            variant={opponentType === "bot" ? "primary" : "secondary"}
            onClick={() => setOpponentType("bot")}
          >
            Contre un bot
          </Button>
        </div>
        {opponentType === "bot" && (
          <div className="mt-2 flex flex-col gap-2">
            <span className="text-xs text-slate-400">Difficulté</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              {BOT_DIFFICULTIES.map((d) => (
                <label
                  key={d.id}
                  className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                    botDifficulty === d.id
                      ? "border-board-accent bg-board-accent/10"
                      : "border-slate-700 bg-board-background"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <input
                      type="radio"
                      name="botDifficulty"
                      value={d.id}
                      checked={botDifficulty === d.id}
                      onChange={() => setBotDifficulty(d.id)}
                      className="accent-board-accent"
                    />
                    {d.label}
                  </span>
                  <span className="text-[11px] leading-tight text-slate-500">{d.description}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-4 sm:flex-row">
        <DeckPicker label="Joueur 1" value={deck1Id} onChange={setDeck1Id} />
        <DeckPicker
          label={opponentType === "bot" ? "Bot" : "Joueur 2"}
          value={deck2Id}
          onChange={setDeck2Id}
        />
      </div>

      <Button onClick={handleStart}>Commencer la partie</Button>
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
