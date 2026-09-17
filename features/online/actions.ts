"use server";

import { redirect } from "next/navigation";
import { createGameState, type PlayerAction } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/features/online/inviteCode";
import {
  loadSnapshot,
  submitAction,
  type MatchSnapshot,
  type MatchUpdate,
} from "@/features/matches/matchStore";
import { packFrames, type PackedFrames } from "@/features/matches/matchFrames";
import { resolveMatchDeck, type MatchDeckResult } from "@/features/decks/matchDeck";
import { loadEquippedCosmetics } from "@/features/cosmetics/equippedCosmeticsService";
import type { PlayerCosmetics } from "@/features/cosmetics/MatchCosmeticsProvider";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/**
 * Parties en ligne — Server Actions exposées au navigateur.
 *
 * Le joueur est toujours déduit de la session. Aucune de ces actions ne
 * renvoie l'état complet d'une partie : seulement la vue projetée de
 * l'appelant (`features/matches/matchStore.ts`).
 */

export interface ActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Message montré au joueur quand son deck ne peut pas entrer en partie. */
function deckRejection(result: MatchDeckResult & { ok: false }): string {
  if (result.reason === "invalid") return `Ce deck n'est pas jouable en l'état : ${result.detail}`;
  if (result.reason === "unavailable") return "Le serveur ne peut pas lire ton deck pour l'instant — réessaie dans un instant.";
  return "Deck inconnu.";
}

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

/** Crée une partie en attente d'un second joueur, avec un code d'invitation. */
export async function createOnlineMatch(deckId: string): Promise<ActionResult<{ matchId: string; inviteCode: string }>> {
  const user = await requireUser();
  const own = await resolveMatchDeck(user.id, deckId);
  if (!own.ok) return { ok: false, error: deckRejection(own) };

  const { data, error } = await createSupabaseServiceRoleClient()
    .from("matches")
    .insert({ player1_id: user.id, player1_deck_id: deckId, invite_code: generateInviteCode(), status: "waiting" })
    .select("id, invite_code")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Échec de la création de la partie." };
  return { ok: true, data: { matchId: data.id, inviteCode: data.invite_code } };
}

/** Rejoint une partie en attente via son code d'invitation et démarre la partie. */
export async function joinOnlineMatch(inviteCode: string, deckId: string): Promise<ActionResult<{ matchId: string }>> {
  const user = await requireUser();
  const own = await resolveMatchDeck(user.id, deckId);
  if (!own.ok) return { ok: false, error: deckRejection(own) };
  const deck2 = own.deck;
  const service = createSupabaseServiceRoleClient();

  const { data: match, error: findError } = await service
    .from("matches")
    .select("*")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .eq("status", "waiting")
    .maybeSingle();

  if (findError) return { ok: false, error: findError.message };
  if (!match) return { ok: false, error: "Aucune partie en attente avec ce code." };
  if (match.player1_id === user.id) return { ok: false, error: "Tu ne peux pas rejoindre ta propre partie." };

  // Le deck de l'HÔTE, résolu sous SON identité : un deck personnel
  // n'appartient qu'à son auteur, et c'est lui qui l'a choisi.
  const hostDeck = await resolveMatchDeck(match.player1_id, match.player1_deck_id);
  if (!hostDeck.ok) return { ok: false, error: "Le deck de ton adversaire n'est plus disponible." };
  const deck1 = hostDeck.deck;

  const state = createGameState({
    gameId: match.id,
    player1: { id: match.player1_id, deck: deck1 },
    player2: { id: user.id, deck: deck2 },
  });

  // Atomique : passage en `active` et création de l'état privé réussissent
  // ensemble, et un second joueur arrivé au même instant est refusé.
  const { data: activated, error } = await service.rpc("activate_waiting_match", {
    p_match_id: match.id,
    p_player2_id: user.id,
    p_player2_deck_id: deckId,
    p_state: state,
  });
  if (error) return { ok: false, error: error.message };
  if (!activated?.ok) return { ok: false, error: activated?.error ?? "Impossible de rejoindre cette partie." };

  return { ok: true, data: { matchId: match.id } };
}

/**
 * Métadonnées de la partie et vue projetée pour l'appelant. Appelée au
 * chargement, puis chaque fois que Realtime signale une nouvelle version.
 */
export async function fetchMatchView(
  matchId: string
): Promise<ActionResult<{ match: MatchSnapshot["match"]; frames: PackedFrames | null }>> {
  const user = await requireUser();
  const snapshot = await loadSnapshot(matchId, user.id);
  if (!snapshot) return { ok: false, error: "Partie introuvable." };
  // Emballée comme les vues d'un coup : les decks masqués ne font pas le voyage (`matchFrames`).
  return { ok: true, data: { match: snapshot.match, frames: snapshot.view ? packFrames([snapshot.view]) : null } };
}

/**
 * Dos de carte et cadre de Navire équipés par CHAQUE joueur de la partie,
 * par identifiant de joueur — pour que l'adversaire soit dessiné avec les
 * siens, pas avec ceux du joueur local. Réservé aux participants : on ne
 * lit pas les cosmétiques d'une table où l'on n'est pas assis, même s'ils
 * n'ont rien de secret. Le bot n'a pas d'entrée : il joue avec ceux
 * d'origine.
 */
export async function fetchMatchCosmetics(matchId: string): Promise<ActionResult<Record<string, PlayerCosmetics>>> {
  const user = await requireUser();
  const snapshot = await loadSnapshot(matchId, user.id);
  if (!snapshot) return { ok: false, error: "Partie introuvable." };
  const { player1_id, player2_id } = snapshot.match;
  const cosmetics = await loadEquippedCosmetics([player1_id, player2_id].filter((id): id is string => Boolean(id)));
  return { ok: true, data: cosmetics };
}

/**
 * Propose un coup. Le serveur recharge l'état complet, vérifie que le coup
 * est joué au nom de l'appelant, le fait valider par le moteur
 * (`dispatch()`), fait jouer le bot le cas échéant, puis enregistre. Le
 * navigateur ne décide jamais de l'issue d'une action — ni d'une partie.
 */
export async function submitMatchAction(matchId: string, action: PlayerAction): Promise<ActionResult<MatchUpdate>> {
  const user = await requireUser();
  try {
    const result = await submitAction(matchId, user.id, action);
    return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  } catch (error) {
    console.error("[submitMatchAction] Échec :", error);
    return { ok: false, error: "Coup non enregistré, réessaie." };
  }
}
