"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { catalogDeckById, PRECON_DECKS, type BotDifficulty, type DeckList, type GameState, type PlayerId } from "@/game";
import { startBotMatch } from "@/features/bot/actions";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { NewMatchScreen, type MatchOpponent } from "@/features/match/NewMatchScreen";
import { MatchBoard } from "@/features/match/MatchBoard";

interface PartieScreenProps {
  isSignedIn: boolean;
  /** Decks personnels jouables du joueur connecté — vide hors connexion. */
  personalDecks?: DeckList[];
  /** Préconstruits que ce joueur a débloqués (choix gratuit + Jetons). */
  unlockedDeckIds?: string[];
}

/**
 * Nouvelle partie hors invitation en ligne.
 *
 *   - Contre un bot, joueur CONNECTÉ : partie arbitrée côté serveur
 *     (`startBotMatch`), jouée sur le plateau en ligne ; elle rapporte XP et
 *     progression de quêtes. Le deck peut être une liste du jeu OU un deck
 *     personnel : le serveur le relit en base (`resolveMatchDeck`), donc les
 *     deux rapportent pareil.
 *   - Contre un bot hors connexion, ou à deux sur le même écran : partie
 *     locale, entièrement dans le navigateur, qui ne rapporte rien.
 */
export function PartieScreen({ isSignedIn, personalDecks = [], unlockedDeckIds = [] }: PartieScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [match, setMatch] = useState<GameState | null>(null);
  const [bot, setBot] = useState<{ playerId: PlayerId; difficulty: BotDifficulty } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pourquoi la partie en cours est locale alors qu'elle aurait dû être arbitrée — affiché par-dessus le plateau, jamais bloquant. */
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);

  function startLocalMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent, notice: string | null = null) {
    setBot(opponent.type === "bot" ? { playerId: "p2", difficulty: opponent.difficulty } : null);
    setFallbackNotice(notice);
    setMatch(createLocalMatch(deck1, deck2));
  }

  async function startMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) {
    if (opponent.type !== "bot" || !isSignedIn) {
      startLocalMatch(deck1, deck2, opponent);
      return;
    }
    setStarting(true);
    setError(null);
    // `startBotMatch` attrape ses propres erreurs, mais un échec de transport
    // (réseau coupé pendant l'appel) rejette encore la promesse : même issue
    // que côté serveur — on joue en local plutôt que de rester bloqué.
    const result = await startBotMatch(deck1.id, deck2.id, opponent.difficulty).catch(() => ({
      ok: false as const,
      error: "Serveur injoignable — partie d'entraînement lancée, sans XP ni quêtes.",
      serverUnavailable: true,
      signedOut: false,
      matchId: undefined,
    }));
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
    if (result.serverUnavailable) {
      // L'arbitrage serveur est en panne (clé de service absente, migration
      // manquante, base injoignable). Ce n'est pas au joueur d'en faire les
      // frais : il joue, sans récompense, et on lui dit pourquoi.
      startLocalMatch(deck1, deck2, opponent, result.error ?? null);
      return;
    }
    setError(result.error ?? "Impossible de démarrer la partie.");
  }

  function exitMatch() {
    setMatch(null);
    setBot(null);
    setFallbackNotice(null);
  }

  /**
   * « Essayer » un préconstruit verrouillé (Notion « Progression joueur »
   * §4, option UX recommandée) : partie contre le bot, deck entièrement
   * PRÊTÉ le temps du test, et récompenses nulles — c'est une partie
   * locale, elle ne passe pas par l'arbitrage serveur. Le joueur voit ce
   * que le deck fait avant de dépenser son Jeton.
   */
  useEffect(() => {
    const tryDeckId = searchParams.get("essai");
    if (!tryDeckId || match) return;
    const deck = catalogDeckById(tryDeckId);
    if (!deck || !PRECON_DECKS.some((entry) => entry.id === deck.id)) return;
    setBot({ playerId: "p2", difficulty: "moyen" });
    setFallbackNotice("Essai d'un préconstruit : deck entièrement prêté, partie d'entraînement sans XP ni quêtes.");
    setMatch(createLocalMatch(deck, pickTrialOpponent(deck)));
    // Une seule fois : on retire le paramètre pour qu'un retour arrière ne relance pas l'essai.
    router.replace("/partie");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit réagir qu'à l'arrivée du paramètre.
  }, [searchParams]);

  if (!match) {
    return (
      <NewMatchScreen
        onStart={startMatch}
        starting={starting}
        error={error}
        personalDecks={personalDecks}
        unlockedDeckIds={unlockedDeckIds}
        botNote={
          isSignedIn
            ? "La partie est arbitrée par le serveur : elle rapporte de l'XP et fait avancer tes quêtes."
            : "Hors connexion : partie d'entraînement, sans XP ni quêtes. Connecte-toi pour être récompensé."
        }
        isSignedIn={isSignedIn}
      />
    );
  }
  return (
    <>
      {fallbackNotice && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-4">
          <button
            type="button"
            onClick={() => setFallbackNotice(null)}
            className="pointer-events-auto max-w-lg rounded-full border border-amber-300/35 bg-slate-950/85 px-4 py-2 text-center text-xs text-amber-100 shadow-lg backdrop-blur-md"
          >
            {fallbackNotice} <span className="text-amber-200/60">— cliquer pour masquer</span>
          </button>
        </div>
      )}
      <MatchBoard initialState={match} onExit={exitMatch} botPlayerId={bot?.playerId} botDifficulty={bot?.difficulty} />
    </>
  );
}

/** Adversaire d'un essai : un autre préconstruit, pour que le test soit représentatif. */
function pickTrialOpponent(deck: DeckList): DeckList {
  const others = PRECON_DECKS.filter((entry) => entry.id !== deck.id);
  return others[Math.floor(Math.random() * others.length)] ?? deck;
}
