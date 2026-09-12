/**
 * Quêtes (« Contrats ») — types.
 *
 * Une QUÊTE est une entrée du catalogue (`game/quests/catalog.ts`) ; une
 * quête ATTRIBUÉE est cette entrée pour un joueur et une période donnés
 * (`player_quest_progress`, clé `user_id + quest_id + period_key`).
 */

export type QuestType = "daily" | "weekly";

/**
 * Objectifs observables en fin de partie, calculés depuis le journal
 * d'événements par `computeMatchQuestProgress`. Le cadrage demande des
 * « actions de jeu observables » et interdit de viser une carte ou une
 * rareté précise : aucun objectif ne porte sur un `cardId`.
 */
export type QuestObjectiveKey =
  | "play_matches"
  | "play_creatures"
  | "play_marins"
  | "play_structures"
  | "break_objects"
  | "scuttle_structures"
  | "reach_abysses"
  | "win_pvp_matches"
  | "pvp_ship_damage"
  | "pvp_win_high_anchor";

export interface QuestDefinition {
  /** Identifiant stable, clé de synchronisation avec la table `quests` (`quests.code`). */
  code: string;
  questType: QuestType;
  objectiveKey: QuestObjectiveKey;
  targetValue: number;
  rewardTides: number;
  /** Booster offert en plus des Tides — réservé aux récompenses exceptionnelles. */
  rewardBoosterId?: string;
  /**
   * `true` si une partie contre bot peut faire progresser cette quête
   * (cadrage : `bot_progress_allowed`). Les objectifs de victoire ou de
   * performance PvP sont toujours à `false`.
   */
  botProgressAllowed: boolean;
}

export type MatchQuestProgress = Partial<Record<QuestObjectiveKey, number>>;
