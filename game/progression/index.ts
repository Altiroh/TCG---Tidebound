/**
 * Progression joueur (méta-jeu) — XP, niveaux, récompenses de partie.
 *
 * Logique PURE et testable : aucun accès base ni réseau. Les écritures
 * (atomiques, idempotentes, autoritaires côté serveur) vivent dans
 * `features/progression/actions.ts`.
 */
export {
  BOOSTER_EVERY_N_LEVELS,
  DEV_BOT_MATCH_TIDES,
  FIRST_PVP_WIN_OF_DAY_BONUS,
  LEVEL_REWARD_BOOSTER_ID,
  MATCH_TIDES,
  MATCH_XP,
  STARTING_LEVEL,
  TIDES_PER_LEVEL,
  XP_FIRST_LEVEL,
  XP_LEVEL_STEP,
  XP_STEP_PLATEAU_LEVEL,
} from "@/game/progression/constants";

export { levelForTotalXp, progressionView, rewardForLevel, rewardsForLevelsGained, totalXpForLevel, xpForLevel } from "@/game/progression/levels";
export { computeMatchReward, utcDayKey } from "@/game/progression/matchRewards";
export type { MatchRewardInput } from "@/game/progression/matchRewards";
export type { LevelReward, MatchMode, MatchOutcome, MatchReward, ProgressionState, ProgressionView } from "@/game/progression/types";
