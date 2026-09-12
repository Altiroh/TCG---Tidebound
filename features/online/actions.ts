"use server";

import { redirect } from "next/navigation";
import { createGameState, dispatch, type GameState, type PlayerAction } from "@/game";
import { PRECONSTRUCTED_DECKS } from "@/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/features/online/inviteCode";
import { awardMatchReward } from "@/features/progression/actions";
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

  const justFinished = result.state.status === "finished";

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      state: result.state,
      status: justFinished ? "finished" : "active",
      winner_id: result.state.winnerId ?? null,
      finished_at: justFinished ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (updateError) return { ok: false, error: updateError.message };

  // Progression : octroyée APRÈS la persistance de l'état final, pour ne
  // jamais récompenser une partie dont la fin n'a pas été enregistrée.
  // L'idempotence est garantie en base (`match_rewards`), donc rejouer ce
  // chemin — double soumission, reprise réseau — ne double jamais la
  // récompense, et une récompense en échec ne fait pas échouer le coup joué.
  if (justFinished) await awardFinishedMatch(match, result.state);

  return { ok: true, data: result.state };
}

/**
 * Récompense les DEUX joueurs d'une partie terminée.
 *
 * Une partie en ligne est le seul enregistrement de match fiable
 * aujourd'hui : l'état vient du moteur exécuté côté serveur, et les deux
 * joueurs sont identifiés par leur `profiles.id`. Les parties contre bot
 * (`features/match/createLocalMatch.ts`) sont purement locales au
 * navigateur — leur accorder de l'XP reviendrait à laisser le client
 * s'attribuer de la progression, et donc, via les paliers, des Tides. Elles
 * n'en donnent donc pas encore (cf. README) ; le calcul les gère déjà
 * (`MATCH_XP.bot*`, 0 Tide) et n'attend que des parties bot persistées.
 */
async function awardFinishedMatch(match: MatchRow, finalState: GameState): Promise<void> {
  const participants = [match.player1_id, match.player2_id].filter((id): id is string => Boolean(id));
  // Une partie contre soi-même (même compte aux deux places) ne serait de
  // toute façon payée qu'une fois — `match_rewards` a une clé
  // (match_id, user_id) — mais autant ne pas émettre le second octroi.
  const uniqueParticipants = Array.from(new Set(participants));

  await Promise.all(
    uniqueParticipants.map((userId) =>
      awardMatchReward({
        matchId: match.id,
        userId,
        mode: match.mode,
        outcome: resolveWinnerUserId(match, finalState) === userId ? "win" : "loss",
      })
    )
  );
}

/**
 * Traduit le vainqueur du moteur en uuid de profil.
 *
 * `PlayerId` est un simple `string` et sa valeur dépend de qui a créé la
 * partie : `joinOnlineMatch` passe directement les uuid de profil au moteur
 * (`createGameState`), donc `winnerId` EST déjà un uuid ici — alors qu'une
 * partie locale utilise "p1"/"p2" (`createLocalMatch`). Les deux formes sont
 * acceptées plutôt qu'une seule supposée : se tromper ici fait silencieusement
 * perdre la victoire des deux joueurs (aucun ne correspond, donc deux
 * défaites), sans erreur visible.
 */
function resolveWinnerUserId(match: MatchRow, finalState: GameState): string | null {
  const winner = finalState.winnerId;
  if (!winner) return null;
  if (winner === match.player1_id || winner === match.player2_id) return winner;
  if (winner === "p1") return match.player1_id;
  if (winner === "p2") return match.player2_id;

  console.error(`[awardFinishedMatch] Vainqueur non résolu pour la partie ${match.id} : "${winner}".`);
  return null;
}
