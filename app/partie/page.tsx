"use client";

import { useState } from "react";
import type { GameState, DeckList } from "@/game";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { NewMatchScreen } from "@/features/match/NewMatchScreen";
import { MatchBoard } from "@/features/match/MatchBoard";

export default function PartiePage() {
  const [match, setMatch] = useState<GameState | null>(null);

  function startMatch(deck1: DeckList, deck2: DeckList) {
    setMatch(createLocalMatch(deck1, deck2));
  }

  if (!match) {
    return <NewMatchScreen onStart={startMatch} />;
  }

  return <MatchBoard initialState={match} onExit={() => setMatch(null)} />;
}
