"use client";

import { useState } from "react";
import Link from "next/link";
import { ARCHETYPE_DECKS, PRECONSTRUCTED_DECKS, getShipDefinition, type BotDifficulty, type DeckList } from "@/game";
import { FilterChip } from "@/components/game-ui/FilterChip";
import { GameButton } from "@/components/game-ui/GameButton";
import { GamePanel } from "@/components/game-ui/GamePanel";
import { GameSelect, type GameSelectOption } from "@/components/game-ui/GameSelect";
import { TEXT_PRIMARY, TEXT_SECONDARY, TRANSITION } from "@/components/game-ui/tokens";

export type MatchOpponent = { type: "pvp" } | { type: "bot"; difficulty: BotDifficulty };

interface NewMatchScreenProps {
  onStart: (deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) => void;
}

/**
 * Liste combinée proposée à l'écran de sélection : les 3 decks de base
 * système (un par Navire) puis les archétypes — plusieurs archétypes
 * partagent le même Navire, d'où l'affichage de son nom à côté de chaque
 * deck plutôt qu'une simple liste de Navires.
 */
const SELECTABLE_DECKS: readonly DeckList[] = [...PRECONSTRUCTED_DECKS, ...ARCHETYPE_DECKS];

const DECK_OPTIONS: GameSelectOption<string>[] = [
  ...PRECONSTRUCTED_DECKS.map((deck) => ({ value: deck.id, label: deck.name, group: "Decks de base" })),
  ...ARCHETYPE_DECKS.map((deck) => ({
    value: deck.id,
    label: `${deck.name} — ${getShipDefinition(deck.shipId).name}`,
    group: "Archétypes",
  })),
];

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "facile", label: "Facile", description: "Joue quasiment au hasard, évite juste les pires coups." },
  { id: "moyen", label: "Moyen", description: "Vise généralement le meilleur coup, avec des erreurs occasionnelles." },
  { id: "difficile", label: "Difficile", description: "Cherche systématiquement le meilleur coup possible." },
];

/** Écran de sélection des Navires/decks avant une partie locale : contre un autre joueur (hot-seat) ou contre un bot. */
export function NewMatchScreen({ onStart }: NewMatchScreenProps) {
  const [deck1Id, setDeck1Id] = useState(SELECTABLE_DECKS[0]!.id);
  const [deck2Id, setDeck2Id] = useState(SELECTABLE_DECKS[1]!.id);
  const [opponentType, setOpponentType] = useState<"pvp" | "bot">("pvp");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("moyen");

  const deck1 = SELECTABLE_DECKS.find((d) => d.id === deck1Id)!;
  const deck2 = SELECTABLE_DECKS.find((d) => d.id === deck2Id)!;

  function handleStart() {
    const opponent: MatchOpponent = opponentType === "bot" ? { type: "bot", difficulty: botDifficulty } : { type: "pvp" };
    onStart(deck1, deck2, opponent);
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6"
      style={{ background: "radial-gradient(ellipse at 50% -10%, var(--surface-1) 0%, var(--surface-0) 60%)" }}
    >
      <Link href="/" className={`fixed left-6 top-6 z-10 text-sm ${TEXT_SECONDARY} transition-colors hover:${TEXT_PRIMARY}`}>
        ← Retour au menu
      </Link>

      <div className="text-center">
        <h1 className={`text-3xl font-bold tracking-tight ${TEXT_PRIMARY}`}>Nouvelle partie</h1>
        <p className={`mt-2 text-sm ${TEXT_SECONDARY}`}>
          {opponentType === "pvp"
            ? "Mode local : les deux joueurs jouent sur le même écran, à tour de rôle."
            : "Vous affrontez un bot — il jouera le second Navire."}
        </p>
      </div>

      <GamePanel className="flex w-full max-w-xl flex-col gap-3 p-5 text-left">
        <span className={`text-sm font-medium ${TEXT_SECONDARY}`}>Adversaire</span>
        <div className="flex gap-2">
          <FilterChip active={opponentType === "pvp"} onClick={() => setOpponentType("pvp")} className="!rounded-md !px-4 !py-2 !text-sm">
            Joueur contre joueur
          </FilterChip>
          <FilterChip active={opponentType === "bot"} onClick={() => setOpponentType("bot")} className="!rounded-md !px-4 !py-2 !text-sm">
            Contre un bot
          </FilterChip>
        </div>
        {opponentType === "bot" && (
          <div className="mt-2 flex flex-col gap-2">
            <span className={`text-xs ${TEXT_SECONDARY}`}>Difficulté</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              {BOT_DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setBotDifficulty(d.id)}
                  className={`flex flex-1 flex-col gap-1 rounded-md px-3 py-2 text-left ${TRANSITION} ${
                    botDifficulty === d.id
                      ? "bg-[var(--accent)]/10 shadow-[0_0_0_1px_var(--accent)]"
                      : "shadow-[0_0_0_1px_var(--border-subtle)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                  }`}
                >
                  <span className={`text-sm font-medium ${TEXT_PRIMARY}`}>{d.label}</span>
                  <span className={`text-[11px] leading-tight ${TEXT_SECONDARY}`}>{d.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </GamePanel>

      <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
        <DeckPicker label="Joueur 1" value={deck1Id} onChange={setDeck1Id} />
        <DeckPicker label={opponentType === "bot" ? "Bot" : "Joueur 2"} value={deck2Id} onChange={setDeck2Id} />
      </div>

      <GameButton variant="primary" onClick={handleStart} className="!px-8 !py-3 !text-base">
        Commencer la partie
      </GameButton>
    </main>
  );
}

function DeckPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const selected = SELECTABLE_DECKS.find((d) => d.id === value);
  const shipName = selected ? getShipDefinition(selected.shipId).name : undefined;
  const isArchetype = selected ? !PRECONSTRUCTED_DECKS.some((d) => d.id === selected.id) : false;

  return (
    <GamePanel className="flex flex-1 flex-col gap-2 p-4 text-left">
      <span className={`text-sm font-medium ${TEXT_SECONDARY}`}>{label}</span>
      <GameSelect value={value} onChange={onChange} options={DECK_OPTIONS} className="w-full" />
      {/* Suggestion du Navire correspondant : redondante avec le libellé de l'option pour un archétype, mais utile pour un deck de base où le nom du deck EST déjà celui du Navire. */}
      {shipName && (
        <span className={`text-[11px] ${TEXT_SECONDARY}`}>{isArchetype ? `Navire suggéré : ${shipName}` : `Navire : ${shipName}`}</span>
      )}
      {/* Le joueur doit savoir ce que le deck fait avant de le choisir, pas juste voir son nom. */}
      {selected && <p className={`text-xs leading-snug ${TEXT_SECONDARY}`}>{selected.description}</p>}
    </GamePanel>
  );
}
