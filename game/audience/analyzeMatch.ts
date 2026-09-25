import type { GameState, PlayerId } from "@/game/state/types";
import { ANALYZERS } from "@/game/audience/analyzers";
import { readMatchFacts } from "@/game/audience/facts";
import type { AudienceTraits, MatchAnalysis, MatchFacts } from "@/game/audience/types";

/** Spectacle de départ d'une partie : le public vient, il attend de voir. */
const BASELINE_SPECTACLE = 30;

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function traitsOf(facts: MatchFacts, spectacle: number): AudienceTraits {
  return {
    panache: facts.won ? clamp(40 + spectacle / 2 + facts.directAttacks * 3) : 0,
    endurance: clamp(facts.tableTurns * 7 + facts.leadChanges * 10),
    ferveur: spectacle,
  };
}

/**
 * Relit la partie pour le joueur `playerId` et rend le verdict du public.
 * Sur l'état FINAL à la fin de la partie (côté serveur, sans que le joueur
 * n'ait rien à faire) ; sur l'état COURANT pour l'humeur en direct.
 */
export function analyzeMatch(state: GameState, playerId: PlayerId): MatchAnalysis {
  const facts = readMatchFacts(state, playerId);
  const signals = ANALYZERS.flatMap((analyzer) => analyzer(facts));
  const spectacle = clamp(BASELINE_SPECTACLE + signals.reduce((sum, signal) => sum + signal.weight, 0));
  const highlights = [...signals]
    .filter((signal) => signal.salience >= 3)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 2)
    .map((signal) => signal.label);
  return { spectacle, signals, highlights, traits: traitsOf(facts, spectacle), facts };
}

/* ── L'audience du joueur ──────────────────────────────────────────── */

/** Part de l'audience conservée d'une partie à l'autre (la fonction Postgres `record_match_audience` porte la même). */
export const AUDIENCE_RETAIN = 0.8;
/** Spectateurs gagnés par point de spectacle. À spectacle constant S, l'audience tend vers 25 S. */
export const AUDIENCE_PER_SPECTACLE = 5;

/**
 * Audience après une partie : elle suit les dernières parties — chacune en
 * retire une part et y ajoute son spectacle. Elle monte ET descend.
 */
export function nextAudience(audience: number, spectacle: number): number {
  return Math.max(0, Math.round(audience * AUDIENCE_RETAIN) + Math.round(spectacle) * AUDIENCE_PER_SPECTACLE);
}

/** Humeur du public, en une phrase, pour un spectacle donné. */
export function audienceMood(spectacle: number): string {
  if (spectacle >= 80) return "Le public est debout";
  if (spectacle >= 60) return "Le public est captivé";
  if (spectacle >= 40) return "Le public suit la partie";
  if (spectacle >= 20) return "Le public s'impatiente";
  return "Le public s'ennuie";
}
