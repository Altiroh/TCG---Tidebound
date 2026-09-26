import { analyzeMatch, type AudienceSignal } from "@/game/audience";
import type { GameState, PlayerId } from "@/game";

/** Le jugement du public sur une partie terminée, tel que l'écran de fin le montre. */
export interface MatchAudienceVerdict {
  spectacle: number;
  /** Deux temps forts au plus, dans l'ordre d'importance. */
  highlights: string[];
  /** Ce qui a pesé, en plus comme en moins. */
  signals: AudienceSignal[];
}

/** Verdict du public pour `playerId`, sur l'état final — même moteur que le serveur. */
export function matchAudienceVerdict(state: GameState, playerId: PlayerId): MatchAudienceVerdict {
  const { spectacle, highlights, signals } = analyzeMatch(state, playerId);
  return { spectacle, highlights, signals };
}

/** Les signaux qui ont compté, du plus lourd au plus léger (poids nuls écartés). */
export function weightiestSignals(signals: readonly AudienceSignal[], count = 4): AudienceSignal[] {
  return signals
    .filter((signal) => signal.weight !== 0)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, count);
}
