import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { GameState, PlayerId } from "@/game";
import { computeMatchQuestContribution, questPeriodKey, selectQuestsForPeriod, type QuestType } from "@/game/quests";
import { utcDayKey } from "@/game/progression";
import { recordMatchVoyageProgress } from "@/features/quests/voyageService";

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
  // Ne lève JAMAIS, même si la clé de service manque — auquel cas la
  // création du client échoue avant le premier appel. Cette fonction est
  // appelée à l'ouverture de l'écran des quêtes et à chaque fin de partie :
  // une exception y viderait l'écran, ou ferait échouer le coup qui vient
  // de terminer la partie. Ne pas avoir ses quêtes du jour est ennuyeux ;
  // perdre la partie qu'on vient de gagner ne l'est pas du tout.
  try {
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
  } catch (error) {
    console.error("[ensureCurrentQuests] Échec :", error);
  }
}

export interface RecordMatchQuestProgressInput {
  matchId: string;
  userId: string;
  /** Identifiant du joueur DANS le moteur (`PlayerState.id`) — l'uuid de profil pour une partie serveur. */
  playerId: PlayerId;
  finalState: GameState;
  vsBot: boolean;
  won: boolean;
  /**
   * Deck joué par ce joueur — alimente la catégorie DECKS (« jouer avec 2
   * decks différents »). Absent, ces objectifs n'avancent pas plutôt que
   * d'être crédités sur un deck inconnu.
   */
  deckId?: string;
  /**
   * Série de jours consécutifs après cette partie, remontée par l'octroi
   * (`awardMatchReward`). Absente : les objectifs de série n'avancent pas.
   */
  playStreak?: number;
  /** `true` si le deck joué vient d'être créé ou obtenu (`isRecentDeck`). */
  deckIsNew?: boolean;
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

    const { progress, sets } = computeMatchQuestContribution({
      state: input.finalState,
      playerId: input.playerId,
      vsBot: input.vsBot,
      won: input.won,
      deckId: input.deckId,
      playStreak: input.playStreak,
      deckIsNew: input.deckIsNew,
      // Jour UTC de la FIN de partie : c'est lui qui alimente « jouer N
      // jours différents », et il doit coller à la journée des autres
      // bonus quotidiens (`utcDayKey`).
      dayKey: utcDayKey(now),
    });

    const service = createSupabaseServiceRoleClient();
    const { error } = await service.rpc("record_match_quest_progress", {
      p_match_id: input.matchId,
      p_user_id: input.userId,
      p_vs_bot: input.vsBot,
      p_period_keys: QUEST_TYPES.map((questType) => questPeriodKey(questType, now)),
      p_progress: progress as Record<string, number>,
      p_sets: sets as Record<string, string[]>,
    });
    if (error) console.error("[recordMatchQuestProgress] Progression refusée :", error.message);

    // L'escale de la Traversée en cours avance sur la MÊME contribution :
    // une partie, un seul calcul, et aucune chance que les deux divergent.
    await recordMatchVoyageProgress({ matchId: input.matchId, userId: input.userId, contribution: { progress, sets } });
  } catch (error) {
    console.error("[recordMatchQuestProgress] Échec :", error);
  }
}
