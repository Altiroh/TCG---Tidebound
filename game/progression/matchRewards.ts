import type { GameState, PlayerId } from "@/game/state/types";
import {
  ABANDONED_MATCH_XP,
  DAILY_MATCHES_BONUS,
  DEV_BOT_MATCH_TIDES,
  FIRST_WIN_OF_DAY_BONUS,
  MATCH_TIDES,
  MATCH_XP,
  MEANINGFUL_ACTIVITY,
} from "@/game/progression/constants";
import { levelForTotalXp, rewardsForLevelsGained } from "@/game/progression/levels";
import type {
  MatchActivity,
  MatchMode,
  MatchOutcome,
  MatchReward,
  ProgressionState,
} from "@/game/progression/types";

export interface MatchRewardInput {
  mode: MatchMode;
  outcome: MatchOutcome;
  /** Progression AVANT la partie, telle que lue en base. */
  progression: ProgressionState;
  /**
   * `true` si c'est la première victoire du joueur aujourd'hui (UTC).
   * Calculé par l'appelant à partir de `player_progression.last_win_day`,
   * jamais deviné ici : ce module reste pur.
   */
  isFirstWinOfDay: boolean;
  /**
   * Parties déjà terminées aujourd'hui par ce joueur, AVANT celle-ci.
   * Sert au bonus « 3 parties dans la journée » (§7) : le bonus tombe
   * exactement quand ce compteur atteint le seuil, donc une seule fois.
   */
  matchesFinishedToday: number;
  /**
   * Activité réelle du joueur dans cette partie (`matchActivity`). Absente
   * = partie considérée comme jouée normalement : les appelants qui n'ont
   * pas l'état final (tests, outillage) ne doivent pas être punis.
   */
  activity?: MatchActivity;
  /**
   * DÉROGATION DE DÉVELOPPEMENT : autorise des Tides sur une partie contre
   * bot (`DEV_BOT_MATCH_TIDES`), que le cadrage fixe normalement à 0.
   */
  allowBotTides?: boolean;
}

/**
 * Activité d'un joueur dans une partie terminée, lue depuis le journal
 * d'événements et l'état final. Base de la protection anti-AFK (§7) : le
 * client n'envoie jamais ces compteurs.
 */
export function matchActivity(state: GameState, playerId: PlayerId): MatchActivity {
  let cardsPlayed = 0;
  let attacks = 0;
  for (const event of state.eventLog) {
    if (event.type === "PLAY_CARD" && event.playerId === playerId) cardsPlayed += 1;
    else if (event.type === "ATTACK" && event.playerId === playerId) attacks += 1;
  }
  return { cardsPlayed, attacks, turns: state.turnNumber };
}

/**
 * La partie a-t-elle vraiment été jouée par ce joueur ? Un seul des
 * critères suffit : l'objectif est d'écarter l'abandon immédiat, pas de
 * punir une partie courte mais disputée.
 */
export function isMeaningfulMatch(activity: MatchActivity | undefined): boolean {
  if (!activity) return true;
  return (
    activity.cardsPlayed >= MEANINGFUL_ACTIVITY.cardsPlayed ||
    activity.attacks >= MEANINGFUL_ACTIVITY.attacks ||
    activity.turns >= MEANINGFUL_ACTIVITY.turns
  );
}

/**
 * Calcule tout ce qu'une partie terminée octroie à UN joueur : XP, Tides,
 * niveaux franchis et contenu des paliers. Fonction pure — l'écriture en
 * base est faite par `features/progression/rewards.ts`, de façon atomique
 * et idempotente.
 *
 * Garde-fous appliqués ICI, pas ailleurs :
 *  - une partie contre bot ne rapporte JAMAIS de Tide direct (cadrage
 *    « Boosters & économie de collection », non revu par la page
 *    Progression) ;
 *  - le bonus de Tides de la première victoire du jour est réservé au PvP,
 *    sinon une victoire quotidienne contre un bot capterait la principale
 *    source de Tides ; son XP, elle, est accordée dans les deux modes ;
 *  - une partie sans activité significative ne donne ni Tides, ni bonus.
 */
export function computeMatchReward({
  mode,
  outcome,
  progression,
  isFirstWinOfDay,
  matchesFinishedToday,
  activity,
  allowBotTides = false,
}: MatchRewardInput): MatchReward {
  const isBot = mode === "bot";
  const won = outcome === "win";
  const meaningful = isMeaningfulMatch(activity);

  // --- XP et Tides de la partie ------------------------------------------
  let xp = meaningful ? MATCH_XP.completed + (won ? MATCH_XP.win : 0) : ABANDONED_MATCH_XP;
  let tides = 0;
  if (meaningful) {
    const botTides = allowBotTides ? (won ? DEV_BOT_MATCH_TIDES.win : DEV_BOT_MATCH_TIDES.loss) : won ? MATCH_TIDES.botWin : MATCH_TIDES.botLoss;
    tides = isBot ? botTides : won ? MATCH_TIDES.pvpWin : MATCH_TIDES.pvpLoss;
  }

  const firstWinOfDay = meaningful && won && isFirstWinOfDay;
  if (firstWinOfDay) {
    xp += FIRST_WIN_OF_DAY_BONUS.xp;
    if (!isBot) tides += FIRST_WIN_OF_DAY_BONUS.tides;
  }

  // Exactement à la Nᵉ partie du jour : `matchesFinishedToday` compte celles
  // d'AVANT, donc le bonus ne peut tomber qu'une fois par journée UTC.
  const dailyMatchesBonus = meaningful && matchesFinishedToday + 1 === DAILY_MATCHES_BONUS.matches;
  if (dailyMatchesBonus) xp += DAILY_MATCHES_BONUS.xp;

  // --- Paliers franchis ---------------------------------------------------
  // `levelBefore` est recalculé depuis l'XP cumulée plutôt que lu tel quel :
  // si `player_progression.level` avait dérivé (calibrage modifié, octroi
  // manqué), la courbe reste la seule autorité et les paliers en retard
  // sont rattrapés à la partie suivante.
  const levelBefore = Math.max(progression.level, levelForTotalXp(progression.xpTotal));
  const levelAfter = levelForTotalXp(progression.xpTotal + xp);
  const levelRewards = rewardsForLevelsGained(levelBefore, levelAfter);

  let levelTides = 0;
  let preconTokens = 0;
  const boosterIds: string[] = [];
  const cosmetics: MatchReward["cosmetics"] = [];
  const cardChoices: MatchReward["cardChoices"] = [];

  for (const reward of levelRewards) {
    for (const item of reward.items) {
      switch (item.kind) {
        case "tides":
          levelTides += item.amount;
          break;
        case "booster":
          for (let i = 0; i < item.count; i++) boosterIds.push(item.boosterId);
          break;
        case "preconToken":
          preconTokens += item.count;
          break;
        case "cosmetic":
          cosmetics.push({ cosmetic: item.cosmetic, id: item.id, label: item.label });
          break;
        case "cardChoice":
          cardChoices.push({ level: reward.level, rarity: item.rarity, choices: item.choices });
          break;
      }
    }
  }

  return {
    xp,
    tides,
    firstWinOfDay,
    dailyMatchesBonus,
    abandoned: !meaningful,
    levelBefore,
    levelAfter,
    levelRewards,
    totalTides: tides + levelTides,
    boosterIds,
    preconTokens,
    cosmetics,
    cardChoices,
  };
}

/** Jour UTC au format `YYYY-MM-DD` — clé des bonus quotidiens. */
export function utcDayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
