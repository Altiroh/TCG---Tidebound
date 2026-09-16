import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { MAX_REWARDED_LEVEL, levelRewardItems, type LevelRewardItem } from "@/game/progression";
import type { CardRarity } from "@/game/boosters/types";
import { openLevelCardChoices } from "@/features/progression/cardChoices";

/**
 * Récompenses de niveau À RÉCLAMER — module SERVEUR (pas de `"use server"` :
 * ces fonctions prennent un identifiant de joueur, elles ne doivent pas
 * devenir des points d'entrée HTTP ; les actions exposées vivent dans
 * `profileActions.ts` et déduisent le joueur de sa session).
 *
 * Un palier franchi n'est plus crédité en fin de partie : il attend. Le
 * joueur vient le chercher au profil, et c'est ce geste qui crédite — le
 * moment de la récompense lui appartient.
 */

/** Une « carte au choix » ouverte et pas encore tranchée. */
export interface PendingCardChoice {
  id: string;
  /** Palier d'origine (`source_ref`), `null` pour une autre source. */
  level: number | null;
  rarity: CardRarity;
  offeredCardIds: string[];
}

export interface LevelRewardState {
  /** Niveau stocké — celui que `claim_level_reward` vérifie. */
  level: number;
  claimedLevels: number[];
  /** Paliers atteints et pas encore réclamés, du plus ancien au plus récent. */
  claimableLevels: number[];
  pendingCardChoices: PendingCardChoice[];
}

export function claimableLevelsFor(level: number, claimed: Iterable<number>): number[] {
  const done = new Set(claimed);
  const levels: number[] = [];
  for (let value = 1; value <= Math.min(level, MAX_REWARDED_LEVEL); value++) {
    if (!done.has(value) && levelRewardItems(value).length > 0) levels.push(value);
  }
  return levels;
}

export async function readLevelRewardState(userId: string): Promise<LevelRewardState> {
  const service = createSupabaseServiceRoleClient();
  const [progression, claimed, choices] = await Promise.all([
    service.from("player_progression").select("level").eq("user_id", userId).maybeSingle(),
    service.from("player_level_rewards").select("level").eq("user_id", userId),
    service.from("player_card_choices").select("id, source, source_ref, rarity, offered_card_ids").eq("user_id", userId).is("resolved_at", null),
  ]);

  const level = progression.data?.level ?? 1;
  const claimedLevels = (claimed.data ?? []).map((row) => row.level);
  return {
    level,
    claimedLevels,
    claimableLevels: claimableLevelsFor(level, claimedLevels),
    pendingCardChoices: (choices.data ?? []).map((row) => ({
      id: row.id,
      level: row.source === "level" && /^\d+$/.test(row.source_ref) ? Number(row.source_ref) : null,
      rarity: row.rarity,
      offeredCardIds: row.offered_card_ids,
    })),
  };
}

export interface ClaimLevelRewardResult {
  ok: boolean;
  error?: string;
  level?: number;
  items?: readonly LevelRewardItem[];
  /** Le palier ouvrait un choix de carte : les propositions, à trancher tout de suite. */
  cardChoice?: PendingCardChoice;
}

/**
 * Réclame UN palier. Le contenu vient de la table TypeScript, pas du
 * client ; la base vérifie que le niveau est atteint et que le palier n'a
 * pas déjà été payé.
 */
export async function claimLevelRewardFor(userId: string, level: number): Promise<ClaimLevelRewardResult> {
  const items = levelRewardItems(level);
  if (!Number.isInteger(level) || items.length === 0) return { ok: false, error: "Palier inconnu." };

  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.rpc("claim_level_reward", {
      p_user_id: userId,
      p_level: level,
      p_items: items,
    });
    if (error) {
      console.error("[claimLevelRewardFor] Réclamation refusée :", error.message);
      const missing = /function .*claim_level_reward/i.test(error.message) || error.code === "PGRST202";
      return {
        ok: false,
        error: missing
          ? "La réclamation des paliers n'est pas encore installée en base (migration 20260920120000 à appliquer)."
          : "Réclamation impossible pour l'instant — réessaie dans un instant.",
      };
    }
    if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

    // Palier « carte au choix » : le tirage est fait ICI, figé en base, puis
    // renvoyé pour que le joueur tranche sur-le-champ.
    const choices = items
      .filter((item): item is Extract<LevelRewardItem, { kind: "cardChoice" }> => item.kind === "cardChoice")
      .map((item) => ({ level, rarity: item.rarity, choices: item.choices }));
    let cardChoice: PendingCardChoice | undefined;
    if (choices.length > 0) {
      await openLevelCardChoices(userId, choices);
      const { data: opened } = await service
        .from("player_card_choices")
        .select("id, rarity, offered_card_ids")
        .eq("user_id", userId)
        .eq("source", "level")
        .eq("source_ref", String(level))
        .is("resolved_at", null)
        .maybeSingle();
      if (opened) cardChoice = { id: opened.id, level, rarity: opened.rarity, offeredCardIds: opened.offered_card_ids };
    }

    return { ok: true, level, items, cardChoice };
  } catch (cause) {
    console.error("[claimLevelRewardFor] Échec :", cause);
    return { ok: false, error: "Réclamation impossible pour l'instant — réessaie dans un instant." };
  }
}

export async function resolveCardChoiceFor(userId: string, choiceId: string, cardId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("resolve_card_choice", {
      p_user_id: userId,
      p_choice_id: choiceId,
      p_card_id: cardId,
    });
    if (error) {
      console.error("[resolveCardChoiceFor] Refusé :", error.message);
      return { ok: false, error: "Choix impossible pour l'instant — réessaie dans un instant." };
    }
    return data?.ok ? { ok: true } : { ok: false, error: data?.error ?? "Choix impossible." };
  } catch (cause) {
    console.error("[resolveCardChoiceFor] Échec :", cause);
    return { ok: false, error: "Choix impossible pour l'instant — réessaie dans un instant." };
  }
}
