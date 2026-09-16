import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { claimLevelRewardFor, claimableLevelsFor, type ClaimLevelRewardResult } from "@/features/progression/levelRewardService";

/**
 * CENTRE DES RÉCOMPENSES — module SERVEUR (pas de `"use server"`).
 *
 * Tout ce qui attend le joueur se réclame au même endroit, le profil :
 * paliers de niveau, quêtes terminées, exploits débloqués. Ce module sait
 * réclamer chacun, et tout d'un coup.
 */

export interface ClaimAchievementResult {
  ok: boolean;
  error?: string;
  code?: string;
  tides?: number;
}

export async function claimAchievementFor(userId: string, code: string): Promise<ClaimAchievementResult> {
  try {
    const { data, error } = await createSupabaseServiceRoleClient().rpc("claim_achievement", { p_user_id: userId, p_code: code });
    if (error) {
      console.error("[claimAchievementFor] Refusé :", error.message);
      const missing = /function .*claim_achievement/i.test(error.message) || error.code === "PGRST202";
      return {
        ok: false,
        error: missing
          ? "La réclamation des exploits n'est pas encore installée en base (migration 20260920120000 à appliquer)."
          : "Réclamation impossible pour l'instant — réessaie dans un instant.",
      };
    }
    return data?.ok ? { ok: true, code, tides: data.tides ?? 0 } : { ok: false, error: data?.error ?? "Réclamation impossible." };
  } catch (cause) {
    console.error("[claimAchievementFor] Échec :", cause);
    return { ok: false, error: "Réclamation impossible pour l'instant — réessaie dans un instant." };
  }
}

export interface ClaimQuestOutcome {
  ok: boolean;
  error?: string;
  tides: number;
  xp: number;
  boosterId: string | null;
}

async function claimQuestFor(userId: string, questId: string, periodKey: string): Promise<ClaimQuestOutcome> {
  const { data, error } = await createSupabaseServiceRoleClient().rpc("claim_quest_reward", {
    p_user_id: userId,
    p_quest_id: questId,
    p_period_key: periodKey,
  });
  if (error) {
    console.error("[claimQuestFor] Refusé :", error.message);
    return { ok: false, error: "Réclamation de quête impossible pour le moment.", tides: 0, xp: 0, boosterId: null };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation de quête impossible.", tides: 0, xp: 0, boosterId: null };
  return { ok: true, tides: data.tides_gained ?? 0, xp: data.xp_gained ?? 0, boosterId: data.booster_id ?? null };
}

export interface ClaimEverythingResult {
  ok: boolean;
  /** Premier refus rencontré — ce qui a été réclamé avant reste acquis. */
  error?: string;
  levels: ClaimLevelRewardResult[];
  quests: { count: number; tides: number; xp: number; boosterIds: string[] };
  achievements: { count: number; tides: number };
}

/**
 * Réclame TOUT ce qui attend : paliers, quêtes terminées, exploits. Chaque
 * réclamation est une transaction à part en base ; un refus n'annule pas ce
 * qui a déjà été versé, et n'empêche pas les autres familles d'être tentées.
 */
export async function claimEverythingFor(userId: string): Promise<ClaimEverythingResult> {
  const service = createSupabaseServiceRoleClient();
  const result: ClaimEverythingResult = {
    ok: true,
    levels: [],
    quests: { count: 0, tides: 0, xp: 0, boosterIds: [] },
    achievements: { count: 0, tides: 0 },
  };
  const fail = (message?: string) => {
    result.ok = false;
    result.error ??= message;
  };

  const [progression, claimedLevels, quests, achievements] = await Promise.all([
    service.from("player_progression").select("level").eq("user_id", userId).maybeSingle(),
    service.from("player_level_rewards").select("level").eq("user_id", userId),
    service.from("player_quest_progress").select("quest_id, period_key").eq("user_id", userId).not("completed_at", "is", null).is("claimed_at", null),
    service.from("player_achievements").select("code").eq("user_id", userId).is("claimed_at", null),
  ]);

  // --- Paliers ------------------------------------------------------------
  for (const level of claimableLevelsFor(progression.data?.level ?? 1, (claimedLevels.data ?? []).map((row) => row.level))) {
    const claimed = await claimLevelRewardFor(userId, level);
    if (!claimed.ok) {
      fail(claimed.error);
      break;
    }
    result.levels.push(claimed);
  }

  // --- Quêtes -------------------------------------------------------------
  for (const quest of quests.data ?? []) {
    const claimed = await claimQuestFor(userId, quest.quest_id, quest.period_key);
    if (!claimed.ok) {
      fail(claimed.error);
      continue;
    }
    result.quests.count += 1;
    result.quests.tides += claimed.tides;
    result.quests.xp += claimed.xp;
    if (claimed.boosterId) result.quests.boosterIds.push(claimed.boosterId);
  }

  // --- Exploits (colonne `claimed_at` absente : migration pas passée, rien à réclamer) ---
  if (!achievements.error) {
    for (const achievement of achievements.data ?? []) {
      const claimed = await claimAchievementFor(userId, achievement.code);
      if (!claimed.ok) {
        fail(claimed.error);
        break;
      }
      result.achievements.count += 1;
      result.achievements.tides += claimed.tides ?? 0;
    }
  }

  return result;
}
