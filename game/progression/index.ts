/**
 * Progression joueur (méta-jeu) — XP, niveaux, paliers 1-50, récompenses de
 * partie et de connexion.
 *
 * Logique PURE et testable : aucun accès base ni réseau. Les écritures
 * (atomiques, idempotentes, autoritaires côté serveur) vivent dans
 * `features/progression/`.
 */
export {
  ABANDONED_MATCH_XP,
  DAILY_MATCHES_BONUS,
  FIRST_WIN_OF_DAY_BONUS,
  MATCH_TIDES,
  MATCH_XP,
  MEANINGFUL_ACTIVITY,
  STARTING_LEVEL,
  XP_FIRST_LEVEL,
  XP_LEVEL_STEP,
  XP_STEP_PLATEAU_LEVEL,
} from "@/game/progression/constants";

export {
  LEVEL_REWARDS,
  MAX_REWARDED_LEVEL,
  isMilestoneLevel,
  levelRewardItems,
  levelRewardLabel,
  levelRewardsBetween,
  levelRewardsLabel,
  nextMilestones,
} from "@/game/progression/levelRewards";
export type { CosmeticKind, LevelRewardItem } from "@/game/progression/levelRewards";

export { levelForTotalXp, progressionView, rewardForLevel, rewardsForLevelsGained, totalXpForLevel, xpForLevel } from "@/game/progression/levels";
export { computeMatchReward, isMeaningfulMatch, matchActivity, utcDayKey } from "@/game/progression/matchRewards";
export type { MatchRewardInput } from "@/game/progression/matchRewards";

export {
  LOGIN_CYCLE_LENGTH,
  LOGIN_REWARD_CYCLE,
  LOGIN_STREAK_MILESTONE,
  LOGIN_WEEKLY_PROGRAMMES,
  advanceLoginStep,
  canClaimLoginReward,
  currentLoginStreak,
  daysUntilStreakBonus,
  loginBoosterName,
  loginCardPool,
  loginRewardForStep,
  loginRewardLabel,
  loginStepLabel,
  loginStreakBonus,
  loginWeekIndex,
  loginWeekProgramme,
  nextLoginStreak,
  normalizeStep,
  shiftDayKey,
} from "@/game/progression/loginRewards";
export type { LoginRewardItem, LoginRewardState, LoginWeekProgramme } from "@/game/progression/loginRewards";

export type {
  LevelReward,
  MatchActivity,
  MatchMode,
  MatchOutcome,
  MatchReward,
  ProgressionState,
  ProgressionView,
} from "@/game/progression/types";

export {
  MASTERY_MAX_LEVEL,
  PATRONAGE_UNLOCK_LEVEL,
  SPONSORS,
  SPONSORS_UNLOCK_LEVEL,
  SPONSOR_MAX_POINTS,
  SPONSOR_STAGES,
  WEEKLY_CHEST_GOAL,
  masteryProgress,
  masteryRewardForLevel,
  masteryXpForLevel,
  sponsorGift,
  sponsorGiftStagesReached,
  sponsorInterestPercent,
  sponsorPointsForMatch,
  sponsorRevealed,
  sponsorStage,
  sponsorStageLabel,
  weeklyChestContents,
} from "@/game/progression/hub";
export type { MasteryProgress, SponsorDefinition, SponsorId, SponsorStage } from "@/game/progression/hub";
