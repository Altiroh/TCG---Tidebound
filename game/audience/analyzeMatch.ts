import type { BotDifficulty } from "@/game/bot/types";
import type { GameState, PlayerId } from "@/game/state/types";
import { ANALYZERS } from "@/game/audience/analyzers";
import { readMatchFacts } from "@/game/audience/facts";
import type { AudienceTraits, MatchAnalysis, MatchFacts } from "@/game/audience/types";

/** Spectacle de départ d'une partie : le public vient, il attend de voir. */
export const BASELINE_SPECTACLE = 25;

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function traitsOf(facts: MatchFacts, spectacle: number): AudienceTraits {
  const closeCall = facts.lowestAnchor <= Math.ceil(facts.startingAnchor / 3);
  return {
    // Une victoire, et d'autant plus de panache qu'elle a plu et qu'elle s'est gagnée de face.
    panache: facts.won ? clamp(30 + spectacle / 2 + Math.min(20, facts.directAttacks * 2)) : 0,
    // Une partie DISPUTÉE, pas seulement longue : la durée seule plafonne à 60.
    endurance: clamp(Math.min(60, facts.tableTurns * 5) + facts.leadChanges * 12 + (closeCall ? 15 : 0)),
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

/**
 * L'audience SUIT les parties du joueur, en douceur. Chaque partie la
 * rapproche de ce que son spectacle mérite (`AUDIENCE_PER_SPECTACLE` × S),
 * d'une part seulement de l'écart (`AUDIENCE_RATE`) :
 *
 *   écart   = S × 25 − audience
 *   delta   = écart × 0,15 × poids de l'adversaire
 *   plancher: une partie ne retire jamais plus de 6 % de l'audience
 *   victoire: une partie GAGNÉE ne fait jamais baisser l'audience — elle
 *             rapporte au moins 1 % de l'audience × poids (08/10/2026)
 *
 * Tenir un spectacle S amène l'audience vers 25 S. Une belle partie la fait
 * monter, une partie terne la fait baisser — mais une seule partie ratée ne
 * défait pas des semaines de jeu, et une partie contre un bot pèse d'autant
 * moins que le bot est facile à battre (`AUDIENCE_OPPONENT_WEIGHT`). La
 * fonction Postgres `record_match_audience` porte EXACTEMENT les mêmes
 * constantes, le poids lui étant transmis (migration 20261015120000).
 */
export const AUDIENCE_PER_SPECTACLE = 25;
export const AUDIENCE_RATE = 0.15;
/** Part maximale de l'audience qu'une seule partie peut retirer. */
export const AUDIENCE_MAX_LOSS_SHARE = 0.06;
/**
 * Ce qu'une VICTOIRE rapporte au minimum, en part de l'audience (× poids de
 * l'adversaire) : gagner ne coûte jamais de public. Sans ce plancher, une
 * audience au-dessus de 25 × S baissait même sur une victoire (retour du
 * 08/10/2026 : trois victoires, 1100 → 980).
 */
export const AUDIENCE_MIN_WIN_SHARE = 0.01;

/** Contre qui la partie s'est jouée : un joueur, ou un bot de tel niveau. */
export type AudienceOpponent = "joueur" | BotDifficulty;

/**
 * Ce que pèse une partie aux yeux du public, selon l'adversaire (PROVISOIRE).
 * Un duel entre joueurs compte plein ; contre un bot, d'autant moins qu'il
 * est facile à battre — sinon enchaîner des bots faciles serait la voie la
 * plus rapide vers une grande audience. Sert aussi à la prime du public
 * (`prize.ts`).
 */
export const AUDIENCE_OPPONENT_WEIGHT: Readonly<Record<AudienceOpponent, number>> = {
  joueur: 1,
  difficile: 0.7,
  moyen: 0.5,
  facile: 0.25,
};

/** Audience vers laquelle un spectacle tenu attire le joueur. */
export function audienceTarget(spectacle: number): number {
  return Math.round(spectacle) * AUDIENCE_PER_SPECTACLE;
}

/** Audience après une partie. Elle monte ET descend, en douceur. */
export function nextAudience(audience: number, spectacle: number, options: { opponent?: AudienceOpponent; won?: boolean } = {}): number {
  return nextAudienceWeighted(audience, spectacle, AUDIENCE_OPPONENT_WEIGHT[options.opponent ?? "joueur"], options.won ?? false);
}

/**
 * La même formule, le POIDS de la partie donné tel quel (0 à 1) — c'est ce
 * que reçoit la fonction Postgres `record_match_audience` (`p_weight`). Un
 * poids nul (partie locale, jamais jugée) laisse l'audience où elle est.
 */
export function nextAudienceWeighted(audience: number, spectacle: number, weight: number, won = false): number {
  const current = Math.max(0, audience);
  const w = Math.max(0, Math.min(1, weight));
  const rate = AUDIENCE_RATE * w;
  let delta = Math.max((audienceTarget(spectacle) - current) * rate, -current * AUDIENCE_MAX_LOSS_SHARE);
  // Une victoire jugée (poids > 0) rapporte toujours un peu, jamais moins que 1 spectateur.
  if (won && w > 0) delta = Math.max(delta, current * AUDIENCE_MIN_WIN_SHARE * w, 1);
  return Math.max(0, Math.round(current + delta));
}

/**
 * Le poids qu'une partie a sur l'audience du joueur jugé. Une partie qu'il
 * n'a pas VRAIMENT jouée (`isMeaningfulMatch` : ni 2 cartes, ni une
 * attaque, ni le 2ᵉ tour de table) ne pèse RIEN — relancer une main de
 * départ ratée, ou voir l'adversaire partir au premier tour, ne coûte plus
 * 6 % du public (audit du 27/09/2026). Un abandon après avoir joué reste
 * jugé, et puni (`erreur.concede`).
 */
export function matchAudienceWeight(opponent: AudienceOpponent, played: boolean): number {
  return played ? AUDIENCE_OPPONENT_WEIGHT[opponent] : 0;
}

/** Humeur du public, en une phrase, pour un spectacle donné. */
export function audienceMood(spectacle: number): string {
  if (spectacle >= 80) return "Le public est debout";
  if (spectacle >= 60) return "Le public est captivé";
  if (spectacle >= 40) return "Le public suit la partie";
  if (spectacle >= 20) return "Le public s'impatiente";
  return "Le public s'ennuie";
}
