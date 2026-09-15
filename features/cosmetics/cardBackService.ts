import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CARD_BACKS, DEFAULT_CARD_BACK_ID, cardBackById, type CardBackSkin } from "@/game";

/**
 * Dos de carte — lecture et équipement côté SERVEUR. Pas de `"use server"` :
 * ces fonctions prennent un identifiant de joueur en paramètre et ne doivent
 * pas devenir des points d'entrée HTTP. Les actions exposées vivent dans
 * `features/cosmetics/actions.ts` et déduisent le joueur de sa session.
 */

const COSMETIC_KIND = "cardBack";

export interface CardBackOption extends CardBackSkin {
  owned: boolean;
  equipped: boolean;
}

export interface CardBackCollection {
  options: CardBackOption[];
  /** Identifiant équipé — toujours un dos possédé, `"default"` par défaut. */
  equipped: string;
}

/**
 * Catalogue vu par CE joueur : chaque dos avec sa possession et son état.
 *
 * Le catalogue complet est renvoyé, verrouillés compris — un cosmétique
 * qu'on ne voit pas ne donne envie de rien, et le sélecteur affiche à quel
 * niveau il tombe.
 */
export async function loadCardBacks(userId: string | null): Promise<CardBackCollection> {
  const base = (owned: (id: string) => boolean, equipped: string): CardBackCollection => ({
    equipped,
    options: CARD_BACKS.map((back) => ({ ...back, owned: back.free || owned(back.id), equipped: back.id === equipped })),
  });

  if (!userId) return base(() => false, DEFAULT_CARD_BACK_ID);

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service
      .from("player_cosmetics")
      .select("cosmetic_id, equipped")
      .eq("user_id", userId)
      .eq("cosmetic_kind", COSMETIC_KIND);

    if (error) throw new Error(error.message);

    const ownedIds = new Set((data ?? []).map((row) => row.cosmetic_id));
    // Un dos équipé qui aurait disparu du catalogue (retrait, renommage) ne
    // doit pas laisser le joueur sans dos : on retombe sur le défaut.
    const equippedRow = (data ?? []).find((row) => row.equipped)?.cosmetic_id;
    const equipped = cardBackById(equippedRow) ? (equippedRow as string) : DEFAULT_CARD_BACK_ID;

    return base((id) => ownedIds.has(id), equipped);
  } catch (error) {
    console.error("[loadCardBacks] Lecture impossible :", error);
    return base(() => false, DEFAULT_CARD_BACK_ID);
  }
}

export interface EquipCardBackResult {
  ok: boolean;
  error?: string;
  equipped?: string;
}

/**
 * Équipe un dos. La possession est vérifiée EN BASE (`equip_cosmetic`), pas
 * ici : le client peut demander n'importe quel identifiant, le serveur
 * refuse ce qui n'est pas débloqué.
 */
export async function equipCardBackFor(userId: string, cardBackId: string): Promise<EquipCardBackResult> {
  const skin = cardBackById(cardBackId);
  if (!skin) return { ok: false, error: "Ce dos de carte n'existe pas." };

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("equip_cosmetic", {
      p_user_id: userId,
      p_cosmetic_kind: COSMETIC_KIND,
      // Le dos par défaut n'est jamais stocké : l'équiper, c'est n'avoir
      // aucune ligne équipée.
      p_cosmetic_id: skin.free ? null : skin.id,
    });

    if (error) return { ok: false, error: error.message };
    if (!data?.ok) {
      return { ok: false, error: data?.error === "not_owned" ? "Ce dos n'est pas encore débloqué." : "Équipement refusé." };
    }
    return { ok: true, equipped: skin.id };
  } catch (error) {
    console.error("[equipCardBackFor] Échec :", error);
    return { ok: false, error: "Équipement impossible pour le moment." };
  }
}
