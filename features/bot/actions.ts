"use server";

import { createGameState, type BotDifficulty } from "@/game";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/features/online/inviteCode";
import { BOT_PLAYER_ID, findPlayableDeck } from "@/features/matches/matchStore";

const DIFFICULTIES: readonly BotDifficulty[] = ["facile", "moyen", "difficile"];

export interface StartBotMatchResult {
  ok: boolean;
  error?: string;
  /** `true` si le joueur n'est pas connecté : l'appelant bascule alors sur une partie d'entraînement locale. */
  signedOut?: boolean;
  matchId?: string;
}

/**
 * Démarre une partie contre bot ARBITRÉE CÔTÉ SERVEUR.
 *
 * L'état vit dans `match_states` comme une partie PvP ; le bot joue dans
 * `submitMatchAction` (`features/matches/matchStore.ts`), jamais dans le
 * navigateur. L'issue de la partie est donc constatée par le serveur, ce qui
 * rend ses récompenses (XP, quêtes compatibles bot) aussi fiables qu'en PvP.
 */
export async function startBotMatch(deckId: string, botDeckId: string, difficulty: BotDifficulty): Promise<StartBotMatchResult> {
  const playerDeck = findPlayableDeck(deckId);
  const botDeck = findPlayableDeck(botDeckId);
  if (!playerDeck || !botDeck) return { ok: false, error: "Deck inconnu." };
  if (!DIFFICULTIES.includes(difficulty)) return { ok: false, error: "Difficulté inconnue." };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, signedOut: true };

  const matchId = crypto.randomUUID();
  const state = createGameState({
    gameId: matchId,
    player1: { id: user.id, deck: playerDeck },
    player2: { id: BOT_PLAYER_ID, deck: botDeck },
  });

  const { data, error } = await createSupabaseServiceRoleClient().rpc("create_active_match", {
    p_match_id: matchId,
    p_invite_code: generateInviteCode(),
    p_mode: "bot",
    p_player1_id: user.id,
    p_player1_deck_id: deckId,
    p_player2_id: null,
    p_player2_deck_id: botDeckId,
    p_bot_difficulty: difficulty,
    p_state: state,
  });
  if (error || !data?.ok) {
    console.error("[startBotMatch] Création refusée :", error?.message ?? data?.error);
    return { ok: false, error: "Impossible de démarrer la partie." };
  }

  return { ok: true, matchId };
}
