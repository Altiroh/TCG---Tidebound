"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BotDifficulty, DeckList, GameState, PlayerId } from "@/game";
import { startBotMatch } from "@/features/bot/actions";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { NewMatchScreen, type MatchOpponent } from "@/features/match/NewMatchScreen";
import { MatchBoard } from "@/features/match/MatchBoard";

interface PartieScreenProps {
  isSignedIn: boolean;
}

/**
 * Nouvelle partie hors invitation en ligne.
 *
 *   - Contre un bot, joueur CONNECTÉ : partie arbitrée côté serveur
 *     (`startBotMatch`), jouée sur le plateau en ligne ; elle rapporte XP et
 *     progression de quêtes.
 *   - Contre un bot hors connexion, ou à deux sur le même écran : partie
 *     locale, entièrement dans le navigateur, qui ne rapporte rien.
 */
export function PartieScreen({ isSignedIn }: PartieScreenProps) {
  const router = useRouter();
  const [match, setMatch] = useState<GameState | null>(null);
  const [bot, setBot] = useState<{ playerId: PlayerId; difficulty: BotDifficulty } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startLocalMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) {
    setBot(opponent.type === "bot" ? { playerId: "p2", difficulty: opponent.difficulty } : null);
    setMatch(createLocalMatch(deck1, deck2));
  }

  async function startMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) {
    if (opponent.type !== "bot" || !isSignedIn) {
      startLocalMatch(deck1, deck2, opponent);
      return;
    }

    setStarting(true);
    setError(null);
    const result = await startBotMatch(deck1.id, deck2.id, opponent.difficulty);
    if (result.ok && result.matchId) {
      router.push(`/en-ligne/${result.matchId}`);
      return;
    }
    setStarting(false);
    if (result.signedOut) {
      // Session expirée entre l'affichage et le clic : on joue quand même, sans récompense.
      startLocalMatch(deck1, deck2, opponent);
      return;
    }
    setError(result.error ?? "Impossible de démarrer la partie.");
  }

  function exitMatch() {
    setMatch(null);
    setBot(null);
  }

  if (!match) {
    return (
      <NewMatchScreen
        onStart={startMatch}
        starting={starting}
        error={error}
        botNote={
          isSignedIn
            ? "La partie est arbitrée par le serveur : elle rapporte de l'XP et fait avancer tes quêtes."
            : "Hors connexion : partie d'entraînement, sans XP ni quêtes. Connecte-toi pour être récompensé."
        }
      />
    );
  }
  return <MatchBoard initialState={match} onExit={exitMatch} botPlayerId={bot?.playerId} botDifficulty={bot?.difficulty} />;
}
