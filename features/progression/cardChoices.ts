import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CardRarity } from "@/game/boosters/types";

/**
 * Paliers « carte au choix parmi 3 » — module SERVEUR (pas de `"use server"`).
 *
 * Un palier de ce type (Notion « Progression joueur » §6) ne crédite rien
 * tout de suite : il OUVRE un choix. Les propositions sont tirées ICI, côté
 * serveur, et figées en base — si elles étaient tirées à l'affichage, un
 * joueur pourrait recharger la page jusqu'à tomber sur les cartes qu'il
 * veut.
 *
 * Le tirage écarte en priorité ce que le joueur possède déjà : une carte au
 * choix doit faire avancer la collection, pas offrir un doublon de plus.
 */

export interface LevelCardChoice {
  level: number;
  rarity: CardRarity;
  choices: number;
}

/** Mélange déterminé par `Math.random` — un tirage de récompense, pas un aléa de moteur. */
function pickRandom<T>(values: readonly T[], count: number): T[] {
  const pool = [...values];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}

/**
 * Ouvre les choix de carte des paliers franchis. Idempotent par palier
 * (`player_card_choices` a une contrainte d'unicité sur joueur + source) :
 * rejouer l'octroi ne rouvre pas un choix déjà tranché.
 */
export async function openLevelCardChoices(userId: string, choices: readonly LevelCardChoice[]): Promise<void> {
  if (choices.length === 0) return;
  try {
    const service = createSupabaseServiceRoleClient();

    const { data: owned } = await service.from("player_cards").select("card_id").eq("user_id", userId).gt("quantity", 0);
    const ownedIds = new Set((owned ?? []).map((row) => row.card_id));

    for (const choice of choices) {
      const { data: pool } = await service
        .from("cards")
        .select("id")
        .eq("rarity", choice.rarity)
        .eq("is_collectible", true)
        .eq("is_enabled", true);
      if (!pool || pool.length === 0) continue;

      // Priorité aux cartes manquantes ; on complète avec le reste si le
      // joueur possède déjà presque tout ce palier de rareté.
      const missing = pool.filter((row) => !ownedIds.has(row.id)).map((row) => row.id);
      const rest = pool.filter((row) => ownedIds.has(row.id)).map((row) => row.id);
      const offered = [...pickRandom(missing, choice.choices), ...pickRandom(rest, Math.max(0, choice.choices - missing.length))];
      if (offered.length === 0) continue;

      const { error } = await service.rpc("open_card_choice", {
        p_user_id: userId,
        p_source: "level",
        p_source_ref: String(choice.level),
        p_rarity: choice.rarity,
        p_card_ids: offered,
      });
      if (error) console.error("[openLevelCardChoices] Ouverture refusée :", error.message);
    }
  } catch (error) {
    console.error("[openLevelCardChoices] Échec :", error);
  }
}
