import { DEV_BOT_MATCH_TIDES, FIRST_PVP_WIN_OF_DAY_BONUS, MATCH_TIDES, MATCH_XP } from "@/game/progression/constants";
import { levelForTotalXp, rewardsForLevelsGained } from "@/game/progression/levels";
import type { MatchMode, MatchOutcome, MatchReward, ProgressionState } from "@/game/progression/types";

export interface MatchRewardInput {
  mode: MatchMode;
  outcome: MatchOutcome;
  /** Progression AVANT la partie, telle que lue en base. */
  progression: ProgressionState;
  /**
   * `true` si c'est la première victoire PvP du joueur aujourd'hui (UTC).
   * Calculé par l'appelant à partir de `player_progression.last_pvp_win_day`,
   * jamais deviné ici : ce module reste pur.
   */
  isFirstPvpWinOfDay: boolean;
  /**
   * DÉROGATION DE DÉVELOPPEMENT : autorise des Tides sur une partie contre
   * bot (`DEV_BOT_MATCH_TIDES`), que le cadrage fixe normalement à 0.
   * Défaut `false` — la règle verrouillée s'applique sauf demande explicite,
   * et c'est `features/progression/botRewardPolicy.ts` qui décide.
   */
  allowBotTides?: boolean;
}

/**
 * Calcule tout ce qu'une partie terminée octroie à UN joueur : XP, Tides,
 * niveaux franchis et boosters de palier. Fonction pure — l'écriture en
 * base est faite par `features/progression/actions.ts`, de façon atomique
 * et idempotente.
 *
 * Deux garde-fous du cadrage sont appliqués ici, pas ailleurs :
 *  - une partie contre bot ne rapporte JAMAIS de Tide direct
 *    (`MATCH_TIDES.bot*` à 0) ;
 *  - le bonus de première victoire du jour est réservé au PvP, sinon il
 *    suffirait d'une victoire quotidienne contre un bot pour capter la
 *    principale source de Tides.
 */
export function computeMatchReward({
  mode,
  outcome,
  progression,
  isFirstPvpWinOfDay,
  allowBotTides = false,
}: MatchRewardInput): MatchReward {
  const isBot = mode === "bot";
  const won = outcome === "win";

  const baseXp = isBot ? (won ? MATCH_XP.botWin : MATCH_XP.botLoss) : won ? MATCH_XP.pvpWin : MATCH_XP.pvpLoss;
  const botTides = allowBotTides
    ? won
      ? DEV_BOT_MATCH_TIDES.win
      : DEV_BOT_MATCH_TIDES.loss
    : won
      ? MATCH_TIDES.botWin
      : MATCH_TIDES.botLoss;
  const baseTides = isBot ? botTides : won ? MATCH_TIDES.pvpWin : MATCH_TIDES.pvpLoss;

  const firstWinOfDay = !isBot && won && isFirstPvpWinOfDay;
  const xp = baseXp + (firstWinOfDay ? FIRST_PVP_WIN_OF_DAY_BONUS.xp : 0);
  const tides = baseTides + (firstWinOfDay ? FIRST_PVP_WIN_OF_DAY_BONUS.tides : 0);

  // `levelBefore` est recalculé depuis l'XP cumulée plutôt que lu tel quel :
  // si `player_progression.level` avait dérivé (calibrage modifié, octroi
  // manqué), la courbe reste la seule autorité et les paliers en retard
  // sont rattrapés à la partie suivante.
  const levelBefore = Math.max(progression.level, levelForTotalXp(progression.xpTotal));
  const levelAfter = levelForTotalXp(progression.xpTotal + xp);
  const levelRewards = rewardsForLevelsGained(levelBefore, levelAfter);

  const levelTides = levelRewards.reduce((sum, reward) => sum + reward.tides, 0);
  const boosterIds = levelRewards.flatMap((reward) => reward.boosterIds);

  return {
    xp,
    tides,
    firstWinOfDay,
    levelBefore,
    levelAfter,
    levelRewards,
    totalTides: tides + levelTides,
    boosterIds,
  };
}

/** Jour UTC au format `YYYY-MM-DD` — clé du bonus de première victoire quotidienne. */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
