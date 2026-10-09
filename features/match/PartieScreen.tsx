"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type BotDifficulty, type DeckList, type GameState, type PlayerId } from "@/game";
import { startBotMatch } from "@/features/bot/actions";
import { joinMatchmakingQueue } from "@/features/matchmaking/actions";
import { MatchmakingSearch } from "@/features/matchmaking/MatchmakingSearch";
import { createOnlineMatch, joinOnlineMatch } from "@/features/online/actions";
import { challengeFriend, declineChallenge } from "@/features/friends/actions";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import {
  NewMatchScreen,
  type ChallengeableFriend,
  type MatchOpponent,
  type OnlineKind,
  type ReceivedChallenge,
} from "@/features/match/NewMatchScreen";
import { MatchBoard } from "@/features/match/MatchBoard";

interface PartieScreenProps {
  isSignedIn: boolean;
  /** Decks personnels jouables du joueur connecté — vide hors connexion. */
  personalDecks?: DeckList[];
  /** Préconstruits que ce joueur a débloqués (choix gratuit + Jetons). */
  unlockedDeckIds?: string[];
  /** Partie laissée ouverte par ce joueur, proposée à la reprise. */
  resumable?: { matchId: string; label: string } | null;
  /** Amis du joueur (« Défier un ami »). */
  friends?: ChallengeableFriend[];
  /** Défis reçus d'amis, proposés sur l'écran des modes. */
  challenges?: ReceivedChallenge[];
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
export function PartieScreen({
  isSignedIn,
  personalDecks = [],
  unlockedDeckIds = [],
  resumable = null,
  friends = [],
  challenges = [],
}: PartieScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [match, setMatch] = useState<GameState | null>(null);
  const [bot, setBot] = useState<{ playerId: PlayerId; difficulty: BotDifficulty } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pourquoi la partie en cours est locale alors qu'elle aurait dû être arbitrée — affiché par-dessus le plateau, jamais bloquant. */
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  /** Recherche rapide en cours : le deck engagé, le temps de trouver un adversaire. */
  const [searching, setSearching] = useState<DeckList | null>(null);
  /** Revenu d'une recherche : l'écran rouvre le mode « En ligne », où s'affiche la raison de l'arrêt. */
  const [backFromSearch, setBackFromSearch] = useState(false);
  // Lu une fois, à l'arrivée : lien `/partie?mode=en-ligne`, ou lien d'invitation.
  const [entry] = useState(() => ({
    mode: searchParams.get("mode") === "en-ligne" ? ("online" as const) : undefined,
    code: searchParams.get("code") ?? undefined,
    friendId: searchParams.get("ami") ?? undefined,
  }));
  /** Défis encore affichés : un défi décliné disparaît aussitôt. */
  const [openChallenges, setOpenChallenges] = useState(challenges);

  /** Partie en ligne : recherche rapide, ou match amical créé / rejoint. */
  async function startOnline(deck: DeckList, kind: OnlineKind, code?: string, friendId?: string) {
    setStarting(true);
    setError(null);
    const failed = (message?: string) => {
      setStarting(false);
      setError(message ?? "Le serveur est injoignable — réessaie dans un instant.");
    };
    try {
      if (kind === "quick") {
        const result = await joinMatchmakingQueue(deck.id);
        if (!result.ok || !result.data) return failed(result.error);
        if (result.data.status === "matched") return router.push(`/en-ligne/${result.data.matchId}`);
        setStarting(false);
        setSearching(deck);
        return;
      }
      if (kind === "friend") {
        const result = await challengeFriend(friendId ?? "", deck.id);
        if (!result.ok || !result.matchId) return failed(result.error);
        return router.push(`/en-ligne/${result.matchId}`);
      }
      const result = kind === "host" ? await createOnlineMatch(deck.id) : await joinOnlineMatch(code ?? "", deck.id);
      if (!result.ok || !result.data) return failed(result.error);
      router.push(`/en-ligne/${result.data.matchId}`);
    } catch {
      failed();
    }
  }

  function startLocalMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent, notice: string | null = null) {
    setBot(opponent.type === "bot" ? { playerId: "p2", difficulty: opponent.difficulty } : null);
    setFallbackNotice(notice);
    setMatch(createLocalMatch(deck1, deck2));
  }

  async function startMatch(deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) {
    if (opponent.type === "online") {
      await startOnline(deck1, opponent.kind, opponent.code, opponent.friendId);
      return;
    }
    if (opponent.type !== "bot") {
      startLocalMatch(deck1, deck2, opponent);
      return;
    }
    if (!isSignedIn) {
      // Plus de partie sans compte (28/09/2026).
      router.push("/connexion?redirect=%2Fpartie");
      return;
    }
    setStarting(true);
    setError(null);
    // `startBotMatch` attrape ses propres erreurs, mais un échec de transport
    // (réseau coupé pendant l'appel) rejette encore la promesse.
    const result = await startBotMatch(deck1.id, deck2.id, opponent.difficulty).catch(() => ({
      ok: false as const,
      error: "Serveur injoignable — vérifie ta connexion, puis relance la partie.",
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
      // Session expirée entre l'affichage et le clic : on se reconnecte, puis on revient.
      router.push("/connexion?redirect=%2Fpartie");
      return;
    }
    // Serveur injoignable ou arbitrage en panne : plus de partie hors ligne
    // en repli (28/09/2026) — on le dit, le joueur relance quand ça revient.
    setError(result.error ?? "Impossible de démarrer la partie.");
  }

  function exitMatch() {
    setMatch(null);
    setBot(null);
    setFallbackNotice(null);
  }

  if (searching) {
    return (
      <MatchmakingSearch
        deckName={searching.name}
        onCancel={(reason) => {
          setSearching(null);
          setBackFromSearch(true);
          setError(reason ?? null);
        }}
      />
    );
  }

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
        initialMode={backFromSearch ? "online" : entry.mode}
        initialFriendId={entry.friendId}
        friends={friends}
        challenges={openChallenges}
        onDeclineChallenge={(challengeId) => {
          setOpenChallenges((current) => current.filter((challenge) => challenge.id !== challengeId));
          void declineChallenge(challengeId).catch(() => undefined);
        }}
        initialInviteCode={entry.code}
        resumable={resumable}
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
