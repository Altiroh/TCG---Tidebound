/**
 * Quêtes (« Contrats ») — types.
 *
 * Une QUÊTE est une entrée du catalogue (`game/quests/catalog.ts`) ; une
 * quête ATTRIBUÉE est cette entrée pour un joueur et une période donnés
 * (`player_quest_progress`, clé `user_id + quest_id + period_key`).
 */

export type QuestType = "daily" | "weekly";

/**
 * Les cinq familles de quêtes (Notion « Catalogue de quêtes — Tidebound ») :
 * elles structurent l'écran Quêtes et ont chacune leur icône
 * (`public/assets/quests/icon-cat-*.webp`).
 *
 * Elles servent aussi au TIRAGE : « une journée idéale propose 3 quêtes de
 * catégories différentes » — la rotation s'appuie dessus pour éviter les
 * journées répétitives.
 */
export type QuestCategory = "cartes" | "parties" | "decks" | "stats" | "maree";

/**
 * Objectifs observables en fin de partie, calculés depuis le journal
 * d'événements par `computeMatchQuestProgress`.
 *
 * Trois contraintes de cadrage tiennent :
 *   - « actions de jeu observables », jamais une carte ni une rareté
 *     précise — aucun objectif ne porte sur un `cardId` ;
 *   - « les objectifs doivent progresser même lors d'une défaite autant que
 *     possible », d'où une majorité d'objectifs d'ACTION plutôt que de
 *     résultat ;
 *   - « éviter de demander trop de victoires consécutives ».
 *
 * Trois FORMES d'objectif coexistent, distinguées par `QuestProgressKind` :
 *   - CUMUL : on additionne d'une partie à l'autre (« Jouer 15 Créatures ») ;
 *   - SEUIL PAR PARTIE : chaque partie qui atteint le seuil compte pour 1
 *     (« Jouer 5 Créatures dans une même partie ») ;
 *   - ENSEMBLE : on compte des valeurs DISTINCTES (« Jouer avec 2 decks
 *     différents »), ce qui demande de mémoriser ce qui a déjà été vu.
 */
export type QuestObjectiveKey =
  // --- Cartes -----------------------------------------------------------
  | "play_cards"
  | "play_creatures"
  | "play_low_cost_creatures"
  | "play_marins"
  | "play_structures"
  | "play_objects"
  | "play_or_break_objects"
  | "break_objects"
  | "draw_extra_cards"
  /** Seuil par partie : au moins N Créatures posées dans une même partie. */
  | "creatures_in_match"
  /** Seuil par partie : au moins N Objets posés dans une même partie. */
  | "objects_in_match"
  /** Seuil par partie : au moins N Objets Brisés dans une même partie. */
  | "broken_objects_in_match"
  // --- Parties ----------------------------------------------------------
  | "play_matches"
  | "win_matches"
  | "win_pvp_matches"
  /** Seuil par partie : la partie a duré au moins N tours. */
  | "long_matches"
  // --- Decks ------------------------------------------------------------
  /** Ensemble : decks DISTINCTS avec lesquels le joueur a joué. */
  | "distinct_decks_played"
  /** Ensemble : decks DISTINCTS avec lesquels le joueur a gagné. */
  | "distinct_decks_won"
  /** Cumul : parties jouées avec un préconstruit en essai (contre le bot). */
  | "precon_trials"
  // --- Stats ------------------------------------------------------------
  | "deal_damage"
  | "take_damage"
  | "pvp_ship_damage"
  | "scuttle_structures"
  /** Seuil par partie : terminer avec au moins N Ancrage. */
  | "finish_high_anchor"
  /** Seuil par partie : terminer avec N Ancrage ou MOINS (et survivre). */
  | "finish_low_anchor"
  /** Seuil par partie : au moins N dégâts infligés en un seul tour. */
  | "damage_in_one_turn"
  /** Seuil par partie : au moins N Créatures distinctes ont infligé des dégâts. */
  | "damaging_creatures_in_match"
  // --- Marée ------------------------------------------------------------
  | "modify_tide"
  | "tide_rise"
  | "tide_fall"
  | "reach_abysses"
  /** Seuil par partie : la Marée a été poussée dans les deux sens. */
  | "tide_both_ways_in_match";

/**
 * Comment la progression d'un objectif s'agrège d'une partie à l'autre.
 * `sum` est le défaut historique ; `set` mémorise les valeurs distinctes
 * déjà vues (`player_quest_progress.progress_meta`).
 */
export type QuestProgressKind = "sum" | "set";

export interface QuestDefinition {
  /** Identifiant stable, clé de synchronisation avec la table `quests` (`quests.code`). */
  code: string;
  /** Nom affiché au joueur (« Prendre le large »). */
  name: string;
  category: QuestCategory;
  questType: QuestType;
  objectiveKey: QuestObjectiveKey;
  targetValue: number;
  /** XP accordée à la réclamation — les quêtes sont une source d'XP autant que de Tides. */
  rewardXp: number;
  rewardTides: number;
  /** Booster offert en plus — réservé au cycle hebdomadaire. */
  rewardBoosterId?: string;
  /**
   * `true` si une partie contre bot peut faire progresser cette quête
   * (cadrage : `bot_progress_allowed`). Les objectifs de performance PvP
   * sont toujours à `false`.
   */
  botProgressAllowed: boolean;
}

/** Contributions cumulables d'une partie (`sum`). */
export type MatchQuestProgress = Partial<Record<QuestObjectiveKey, number>>;

/**
 * Valeurs DISTINCTES apportées par une partie, pour les objectifs `set`
 * (ex: `{ distinct_decks_played: ["le-courlis"] }`). La base les fusionne
 * dans l'ensemble déjà mémorisé et en recompte la taille.
 */
export type MatchQuestSets = Partial<Record<QuestObjectiveKey, string[]>>;
