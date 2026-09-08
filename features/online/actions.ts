"use server";

import { redirect } from "next/navigation";
import { createGameState, dispatch, type GameState, type PlayerAction } from "@/game";
import { PRECONSTRUCTED_DECKS } from "@/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/features/online/inviteCode";
import type { Database } from "@/lib/supabase/types";

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
}

function findDeck(deckId: string) {
  const deck = PRECONSTRUCTED_DECKS.find((d) => d.id === deckId);
  if (!deck) throw new Error(`Deck inconnu: ${deckId}`);
  return deck;
}

/** Crée une partie en attente d'un second joueur, avec un code d'invitation. */
export async function createOnlineMatch(deckId: string): Promise<ActionResult<{ matchId: string; inviteCode: string }>> {
  findDeck(deckId); // valide le deckId avant écriture
  const { supabase, user } = await requireUser();

  const inviteCode = generateInviteCode();
  const { data, error } = await supabase
    .from("matches")
    .insert({ player1_id: user.id, player1_deck_id: deckId, invite_code: inviteCode, status: "waiting" })
    .select("id, invite_code")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Échec de la création de la partie." };
  return { ok: true, data: { matchId: data.id, inviteCode: data.invite_code } };
}

/** Rejoint une partie en attente via son code d'invitation et démarre la partie. */
export async function joinOnlineMatch(inviteCode: string, deckId: string): Promise<ActionResult<{ matchId: string }>> {
  const deck2 = findDeck(deckId);
  const { supabase, user } = await requireUser();

  const { data: match, error: findError } = await supabase
    .from("matches")
    .select("*")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .eq("status", "waiting")
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!match) return { ok: false, error: "Aucune partie en attente avec ce code." };
  if (match.player1_id === user.id) return { ok: false, error: "Tu ne peux pas rejoindre ta propre partie." };

  const deck1 = findDeck(match.player1_deck_id);
  const state = createGameState({
    gameId: match.id,
    player1: { id: match.player1_id, deck: deck1 },
    player2: { id: user.id, deck: deck2 },
  });

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      player2_id: user.id,
      player2_deck_id: deckId,
      state,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("status", "waiting"); // évite une double-jonction en cas de course

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, data: { matchId: match.id } };
}

/** Charge une partie (lecture initiale ; les mises à jour suivantes passent par Realtime). */
export async function fetchMatch(matchId: string): Promise<ActionResult<MatchRow>> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Partie introuvable." };
  return { ok: true, data };
}

/**
 * Applique une action de jeu de façon serveur-autoritaire : recharge
 * l'état courant, appelle `dispatch()` (seule autorité sur la légalité
 * d'un coup), persiste le résultat. Le navigateur ne décide jamais de
 * l'issue d'une action — il ne fait que la proposer.
 */
export async function submitOnlineAction(matchId: string, action: PlayerAction): Promise<ActionResult<GameState>> {
  const { supabase, user } = await requireUser();

  const { data: match, error: findError } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
  if (findError) return { ok: false, error: findError.message };
  if (!match) return { ok: false, error: "Partie introuvable." };
  if (match.status !== "active" || !match.state) return { ok: false, error: "Cette partie n'est pas en cours." };
  if (match.player1_id !== user.id && match.player2_id !== user.id) {
    return { ok: false, error: "Tu ne participes pas à cette partie." };
  }

  const currentState = match.state as unknown as GameState;
  const result = dispatch(currentState, action);
  if (!result.ok) return { ok: false, error: result.error };

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      state: result.state,
      status: result.state.status === "finished" ? "finished" : "active",
      winner_id: result.state.winnerId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, data: result.state };
}
