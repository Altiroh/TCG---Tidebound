/**
 * MOTEUR D'AUDIENCE — point d'entrée. Voir `types.ts` pour le principe.
 */
export { ANALYZERS, MOMENTS_CAP, type Analyzer } from "@/game/audience/analyzers";
export {
  AUDIENCE_MAX_LOSS_SHARE,
  AUDIENCE_OPPONENT_WEIGHT,
  AUDIENCE_PER_SPECTACLE,
  AUDIENCE_RATE,
  BASELINE_SPECTACLE,
  analyzeMatch,
  audienceMood,
  audienceTarget,
  nextAudience,
  type AudienceOpponent,
} from "@/game/audience/analyzeMatch";
export { readMatchFacts } from "@/game/audience/facts";
export type { AudienceSignal, AudienceTraits, MatchAnalysis, MatchFacts, SignalFamily } from "@/game/audience/types";
export {
  HABITUATION,
  LEAD_GAP,
  LIVE_SPECTATORS_PER_POINT,
  liveAudience,
  liveAudienceDelta,
  readMoments,
  readTimeline,
  type AudienceMoment,
  type MatchTimeline,
  type MomentKind,
} from "@/game/audience/moments";
export { AUDIENCE_PRIZE_TIERS, audiencePrize, type AudiencePrize, type AudiencePrizeTier } from "@/game/audience/prize";
export {
  AUDIENCE_MILESTONES,
  audienceMilestonesReached,
  nextAudienceMilestone,
  type AudienceMilestone,
} from "@/game/audience/milestones";
