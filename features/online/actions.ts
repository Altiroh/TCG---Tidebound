"use server";

import { redirect } from "next/navigation";
import { createGameState, type PlayerAction } from "@/game";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { createWaitingMatch, deckRejection } from "@/features/online/waitingMatch";
import {
  advanceBot,
  loadSnapshot,
  settleExpiredDeadlines,
  submitAction,
  type MatchSnapshot,
  type MatchUpdate,
} from "@/features/matches/matchStore";
import { packFrames, type PackedFrames } from "@/features/matches/matchFrames";
import { resolveMatchDeck } from "@/features/decks/matchDeck";
import { resumeVerdict } from "@/features/online/resumable";
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

async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  return user;
}

/** Crée une partie en attente d'un second joueur, avec un code d'invitation. */
export async function createOnlineMatch(deckId: string): Promise<ActionResult<{ matchId: string; inviteCode: string }>> {
  const user = await requireUser();
  const created = await createWaitingMatch(user.id, deckId);
  if (!created.ok) return { ok: false, error: created.error };
  return { ok: true, data: { matchId: created.matchId, inviteCode: created.inviteCode } };
}

/** Rejoint une partie en attente via son code d'invitation et démarre la partie. */
export async function joinOnlineMatch(inviteCode: string, deckId: string): Promise<ActionResult<{ matchId: string }>> {
  const user = await requireUser();
  if (typeof inviteCode !== "string" || typeof deckId !== "string" || inviteCode.length > 32) {
    return { ok: false, error: "Aucune partie en attente avec ce code." };
  }
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

  if (findError) {
    console.error("[joinOnlineMatch] Recherche refusée :", findError.message);
    return { ok: false, error: "Impossible de chercher cette partie pour l'instant." };
  }
  // Hôte absent : son compte a été supprimé depuis la création de la partie.
  if (!match || !match.player1_id) return { ok: false, error: "Aucune partie en attente avec ce code." };
  if (match.player1_id === user.id) return { ok: false, error: "Tu ne peux pas rejoindre ta propre partie." };

  // Le deck de l'HÔTE, résolu sous SON identité : un deck personnel
  // n'appartient qu'à son auteur, et c'est lui qui l'a choisi.
  const hostDeck = await resolveMatchDeck(match.player1_id, match.player1_deck_id);
  if (!hostDeck.ok) return { ok: false, error: "Le deck de ton adversaire n'est plus disponible." };
  const deck1 = hostDeck.deck;

  const hostId = match.player1_id;
  const state = createGameState({
    gameId: match.id,
    player1: { id: hostId, deck: deck1 },
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
  if (error) {
    console.error("[joinOnlineMatch] Activation refusée :", error.message);
    return { ok: false, error: "Impossible de rejoindre cette partie." };
  }
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
  // Une lecture est aussi le moment où le serveur constate l'heure : si
  // l'adversaire a laissé filer son délai, la partie avance ICI, sans que
  // le navigateur n'ait rien déclaré. C'est ce qui permet au joueur présent
  // de sortir d'une table que l'autre a quittée.
  // Une seule lecture en base : le rattrapage rend la partie telle qu'elle est.
  const snapshot = await settleExpiredDeadlines(matchId, user.id);
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

/**
 * Partie contre bot : fait jouer au bot la tranche suivante de son tour
 * (`advanceBot`). Appelée par l'écran tant que `botToMove` le demande,
 * pendant qu'il rejoue ce qu'il a déjà reçu.
 */
export async function advanceBotMatch(matchId: string): Promise<ActionResult<MatchUpdate>> {
  const user = await requireUser();
  try {
    const result = await advanceBot(matchId, user.id);
    return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
  } catch (error) {
    console.error("[advanceBotMatch] Échec :", error);
    return { ok: false, error: "Le bot n'a pas pu jouer, réessaie." };
  }
}

/**
 * Ferme la partie en attente que l'appelant a créée (« Annuler » de la salle
 * d'attente). Sans elle, le code restait valable : un ami arrivé après coup
 * rejoignait une table que son hôte avait quittée.
 */
export async function cancelWaitingMatch(matchId: string): Promise<ActionResult<null>> {
  const user = await requireUser();
  const { error } = await createSupabaseServiceRoleClient()
    .from("matches")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", matchId)
    .eq("player1_id", user.id)
    .eq("status", "waiting");
  if (error) {
    console.error("[cancelWaitingMatch] Fermeture refusée :", error.message);
    return { ok: false, error: "Impossible d'annuler la partie pour l'instant." };
  }
  return { ok: true, data: null };
}

/** Une partie que le joueur peut reprendre : en cours, ou en attente de son invité. */
export interface ResumableMatch {
  matchId: string;
  mode: "private_invite" | "matchmaking" | "bot";
  status: "waiting" | "active";
}

/**
 * La partie la plus récente que ce joueur a laissée ouverte — pour lui
 * proposer de la reprendre au lieu de la laisser filer vers le forfait
 * (onglet fermé, rechargement, retour au menu). `null` si rien n'attend.
 *
 * Chaque candidate est VÉRIFIÉE avant d'être proposée (`resumeVerdict`) :
 * échéances rattrapées, état de jeu relu. Celles qui ne se reprendront
 * jamais (état manquant ou illisible, table contre le bot délaissée,
 * invitation expirée) sont fermées au passage : le bandeau ne ment plus.
 */
export async function findResumableMatch(): Promise<ResumableMatch | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service
    .from("matches")
    .select("id, mode, status, updated_at")
    .in("status", ["waiting", "active"])
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error("[findResumableMatch] Lecture impossible :", error.message);
    return null;
  }

  const now = Date.now();
  for (const row of data ?? []) {
    if (row.status !== "waiting" && row.status !== "active") continue;
    let game = "missing";
    if (row.status === "active") {
      try {
        // Un délai échu peut avoir terminé la partie : on le constate avant de la proposer.
        const snapshot = await settleExpiredDeadlines(row.id, user.id);
        game = snapshot?.view ? snapshot.view.status : "missing";
      } catch (readError) {
        console.error(`[findResumableMatch] État illisible pour ${row.id} :`, readError);
        game = "broken";
      }
    }
    const verdict = resumeVerdict({ mode: row.mode, status: row.status, updatedAt: row.updated_at }, game, now);
    if (verdict === "resume") return { matchId: row.id, mode: row.mode, status: row.status };
    if (verdict === "close") {
      const { error: closeError } = await service
        .from("matches")
        .update({ status: "abandoned", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .in("status", ["waiting", "active"]);
      if (closeError) console.error(`[findResumableMatch] Fermeture de ${row.id} impossible :`, closeError.message);
    }
  }
  return null;
}
