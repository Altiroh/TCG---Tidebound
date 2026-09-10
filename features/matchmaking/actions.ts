"use server";

import { redirect } from "next/navigation";
import { createGameState, PRECONSTRUCTED_DECKS } from "@/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  // TODO: accepter aussi un deck personnel (`player_decks`) une fois le
  // deckbuilder branché — pour l'instant, seuls les decks de base système
  // sont jouables (même limite que `features/online/actions.ts`).
  const deck = PRECONSTRUCTED_DECKS.find((d) => d.id === deckId);
  if (!deck) throw new Error(`Deck inconnu: ${deckId}`);
  return deck;
}

/**
 * Rejoint la file de matchmaking et tente immédiatement un appariement.
 *
 * Esquisse volontairement simple (pas de worker en tâche de fond) :
 * l'appariement n'est tenté qu'au moment où un joueur rejoint la file, via
 * la fonction Postgres `claim_matchmaking_opponent()` (verrouillage
 * `for update skip locked`, sûre sous accès concurrents). Si personne
 * n'attendait, l'appelant reste en file et doit être notifié plus tard par
 * un autre joueur qui le rejoint — le client doit donc s'abonner en
 * Realtime à `matches` (filtré sur `player1_id`/`player2_id` = son propre
 * id) pour détecter qu'il vient d'être apparié, plutôt que de dépendre
 * uniquement de la valeur de retour de cet appel.
 */
export async function joinMatchmakingQueue(deckId: string): Promise<ActionResult<{ status: "queued" } | { status: "matched"; matchId: string }>> {
  findDeck(deckId); // valide le deckId avant écriture
  const { supabase, user } = await requireUser();

  const { error: upsertError } = await supabase
    .from("matchmaking_queue")
    .upsert({ user_id: user.id, deck_id: deckId, queued_at: new Date().toISOString() });
  if (upsertError) return { ok: false, error: upsertError.message };

  const { data: claimed, error: claimError } = await supabase.rpc("claim_matchmaking_opponent");
  if (claimError) return { ok: false, error: claimError.message };

  const opponent = claimed?.[0];
  if (!opponent) {
    return { ok: true, data: { status: "queued" } };
  }

  // Un adversaire attendait : on crée la partie nous-mêmes (`self` devient
  // player1) et on se retire de la file — l'adversaire a déjà été retiré
  // par `claim_matchmaking_opponent()`.
  const selfDeck = findDeck(deckId);
  const opponentDeck = findDeck(opponent.opponent_deck_id);

  const state = createGameState({
    gameId: crypto.randomUUID(),
    player1: { id: user.id, deck: selfDeck },
    player2: { id: opponent.opponent_user_id, deck: opponentDeck },
  });

  const { data: match, error: insertError } = await supabase
    .from("matches")
    .insert({
      id: state.id,
      // Sans usage pour une partie appariée (pas de lien à partager), mais
      // la colonne reste `not null unique` : dérivée de l'id de partie.
      invite_code: state.id.slice(0, 8).toUpperCase(),
      player1_id: user.id,
      player2_id: opponent.opponent_user_id,
      player1_deck_id: deckId,
      player2_deck_id: opponent.opponent_deck_id,
      state,
      status: "active",
      mode: "matchmaking",
    })
    .select("id")
    .single();

  await supabase.from("matchmaking_queue").delete().eq("user_id", user.id);

  if (insertError || !match) return { ok: false, error: insertError?.message ?? "Échec de la création de la partie." };
  return { ok: true, data: { status: "matched", matchId: match.id } };
}

/** Quitte la file de matchmaking (bouton "Annuler la recherche" côté client). */
export async function leaveMatchmakingQueue(): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("matchmaking_queue").delete().eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
