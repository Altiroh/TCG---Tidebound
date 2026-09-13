/**
 * Quêtes (méta-jeu) — catalogue, attribution par période, progression.
 *
 * Logique PURE et testable : aucun accès base ni réseau. Les écritures
 * (attribution, progression idempotente par partie, réclamation) vivent
 * dans `features/quests/`.
 */
export {
  DAILY_QUEST_COUNT,
  MAX_PVP_ONLY_PER_PERIOD,
  QUEST_CATALOG,
  QUEST_OBJECTIVE_LABELS,
  WEEKLY_QUEST_COUNT,
  questLabel,
} from "@/game/quests/catalog";
export { computeMatchQuestProgress, HIGH_ANCHOR_WIN_THRESHOLD } from "@/game/quests/progress";
export type { MatchQuestProgressInput } from "@/game/quests/progress";
export { questPeriodEndsAt, questPeriodKey, selectQuestsForPeriod } from "@/game/quests/rotation";
export type { MatchQuestProgress, QuestDefinition, QuestObjectiveKey, QuestType } from "@/game/quests/types";
