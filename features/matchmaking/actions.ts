"use server";

import { redirect } from "next/navigation";
import { createGameState } from "@/game";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMatchDeck } from "@/features/decks/matchDeck";
import { getSessionUser } from "@/lib/supabase/sessionUser";

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUser() {
  const supabase = createSupabaseServerClient();
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return { supabase, user };
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
  const { supabase, user } = await requireUser();
  const self = await resolveMatchDeck(user.id, deckId);
  if (!self.ok) return { ok: false, error: "Deck inconnu." };
  const selfDeck = self.deck;

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
  // Le deck de l'adversaire, résolu sous SON identité.
  const opponentResolved = await resolveMatchDeck(opponent.opponent_user_id, opponent.opponent_deck_id);
  const opponentDeck = opponentResolved.ok ? opponentResolved.deck : undefined;
  await supabase.from("matchmaking_queue").delete().eq("user_id", user.id);
  if (!opponentDeck) return { ok: false, error: "Le deck de l'adversaire est introuvable." };

  const matchId = crypto.randomUUID();
  const state = createGameState({
    gameId: matchId,
    player1: { id: user.id, deck: selfDeck },
    player2: { id: opponent.opponent_user_id, deck: opponentDeck },
  });

  // Partie et état privé créés dans la même transaction, avec la clé
  // service_role : `matches` n'accepte plus aucune écriture navigateur.
  const { data: created, error: createError } = await createSupabaseServiceRoleClient().rpc("create_active_match", {
    p_match_id: matchId,
    // Sans usage pour une partie appariée (pas de lien à partager), mais la
    // colonne reste `not null unique` : dérivée de l'id de partie.
    p_invite_code: matchId.slice(0, 8).toUpperCase(),
    p_mode: "matchmaking",
    p_player1_id: user.id,
    p_player1_deck_id: deckId,
    p_player2_id: opponent.opponent_user_id,
    p_player2_deck_id: opponent.opponent_deck_id,
    p_bot_difficulty: null,
    p_state: state,
  });

  if (createError || !created?.ok) {
    return { ok: false, error: createError?.message ?? created?.error ?? "Échec de la création de la partie." };
  }
  return { ok: true, data: { status: "matched", matchId } };
}

/** Quitte la file de matchmaking (bouton "Annuler la recherche" côté client). */
export async function leaveMatchmakingQueue(): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("matchmaking_queue").delete().eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/**
 * La partie en cours de ce joueur, s'il vient d'être apparié.
 *
 * L'appariement n'est tenté qu'au moment où QUELQU'UN rejoint la file
 * (`claim_matchmaking_opponent`) : celui qui attendait déjà n'apprend donc
 * rien par la valeur de retour de son propre appel — c'est l'arrivant qui a
 * créé la partie, de son côté. Il faut bien que le premier l'apprenne
 * autrement, et c'est ce que cette fonction permet.
 *
 * Interrogée périodiquement plutôt qu'écoutée en Realtime : un abonnement
 * demanderait deux canaux (le joueur peut être `player1` ou `player2`, et
 * un filtre Realtime ne porte que sur une colonne), et tomberait en silence
 * si Realtime n'est pas activé sur le projet. Une file d'attente qui ne
 * démarre jamais la partie est le pire résultat possible ; quelques
 * requêtes par minute sont un prix raisonnable pour ne pas en dépendre.
 */
export async function findMyActiveMatch(): Promise<ActionResult<{ matchId: string | null }>> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("matches")
    .select("id, created_at")
    .eq("mode", "matchmaking")
    .eq("status", "active")
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { matchId: data?.id ?? null } };
}
