import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { resolveMatchDeck, type MatchDeckResult } from "@/features/decks/matchDeck";
import { generateInviteCode } from "@/features/online/inviteCode";

/**
 * Création d'un MATCH AMICAL en attente — module SERVEUR, sans directive
 * `"use server"` : il prend l'identifiant du joueur en paramètre, il ne doit
 * donc être joignable que par du code serveur qui l'a tiré de la session
 * (`createOnlineMatch`, `challengeFriend`).
 */

/** Message montré au joueur quand son deck ne peut pas entrer en partie. */
export function deckRejection(result: MatchDeckResult & { ok: false }): string {
  if (result.reason === "invalid") return `Ce deck n'est pas jouable en l'état : ${result.detail}`;
  if (result.reason === "unavailable") return "Le serveur ne peut pas lire ton deck pour l'instant — réessaie dans un instant.";
  return "Deck inconnu.";
}

export type WaitingMatchResult = { ok: true; matchId: string; inviteCode: string } | { ok: false; error: string };

export async function createWaitingMatch(userId: string, deckId: string): Promise<WaitingMatchResult> {
  const own = await resolveMatchDeck(userId, deckId);
  if (!own.ok) return { ok: false, error: deckRejection(own) };

  const service = createSupabaseServiceRoleClient();
  // Une seule partie en attente par joueur : la précédente est fermée. Sans
  // ce plafond, un script pouvait remplir la table de parties vides.
  const { error: closeError } = await service
    .from("matches")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("player1_id", userId)
    .eq("status", "waiting");
  if (closeError) console.error("[createWaitingMatch] Fermeture des parties en attente impossible :", closeError.message);

  const { data, error } = await service
    .from("matches")
    // Mode explicite : c'est lui qui fait d'une partie un match amical, sans récompense.
    .insert({ player1_id: userId, player1_deck_id: deckId, invite_code: generateInviteCode(), status: "waiting", mode: "private_invite" })
    .select("id, invite_code")
    .single();

  if (error || !data) {
    console.error("[createWaitingMatch] Création refusée :", error?.message);
    return { ok: false, error: "Échec de la création de la partie." };
  }
  return { ok: true, matchId: data.id, inviteCode: data.invite_code };
}
