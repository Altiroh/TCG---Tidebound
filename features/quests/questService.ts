import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { GameState, PlayerId } from "@/game";
import { computeMatchQuestProgress, questPeriodKey, selectQuestsForPeriod, type QuestType } from "@/game/quests";

/**
 * Quêtes — opérations SERVEUR (attribution, progression). Pas de directive
 * `"use server"` : ces fonctions prennent un identifiant de joueur en
 * paramètre et ne doivent jamais devenir des Server Actions joignables
 * depuis le navigateur. Les actions exposées vivent dans
 * `features/quests/actions.ts` et déduisent toujours le joueur de sa session.
 */

const QUEST_TYPES: readonly QuestType[] = ["daily", "weekly"];

/**
 * Garantit que le joueur a ses quêtes de la période courante (quotidienne et
 * hebdomadaire). Sans effet si elles sont déjà attribuées — appelé à chaque
 * ouverture de l'écran et avant chaque enregistrement de progression, pour
 * qu'une partie jouée avant d'avoir ouvert l'écran compte quand même.
 */
export async function ensureCurrentQuests(userId: string, now: Date = new Date()): Promise<void> {
  const service = createSupabaseServiceRoleClient();
  await Promise.all(
    QUEST_TYPES.map(async (questType) => {
      const periodKey = questPeriodKey(questType, now);
      const codes = selectQuestsForPeriod(userId, questType, periodKey).map((q) => q.code);
      const { error } = await service.rpc("assign_player_quests", {
        p_user_id: userId,
        p_quest_type: questType,
        p_period_key: periodKey,
        p_quest_codes: codes,
      });
      if (error) console.error(`[ensureCurrentQuests] Attribution ${questType} refusée :`, error.message);
    })
  );
}

export interface RecordMatchQuestProgressInput {
  matchId: string;
  userId: string;
  /** Identifiant du joueur DANS le moteur (`PlayerState.id`) — l'uuid de profil pour une partie serveur. */
  playerId: PlayerId;
  finalState: GameState;
  vsBot: boolean;
  won: boolean;
}

/**
 * Fait progresser les quêtes d'un joueur à partir d'une partie terminée.
 * Idempotent par partie (`match_quest_progress`). Ne lève jamais : une
 * progression manquée ne doit pas faire échouer le coup qui a fini la partie.
 */
export async function recordMatchQuestProgress(input: RecordMatchQuestProgressInput): Promise<void> {
  try {
    const now = new Date();
    await ensureCurrentQuests(input.userId, now);

    const progress = computeMatchQuestProgress({
      state: input.finalState,
      playerId: input.playerId,
      vsBot: input.vsBot,
      won: input.won,
    });

    const service = createSupabaseServiceRoleClient();
    const { error } = await service.rpc("record_match_quest_progress", {
      p_match_id: input.matchId,
      p_user_id: input.userId,
      p_vs_bot: input.vsBot,
      p_period_keys: QUEST_TYPES.map((questType) => questPeriodKey(questType, now)),
      p_progress: progress as Record<string, number>,
    });
    if (error) console.error("[recordMatchQuestProgress] Progression refusée :", error.message);
  } catch (error) {
    console.error("[recordMatchQuestProgress] Échec :", error);
  }
}
