"use server";

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { ensureCurrentQuests } from "@/features/quests/questService";
import {
  questLabel,
  questPeriodEndsAt,
  questPeriodKey,
  QUEST_OBJECTIVE_LABELS,
  type QuestObjectiveKey,
  type QuestType,
} from "@/game/quests";

/**
 * Quêtes — Server Actions exposées au navigateur. Le joueur est TOUJOURS
 * déduit de la session, jamais reçu en paramètre ; montants et état de
 * complétion sont relus en base par les fonctions Postgres.
 */

export interface QuestEntry {
  questId: string;
  periodKey: string;
  questType: QuestType;
  label: string;
  progress: number;
  target: number;
  rewardTides: number;
  rewardBoosterId: string | null;
  botProgressAllowed: boolean;
  completed: boolean;
  claimed: boolean;
  /** `true` pour une quête d'une période passée, terminée mais pas encore réclamée. */
  fromPreviousPeriod: boolean;
}

export interface QuestBoard {
  isSignedIn: boolean;
  daily: QuestEntry[];
  weekly: QuestEntry[];
  dailyEndsAt: string;
  weeklyEndsAt: string;
}

function isObjectiveKey(key: string): key is QuestObjectiveKey {
  return key in QUEST_OBJECTIVE_LABELS;
}

export async function fetchQuestBoard(): Promise<QuestBoard> {
  const now = new Date();
  const empty: QuestBoard = {
    isSignedIn: false,
    daily: [],
    weekly: [],
    dailyEndsAt: questPeriodEndsAt("daily", now).toISOString(),
    weeklyEndsAt: questPeriodEndsAt("weekly", now).toISOString(),
  };

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    await ensureCurrentQuests(user.id, now);

    const currentKeys = [questPeriodKey("daily", now), questPeriodKey("weekly", now)];
    const service = createSupabaseServiceRoleClient();
    const [{ data: rows, error }, { data: quests, error: questsError }] = await Promise.all([
      service
        .from("player_quest_progress")
        .select("*")
        .eq("user_id", user.id)
        // Période courante, ou quête terminée non réclamée d'une période passée.
        .or(`period_key.in.(${currentKeys.map((key) => `"${key}"`).join(",")}),and(completed_at.not.is.null,claimed_at.is.null)`),
      service.from("quests").select("*"),
    ]);
    if (error || questsError) {
      console.error("[fetchQuestBoard] Lecture impossible :", error?.message ?? questsError?.message);
      return { ...empty, isSignedIn: true };
    }

    const questById = new Map((quests ?? []).map((q) => [q.id, q]));
    const entries: QuestEntry[] = [];
    for (const row of rows ?? []) {
      const quest = questById.get(row.quest_id);
      if (!quest || !isObjectiveKey(quest.objective_key)) continue;
      entries.push({
        questId: row.quest_id,
        periodKey: row.period_key,
        questType: quest.quest_type,
        label: questLabel({ objectiveKey: quest.objective_key, targetValue: quest.target_value }),
        progress: row.progress_value,
        target: quest.target_value,
        rewardTides: quest.reward_currency,
        rewardBoosterId: quest.reward_booster_definition_id,
        botProgressAllowed: quest.bot_progress_allowed,
        completed: row.completed_at !== null,
        claimed: row.claimed_at !== null,
        fromPreviousPeriod: !currentKeys.includes(row.period_key),
      });
    }

    // Réclamables d'abord, puis en cours, puis déjà réclamées.
    const rank = (entry: QuestEntry) => (entry.completed && !entry.claimed ? 0 : entry.claimed ? 2 : 1);
    entries.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));

    return {
      ...empty,
      isSignedIn: true,
      daily: entries.filter((e) => e.questType === "daily"),
      weekly: entries.filter((e) => e.questType === "weekly"),
    };
  } catch (error) {
    console.error("[fetchQuestBoard] Échec :", error);
    return empty;
  }
}

export interface ClaimQuestResult {
  ok: boolean;
  error?: string;
  tidesGained?: number;
  boosterId?: string | null;
  balance?: number;
}

export async function claimQuestReward(questId: string, periodKey: string): Promise<ClaimQuestResult> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Connecte-toi pour réclamer une récompense." };

  const service = createSupabaseServiceRoleClient();
  const { data, error } = await service.rpc("claim_quest_reward", {
    p_user_id: user.id,
    p_quest_id: questId,
    p_period_key: periodKey,
  });
  if (error) {
    console.error("[claimQuestReward] Réclamation refusée :", error.message);
    return { ok: false, error: "Réclamation impossible pour le moment." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Réclamation impossible." };

  return { ok: true, tidesGained: data.tides_gained, boosterId: data.booster_id ?? null, balance: data.balance };
}
