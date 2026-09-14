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
  /**
   * `true` quand le serveur ne PEUT pas arbitrer maintenant (configuration
   * incomplète, migration manquante, base injoignable) — par opposition à
   * une demande invalide (deck ou difficulté inconnus), qu'il faut corriger.
   * L'appelant bascule alors sur une partie d'entraînement locale : un
   * joueur connecté ne doit jamais se retrouver dans l'impossibilité de
   * jouer contre un bot parce que l'infrastructure de récompense est en
   * panne. La cause exacte part dans les logs serveur, pas à l'écran.
   */
  serverUnavailable?: boolean;
  matchId?: string;
}

/** Message unique pour tout ce qui empêche le serveur d'arbitrer : le joueur n'a pas à distinguer une clé manquante d'une base injoignable. */
const UNAVAILABLE = "Le serveur ne peut pas arbitrer la partie pour l'instant — partie d'entraînement lancée, sans XP ni quêtes.";

/**
 * Démarre une partie contre bot ARBITRÉE CÔTÉ SERVEUR.
 *
 * L'état vit dans `match_states` comme une partie PvP ; le bot joue dans
 * `submitMatchAction` (`features/matches/matchStore.ts`), jamais dans le
 * navigateur. L'issue de la partie est donc constatée par le serveur, ce qui
 * rend ses récompenses (XP, quêtes compatibles bot) aussi fiables qu'en PvP.
 */
export async function startBotMatch(deckId: string, botDeckId: string, difficulty: BotDifficulty): Promise<StartBotMatchResult> {
  try {
    return await createBotMatch(deckId, botDeckId, difficulty);
  } catch (cause) {
    // Une Server Action qui lève ne renvoie RIEN d'exploitable au client
    // (Next masque l'erreur) : sans ce filet, la cause réelle — le plus
    // souvent `SUPABASE_SERVICE_ROLE_KEY` absente de l'environnement —
    // restait invisible des deux côtés.
    console.error("[startBotMatch] Échec inattendu :", cause);
    return { ok: false, serverUnavailable: true, error: UNAVAILABLE };
  }
}

async function createBotMatch(deckId: string, botDeckId: string, difficulty: BotDifficulty): Promise<StartBotMatchResult> {
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
    // Migration non appliquée, RLS, base injoignable : rien que le joueur
    // puisse corriger, et rien qui doive l'empêcher de jouer.
    console.error("[startBotMatch] Création refusée :", error?.message ?? data?.error);
    return { ok: false, serverUnavailable: true, error: UNAVAILABLE };
  }

  return { ok: true, matchId };
}
