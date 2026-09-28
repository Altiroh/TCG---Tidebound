"use server";

import { redirect } from "next/navigation";
import { createGameState } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMatchDeck } from "@/features/decks/matchDeck";
import { deckRejection } from "@/features/online/waitingMatch";
import { getSessionUser } from "@/lib/supabase/sessionUser";

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Où en est la recherche du joueur :
 *   - `matched` : une partie l'attend, on y va ;
 *   - `queued`  : toujours en file, la recherche continue ;
 *   - `idle`    : plus en file (recherche annulée, ou purgée faute de
 *     signe de vie) — l'écran propose de relancer.
 */
export type MatchmakingStatus = { status: "matched"; matchId: string } | { status: "queued" } | { status: "idle" };

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

function service() {
  return createSupabaseServiceRoleClient();
}

/**
 * Rejoint la file de matchmaking et tente immédiatement un appariement.
 *
 * Appariement au PREMIER ARRIVÉ (décision du 28/09/2026) : le joueur qui
 * attend depuis le plus longtemps. La file n'est écrite que par le serveur
 * (clé service_role), avec un deck validé et une heure d'arrivée qui est la
 * sienne ; l'appariement lui-même (`claim_matchmaking_opponent`) est réservé
 * au serveur.
 *
 * Personne n'attendait : le joueur reste en file, et son écran sonde
 * `pollMatchmaking` — qui signale sa présence et retente l'appariement.
 */
export async function joinMatchmakingQueue(deckId: string): Promise<ActionResult<MatchmakingStatus>> {
  const user = await requireUser();
  const self = await resolveMatchDeck(user.id, deckId);
  if (!self.ok) return { ok: false, error: deckRejection(self) };

  const now = new Date().toISOString();
  const { error: upsertError } = await service()
    .from("matchmaking_queue")
    .upsert({ user_id: user.id, deck_id: deckId, queued_at: now, last_seen_at: now });
  if (upsertError) {
    console.error("[joinMatchmakingQueue] Mise en file refusée :", upsertError.message);
    return { ok: false, error: "Impossible de rejoindre la file pour l'instant." };
  }

  return tryPair(user.id, deckId);
}

/**
 * Sondage de l'écran de recherche, toutes les quelques secondes.
 *
 * Trois choses, dans l'ordre :
 *   1. une partie a-t-elle été créée pour ce joueur par quelqu'un qui l'a
 *      apparié ? Alors on y va ;
 *   2. sinon, il est toujours là : sa présence est notée (`last_seen_at`),
 *      faute de quoi la file le purgerait au bout de 30 secondes ;
 *   3. et l'appariement est retenté — deux joueurs arrivés au même instant
 *      se sont peut-être manqués (cf. la migration `20261017120000`).
 */
export async function pollMatchmaking(): Promise<ActionResult<MatchmakingStatus>> {
  const user = await requireUser();

  const active = await activeMatchmakingMatch(user.id);
  if (active) return { ok: true, data: { status: "matched", matchId: active } };

  const { data: entry, error } = await service()
    .from("matchmaking_queue")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("deck_id")
    .maybeSingle();
  if (error) {
    console.error("[pollMatchmaking] Présence non notée :", error.message);
    return { ok: true, data: { status: "queued" } };
  }
  if (!entry) return { ok: true, data: { status: "idle" } };

  return tryPair(user.id, entry.deck_id);
}

/**
 * Tente d'apparier `userId`, déjà en file avec `deckId`. Un adversaire
 * trouvé : la partie est créée ici (l'appelant devient joueur 1).
 */
async function tryPair(userId: string, deckId: string): Promise<ActionResult<MatchmakingStatus>> {
  const db = service();
  const { data: claimed, error: claimError } = await db.rpc("claim_matchmaking_opponent", { p_user_id: userId });
  if (claimError) {
    console.error("[matchmaking] Appariement refusé :", claimError.message);
    return { ok: false, error: "Impossible de chercher un adversaire pour l'instant." };
  }

  const opponent = claimed?.[0];
  if (!opponent) return { ok: true, data: { status: "queued" } };

  // Les deux decks, chacun résolu sous l'identité de SON joueur. Les deux
  // entrées ont quitté la file avec l'appariement.
  const [selfDeck, opponentDeck] = await Promise.all([
    resolveMatchDeck(userId, deckId),
    resolveMatchDeck(opponent.opponent_user_id, opponent.opponent_deck_id),
  ]);
  if (!selfDeck.ok || !opponentDeck.ok) {
    // Celui dont le deck tient toujours retourne en file : ce n'est pas à
    // lui de payer le deck devenu injouable de l'autre.
    const requeue = [
      selfDeck.ok ? { user_id: userId, deck_id: deckId } : null,
      opponentDeck.ok ? { user_id: opponent.opponent_user_id, deck_id: opponent.opponent_deck_id } : null,
    ].filter((row): row is { user_id: string; deck_id: string } => row !== null);
    if (requeue.length > 0) await db.from("matchmaking_queue").upsert(requeue);
    if (!selfDeck.ok) return { ok: false, error: deckRejection(selfDeck) };
    return { ok: true, data: { status: "queued" } };
  }

  const matchId = crypto.randomUUID();
  const state = createGameState({
    gameId: matchId,
    player1: { id: userId, deck: selfDeck.deck },
    player2: { id: opponent.opponent_user_id, deck: opponentDeck.deck },
  });

  // Partie et état privé créés dans la même transaction, avec la clé
  // service_role : `matches` n'accepte aucune écriture navigateur.
  const { data: created, error: createError } = await db.rpc("create_active_match", {
    p_match_id: matchId,
    // Sans usage pour une partie appariée (pas de lien à partager), mais la
    // colonne reste `not null unique` : dérivée de l'id de partie.
    p_invite_code: matchId.slice(0, 8).toUpperCase(),
    p_mode: "matchmaking",
    p_player1_id: userId,
    p_player1_deck_id: deckId,
    p_player2_id: opponent.opponent_user_id,
    p_player2_deck_id: opponent.opponent_deck_id,
    p_bot_difficulty: null,
    p_state: state,
  });

  if (createError || !created?.ok) {
    console.error("[matchmaking] Création de la partie refusée :", createError?.message ?? created?.error);
    // Les deux joueurs retournent en file : la recherche continue.
    await db.from("matchmaking_queue").upsert([
      { user_id: userId, deck_id: deckId },
      { user_id: opponent.opponent_user_id, deck_id: opponent.opponent_deck_id },
    ]);
    return { ok: true, data: { status: "queued" } };
  }
  return { ok: true, data: { status: "matched", matchId } };
}

/** Quitte la file de matchmaking (bouton « Annuler la recherche », page quittée). */
export async function leaveMatchmakingQueue(): Promise<ActionResult<null>> {
  const user = await requireUser();
  const { error } = await service().from("matchmaking_queue").delete().eq("user_id", user.id);
  if (error) {
    console.error("[leaveMatchmakingQueue] Sortie de file refusée :", error.message);
    return { ok: false, error: "Impossible de quitter la file pour l'instant." };
  }
  return { ok: true, data: null };
}

/** La partie de matchmaking en cours de ce joueur, s'il vient d'être apparié. */
async function activeMatchmakingMatch(userId: string): Promise<string | null> {
  const { data, error } = await service()
    .from("matches")
    .select("id")
    .eq("mode", "matchmaking")
    .eq("status", "active")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[matchmaking] Lecture de la partie en cours impossible :", error.message);
    return null;
  }
  return data?.id ?? null;
}
