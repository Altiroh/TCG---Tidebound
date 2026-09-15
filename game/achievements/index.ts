/**
 * Exploits (méta-jeu) — jalons permanents, non renouvelables.
 *
 * Logique PURE : un exploit est une FONCTION des compteurs persistés du
 * joueur, jamais un effet de bord d'événement. L'octroi idempotent vit dans
 * `features/achievements/`.
 */
export {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_COLLECTION_MILESTONES,
  ACHIEVEMENT_LEVEL_MILESTONES,
  achievementByCode,
  unlockedAchievements,
} from "@/game/achievements/catalog";
export type { AchievementDefinition, AchievementStats } from "@/game/achievements/catalog";
