import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { readOwnedEditions } from "@/lib/supabase/cardEditions";
import { isCardArtwork } from "@/game/cosmetics/artworks";
import { isCardFinish } from "@/game/cosmetics/finishes";
import { CARD_DATABASE } from "@/game";
import { emptyShowcase, ownsShowcaseCard, SHOWCASE_SIZE, type Showcase } from "@/features/friends/showcaseRules";

/**
 * Vitrine — module SERVEUR, sans directive `"use server"` (l'identifiant du
 * joueur est un paramètre : seul du code serveur qui l'a tiré de la session
 * l'appelle). Table `player_showcase`, migration `20261112120000`.
 *
 * Tolérant à une base sans la migration : la vitrine se lit vide, et son
 * enregistrement est refusé avec un message clair.
 */

function service() {
  return createSupabaseServiceRoleClient();
}

/** Possession du joueur : exemplaires par carte et éditions rares. */
async function readOwnership(userId: string) {
  const [{ data }, editions] = await Promise.all([
    service().from("player_cards").select("card_id, quantity").eq("user_id", userId).gt("quantity", 0),
    readOwnedEditions(userId),
  ]);
  const counts: Record<string, number> = Object.fromEntries((data ?? []).map((row) => [row.card_id, row.quantity]));
  return { counts, editions };
}

/**
 * Vitrine de plusieurs joueurs. Une carte qui n'est plus possédée (revendue,
 * échangée) n'est plus montrée : son emplacement se lit vide.
 */
export async function readShowcases(userIds: string[]): Promise<Record<string, Showcase>> {
  const result: Record<string, Showcase> = Object.fromEntries(userIds.map((id) => [id, emptyShowcase()]));
  if (userIds.length === 0) return result;
  try {
    const { data, error } = await service().from("player_showcase").select("user_id, slot, card_id, artwork, finish").in("user_id", userIds);
    if (error) {
      console.warn("[readShowcases] Vitrine illisible (migration 20261112120000 appliquée ?) :", error.message);
      return result;
    }
    const owners = [...new Set((data ?? []).map((row) => row.user_id))];
    const ownership = new Map(await Promise.all(owners.map(async (id) => [id, await readOwnership(id)] as const)));
    for (const row of data ?? []) {
      const { artwork, finish } = row;
      if (row.slot < 0 || row.slot >= SHOWCASE_SIZE || !CARD_DATABASE.has(row.card_id) || !isCardArtwork(artwork) || !isCardFinish(finish)) continue;
      const card = { cardId: row.card_id, artwork, finish };
      const owned = ownership.get(row.user_id);
      if (owned && ownsShowcaseCard(card, owned.counts, owned.editions)) result[row.user_id]![row.slot] = card;
    }
  } catch (error) {
    console.warn("[readShowcases] Lecture impossible :", error);
  }
  return result;
}

export async function readShowcase(userId: string): Promise<Showcase> {
  return (await readShowcases([userId]))[userId] ?? emptyShowcase();
}

/** Remplace la vitrine du joueur. Chaque carte doit être possédée dans l'édition exposée. */
export async function saveShowcase(userId: string, showcase: Showcase): Promise<{ ok: true } | { ok: false; error: string }> {
  const owned = await readOwnership(userId);
  if (showcase.some((card) => card && !ownsShowcaseCard(card, owned.counts, owned.editions))) {
    return { ok: false, error: "Une carte de la vitrine n'est pas dans ta collection." };
  }
  const rows = showcase.flatMap((card, slot) =>
    card ? [{ user_id: userId, slot, card_id: card.cardId, artwork: card.artwork, finish: card.finish, updated_at: new Date().toISOString() }] : []
  );
  const { error: clearError } = await service().from("player_showcase").delete().eq("user_id", userId);
  if (clearError) {
    console.error("[saveShowcase] Vitrine non effacée :", clearError.message);
    return { ok: false, error: "La vitrine n'est pas encore disponible." };
  }
  if (rows.length > 0) {
    const { error } = await service().from("player_showcase").insert(rows);
    if (error) {
      console.error("[saveShowcase] Vitrine non enregistrée :", error.message);
      return { ok: false, error: "Enregistrement impossible pour l'instant." };
    }
  }
  return { ok: true };
}
