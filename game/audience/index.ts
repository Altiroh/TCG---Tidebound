/**
 * MOTEUR D'AUDIENCE — point d'entrée. Voir `types.ts` pour le principe.
 */
export { ANALYZERS, type Analyzer } from "@/game/audience/analyzers";
export { AUDIENCE_PER_SPECTACLE, AUDIENCE_RETAIN, analyzeMatch, audienceMood, nextAudience } from "@/game/audience/analyzeMatch";
export { readMatchFacts } from "@/game/audience/facts";
export type { AudienceSignal, AudienceTraits, MatchAnalysis, MatchFacts, SignalFamily } from "@/game/audience/types";
export { LIVE_SPECTATORS_PER_POINT, liveAudience, readMoments, type AudienceMoment } from "@/game/audience/moments";
