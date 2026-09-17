import { CARD_BACK_COSMETIC_KIND, SHIP_FRAME_COSMETIC_KIND, cardBackById, shipFrameById } from "@/game";
import { DEFAULT_PLAYER_COSMETICS, type PlayerCosmetics } from "@/features/cosmetics/MatchCosmeticsProvider";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Les cosmétiques VISIBLES qu'un lot de joueurs a équipés — dos de carte et
 * cadre de Navire — pour les montrer à leur adversaire.
 *
 * Lecture avec la clé service_role : `player_cosmetics` n'est lisible par
 * RLS que par son propriétaire, or c'est justement l'AUTRE joueur qui a
 * besoin de savoir. Rien de sensible ne sort : un dos et un cadre sont, par
 * construction, ce que tout le monde voit sur la table.
 *
 * Un identifiant inconnu du catalogue (cosmétique retiré, ligne d'une
 * ancienne version) retombe sur celui d'origine ; une base injoignable
 * rend les cosmétiques d'origine pour tout le monde. Une partie ne doit
 * jamais attendre un dos de carte.
 */
export async function loadEquippedCosmetics(userIds: readonly string[]): Promise<Record<string, PlayerCosmetics>> {
  const result: Record<string, PlayerCosmetics> = {};
  const distinct = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  for (const id of distinct) result[id] = { ...DEFAULT_PLAYER_COSMETICS };
  if (distinct.length === 0) return result;

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service
      .from("player_cosmetics")
      .select("user_id, cosmetic_kind, cosmetic_id")
      .in("user_id", distinct)
      .eq("equipped", true)
      .in("cosmetic_kind", [CARD_BACK_COSMETIC_KIND, SHIP_FRAME_COSMETIC_KIND]);
    if (error) {
      console.error("[loadEquippedCosmetics] Lecture impossible :", error.message);
      return result;
    }

    for (const row of data ?? []) {
      const target = result[row.user_id];
      if (!target) continue;
      if (row.cosmetic_kind === CARD_BACK_COSMETIC_KIND && cardBackById(row.cosmetic_id)) target.cardBackId = row.cosmetic_id;
      if (row.cosmetic_kind === SHIP_FRAME_COSMETIC_KIND && shipFrameById(row.cosmetic_id)) target.shipFrameId = row.cosmetic_id;
    }
  } catch (cause) {
    console.error("[loadEquippedCosmetics] Échec inattendu :", cause);
  }

  return result;
}
