/**
 * Quêtes (méta-jeu) — catalogue, attribution par période, progression.
 *
 * Logique PURE et testable : aucun accès base ni réseau. Les écritures
 * (attribution, progression idempotente par partie, réclamation,
 * remplacement) vivent dans `features/quests/`.
 */
export {
  BIG_TURN_DAMAGE,
  DAILY_QUEST_COUNT,
  DAILY_REROLLS_PER_PERIOD,
  HIGH_ANCHOR_THRESHOLD,
  LONG_MATCH_TURNS,
  NEW_DECK_WINDOW_HOURS,
  LOW_ANCHOR_THRESHOLD,
  LOW_COST_CREATURE_MAX,
  MAX_PVP_ONLY_PER_PERIOD,
  QUEST_CATALOG,
  QUEST_CATEGORIES,
  QUEST_CATEGORY_META,
  QUEST_OBJECTIVE_LABELS,
  QUEST_PROGRESS_KIND,
  REROLLS_PER_PERIOD,
  WEEKLY_QUEST_COUNT,
  questByCode,
  questLabel,
  questProgressKind,
} from "@/game/quests/catalog";
export { computeMatchQuestContribution, computeMatchQuestProgress } from "@/game/quests/progress";
export type { MatchQuestContribution, MatchQuestProgressInput } from "@/game/quests/progress";
export { pickReplacementQuest, questPeriodEndsAt, questPeriodKey, selectQuestsForPeriod } from "@/game/quests/rotation";
export type {
  MatchQuestProgress,
  MatchQuestSets,
  QuestCategory,
  QuestDefinition,
  QuestObjectiveKey,
  QuestProgressKind,
  QuestType,
} from "@/game/quests/types";
export {
  VOYAGE_CATALOG,
  VOYAGE_STEP_COUNT,
  advanceVoyage,
  currentVoyage,
  freshVoyageProgress,
  isVoyageComplete,
  nextClaimableTier,
  voyageById,
  voyageStepLabel,
} from "@/game/quests/voyages";
export type { VoyageAdvance, VoyageDefinition, VoyageProgress, VoyageReward, VoyageStep } from "@/game/quests/voyages";
