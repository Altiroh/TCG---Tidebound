"use client";

import { useState } from "react";
import type { BotDifficulty, DeckList, GameState, PlayerId } from "@/game";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { NewMatchScreen, type MatchOpponent } from "@/features/match/NewMatchScreen";
import { MatchBoard } from "@/features/match/MatchBoard";

export default function PartiePage() {
  const [match, setMatch] = useState<GameState | null>(null);
  const [bot, setBot] = useState<{ playerId: PlayerId; difficulty: BotDifficulty } | null>(null);

  function startMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) {
    const state = createLocalMatch(deck1, deck2);
    setBot(opponent.type === "bot" ? { playerId: "p2", difficulty: opponent.difficulty } : null);
    setMatch(state);
  }

  function exitMatch() {
    setMatch(null);
    setBot(null);
  }

  if (!match) {
    return <NewMatchScreen onStart={startMatch} />;
  }
  return (
    <MatchBoard
      initialState={match}
      onExit={exitMatch}
      botPlayerId={bot?.playerId}
      botDifficulty={bot?.difficulty}
    />
  );
}
