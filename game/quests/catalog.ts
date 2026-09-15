import { STANDARD_BOOSTER_ID } from "@/game/economy/constants";
import type { QuestCategory, QuestDefinition, QuestObjectiveKey, QuestProgressKind, QuestType } from "@/game/quests/types";

/**
 * Catalogue des quêtes et calibrage.
 *
 * SOURCE DE VÉRITÉ : Notion « Catalogue de quêtes — Tidebound »
 * (2026-09-15), complété par « Progression joueur » §9-10. Y sont
 * verrouillés :
 *   - **5 catégories** — Cartes, Parties, Decks, Stats, Marée ;
 *   - 3 quêtes quotidiennes actives, tirées dans **au moins 3 catégories
 *     distinctes** (« pour éviter les journées répétitives ») ;
 *   - journalières atteignables « en environ 3 à 6 parties » ;
 *   - hebdomadaires plus engageantes, pouvant « approcher ou dépasser la
 *     valeur d'un booster » ;
 *   - « éviter de demander une carte précise » et « trop de victoires
 *     consécutives » ;
 *   - ~30 à 50 Tides par quotidienne, soit 90 à 150 Tides pour les 3 du
 *     jour — l'équivalent d'un booster (150 Tides) ;
 *   - 1 remplacement gratuit par jour.
 *
 * Les quêtes reprises ci-dessous sont celles de la page dont l'objectif est
 * OBSERVABLE avec les événements actuels du moteur. Celles qui demandent un
 * suivi encore absent (rétention inter-journées, « X quêtes complétées »,
 * « deck récemment créé », « exactement les dégâts nécessaires ») ne sont
 * pas inventées à moitié : elles attendent leur mécanique plutôt que
 * d'exister en approximation.
 *
 * Ce fichier est la SOURCE DE VÉRITÉ : la table `quests` n'en est qu'un
 * miroir, synchronisé par `npm run seed:cards` (comme `cards`).
 */

export const DAILY_QUEST_COUNT = 3;
export const WEEKLY_QUEST_COUNT = 3;

/** Remplacements gratuits d'une quête quotidienne, par journée. */
export const DAILY_REROLLS_PER_PERIOD = 1;

/** Aucun remplacement sur les hebdomadaires : elles n'ont qu'un cycle par semaine. */
export const REROLLS_PER_PERIOD: Record<QuestType, number> = {
  daily: DAILY_REROLLS_PER_PERIOD,
  weekly: 0,
};

/**
 * Nombre maximum de quêtes PvP-only dans une même période. Sans ce plafond,
 * un joueur qui ne joue que contre le bot pourrait tirer trois quêtes
 * qu'il ne peut physiquement pas faire avancer.
 */
export const MAX_PVP_ONLY_PER_PERIOD: Record<QuestType, number> = {
  daily: 1,
  weekly: 1,
};

/** Coût maximum d'une Créature comptée comme « de faible coût ». */
export const LOW_COST_CREATURE_MAX = 2;

/** Les cinq catégories, dans l'ordre d'affichage de l'écran Quêtes. */
export const QUEST_CATEGORIES: readonly QuestCategory[] = ["parties", "cartes", "stats", "maree", "decks"];

/** Libellés et icônes de catégorie (assets fournis, `public/assets/quests/`). */
export const QUEST_CATEGORY_META: Record<QuestCategory, { label: string; icon: string; description: string }> = {
  cartes: {
    label: "Cartes",
    icon: "/assets/quests/icon-cat-card.webp",
    description: "Jouer, Briser, piocher — tout ce qui passe par ta main.",
  },
  parties: {
    label: "Parties",
    icon: "/assets/quests/icon-cat-partie.webp",
    description: "Jouer, terminer et remporter des parties.",
  },
  decks: {
    label: "Decks",
    icon: "/assets/quests/icon-cat-deck.webp",
    description: "Varier les équipages et explorer les préconstruits.",
  },
  stats: {
    label: "Stats",
    icon: "/assets/quests/icon-cat-stat.webp",
    description: "Dégâts, Ancrage, survie — ce que les chiffres racontent.",
  },
  maree: {
    label: "Marée",
    icon: "/assets/quests/icon-cat-maree.webp",
    description: "Faire bouger la Marée, la catégorie identitaire du jeu.",
  },
};

/**
 * Forme d'agrégation de chaque objectif.
 *
 * `sum` (défaut) additionne d'une partie à l'autre ; `set` compte des
 * valeurs DISTINCTES. Un objectif « seuil par partie » reste un `sum` : la
 * partie rapporte 1 quand le seuil est atteint, 0 sinon — c'est
 * `computeMatchQuestProgress` qui évalue le seuil, pas la base.
 */
export const QUEST_PROGRESS_KIND: Partial<Record<QuestObjectiveKey, QuestProgressKind>> = {
  distinct_decks_played: "set",
  distinct_decks_won: "set",
};

export function questProgressKind(objectiveKey: QuestObjectiveKey): QuestProgressKind {
  return QUEST_PROGRESS_KIND[objectiveKey] ?? "sum";
}

/** Ancrage restant minimal pour « terminer en tenant le pont ». */
export const HIGH_ANCHOR_THRESHOLD = 10;

/** Ancrage restant maximal pour « À un fil ». */
export const LOW_ANCHOR_THRESHOLD = 5;

/** Tours minimum pour qu'une partie compte comme « longue traversée ». */
export const LONG_MATCH_TURNS = 8;

/** Dégâts en un seul tour pour « Gros calibre ». */
export const BIG_TURN_DAMAGE = 10;

/** Libellés joueur de chaque objectif, en fonction de la cible. */
export const QUEST_OBJECTIVE_LABELS: Record<QuestObjectiveKey, (target: number) => string> = {
  // Cartes
  play_cards: (n) => `Jouer ${n} cartes`,
  play_creatures: (n) => `Jouer ${n} Créature${n > 1 ? "s" : ""}`,
  play_low_cost_creatures: (n) => `Jouer ${n} Créature${n > 1 ? "s" : ""} à ${LOW_COST_CREATURE_MAX} Raison ou moins`,
  play_marins: (n) => `Jouer ${n} Marin${n > 1 ? "s" : ""}`,
  play_structures: (n) => `Poser ${n} Structure${n > 1 ? "s" : ""}`,
  play_objects: (n) => `Jouer ${n} Objet${n > 1 ? "s" : ""}`,
  play_or_break_objects: (n) => `Jouer ou Briser ${n} Objet${n > 1 ? "s" : ""}`,
  break_objects: (n) => `Briser ${n} Objet${n > 1 ? "s" : ""}`,
  draw_extra_cards: (n) => `Piocher ${n} cartes supplémentaires`,
  creatures_in_match: (n) => (n > 1 ? `Jouer 5 Créatures dans une même partie, ${n} fois` : "Jouer 5 Créatures dans une même partie"),
  objects_in_match: (n) => (n > 1 ? `Jouer 5 Objets dans une même partie, ${n} fois` : "Jouer 5 Objets dans une même partie"),
  broken_objects_in_match: (n) => (n > 1 ? `Briser 2 Objets dans une même partie, ${n} fois` : "Briser 2 Objets dans une même partie"),
  // Parties
  play_matches: (n) => `Jouer ${n} partie${n > 1 ? "s" : ""}`,
  win_matches: (n) => `Gagner ${n} partie${n > 1 ? "s" : ""}`,
  win_pvp_matches: (n) => `Gagner ${n} partie${n > 1 ? "s" : ""} en PvP`,
  long_matches: (n) => `Atteindre le tour ${LONG_MATCH_TURNS} dans ${n} partie${n > 1 ? "s" : ""}`,
  // Decks
  distinct_decks_played: (n) => `Jouer avec ${n} decks différents`,
  distinct_decks_won: (n) => `Gagner avec ${n} decks différents`,
  precon_trials: (n) => (n > 1 ? `Essayer ${n} préconstruits contre le bot` : "Essayer un préconstruit contre le bot"),
  // Stats
  deal_damage: (n) => `Infliger ${n} dégâts au total`,
  take_damage: (n) => `Subir ${n} dégâts au total`,
  pvp_ship_damage: (n) => `Infliger ${n} dégâts directs aux Navires adverses en PvP`,
  scuttle_structures: (n) => `Saborder ${n} Structure${n > 1 ? "s" : ""}`,
  finish_high_anchor: (n) =>
    n > 1 ? `Terminer ${n} parties avec au moins ${HIGH_ANCHOR_THRESHOLD} Ancrage` : `Terminer une partie avec au moins ${HIGH_ANCHOR_THRESHOLD} Ancrage`,
  finish_low_anchor: (n) =>
    n > 1 ? `Terminer ${n} parties avec ${LOW_ANCHOR_THRESHOLD} Ancrage ou moins` : `Terminer une partie avec ${LOW_ANCHOR_THRESHOLD} Ancrage ou moins`,
  damage_in_one_turn: (n) =>
    n > 1 ? `Infliger ${BIG_TURN_DAMAGE} dégâts en un seul tour, ${n} fois` : `Infliger ${BIG_TURN_DAMAGE} dégâts en un seul tour`,
  damaging_creatures_in_match: (n) =>
    n > 1 ? `Infliger des dégâts avec 5 Créatures différentes, ${n} fois` : "Infliger des dégâts avec 5 Créatures différentes dans une partie",
  // Marée
  modify_tide: (n) => `Modifier la Marée ${n} fois`,
  tide_rise: (n) => `Faire monter la Marée ${n} fois`,
  tide_fall: (n) => `Faire descendre la Marée ${n} fois`,
  reach_abysses: (n) => `Atteindre les Abysses ${n} fois`,
  tide_both_ways_in_match: (n) =>
    n > 1 ? `Faire évoluer la Marée dans les deux sens, dans ${n} parties` : "Faire évoluer la Marée dans les deux sens dans une même partie",
};

/** Barème des quotidiennes (« environ 30 à 50 Tides + XP »). */
const DAILY = {
  light: { rewardXp: 150, rewardTides: 30 },
  standard: { rewardXp: 150, rewardTides: 35 },
  heavy: { rewardXp: 175, rewardTides: 40 },
  long: { rewardXp: 250, rewardTides: 50 },
} as const;

/** Barème des hebdomadaires : « récompenses nettement supérieures ». */
const WEEKLY = {
  standard: { rewardXp: 600, rewardTides: 120 },
  booster: { rewardXp: 800, rewardTides: 0, rewardBoosterId: STANDARD_BOOSTER_ID },
} as const;

export const QUEST_CATALOG: readonly QuestDefinition[] = [
  // ======================================================================
  // 1. CARTES — jouer, Briser, piocher.
  // ======================================================================
  { code: "daily_play_creatures_15", name: "Équipage sur le pont", category: "cartes", questType: "daily", objectiveKey: "play_creatures", targetValue: 15, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_play_objects_8", name: "La cale déborde", category: "cartes", questType: "daily", objectiveKey: "play_objects", targetValue: 8, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_break_objects_4", name: "Ça peut encore servir", category: "cartes", questType: "daily", objectiveKey: "break_objects", targetValue: 4, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_play_or_break_objects_10", name: "Rien ne se perd", category: "cartes", questType: "daily", objectiveKey: "play_or_break_objects", targetValue: 10, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_play_low_cost_creatures_10", name: "Petits bras, grand équipage", category: "cartes", questType: "daily", objectiveKey: "play_low_cost_creatures", targetValue: 10, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_creatures_in_match_1", name: "Tout le monde à bord", category: "cartes", questType: "daily", objectiveKey: "creatures_in_match", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_objects_in_match_1", name: "Provision de fortune", category: "cartes", questType: "daily", objectiveKey: "objects_in_match", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_broken_objects_in_match_1", name: "On casse et on repart", category: "cartes", questType: "daily", objectiveKey: "broken_objects_in_match", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_draw_extra_10", name: "Main bien remplie", category: "cartes", questType: "daily", objectiveKey: "draw_extra_cards", targetValue: 10, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_play_cards_25", name: "Des cartes, encore des cartes", category: "cartes", questType: "daily", objectiveKey: "play_cards", targetValue: 25, ...DAILY.light, botProgressAllowed: true },
  { code: "daily_play_marins_10", name: "Main sur le pont", category: "cartes", questType: "daily", objectiveKey: "play_marins", targetValue: 10, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_play_structures_5", name: "Bâtir sur l'eau", category: "cartes", questType: "daily", objectiveKey: "play_structures", targetValue: 5, ...DAILY.standard, botProgressAllowed: true },
  { code: "weekly_break_objects_20", name: "Réemploi intensif", category: "cartes", questType: "weekly", objectiveKey: "break_objects", targetValue: 20, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_play_objects_40", name: "Cargaison complète", category: "cartes", questType: "weekly", objectiveKey: "play_objects", targetValue: 40, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_play_creatures_60", name: "Tout l'équipage", category: "cartes", questType: "weekly", objectiveKey: "play_creatures", targetValue: 60, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_play_cards_100", name: "Le pont ne désemplit pas", category: "cartes", questType: "weekly", objectiveKey: "play_cards", targetValue: 100, ...WEEKLY.booster, botProgressAllowed: true },
  { code: "weekly_draw_extra_50", name: "Collectionneur compulsif", category: "cartes", questType: "weekly", objectiveKey: "draw_extra_cards", targetValue: 50, ...WEEKLY.standard, botProgressAllowed: true },

  // ======================================================================
  // 2. PARTIES — jouer, terminer, gagner.
  // ======================================================================
  { code: "daily_play_matches_3", name: "Prendre le large", category: "parties", questType: "daily", objectiveKey: "play_matches", targetValue: 3, ...DAILY.light, botProgressAllowed: true },
  { code: "daily_play_matches_4", name: "Jusqu'au bout", category: "parties", questType: "daily", objectiveKey: "play_matches", targetValue: 4, ...DAILY.long, botProgressAllowed: true },
  { code: "daily_win_matches_1", name: "Première prise", category: "parties", questType: "daily", objectiveKey: "win_matches", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_win_matches_2", name: "Deux prises valent mieux qu'une", category: "parties", questType: "daily", objectiveKey: "win_matches", targetValue: 2, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_long_matches_2", name: "Longue traversée", category: "parties", questType: "daily", objectiveKey: "long_matches", targetValue: 2, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_pvp_ship_damage_25", name: "Droit sur la coque", category: "parties", questType: "daily", objectiveKey: "pvp_ship_damage", targetValue: 25, ...DAILY.heavy, botProgressAllowed: false },
  { code: "weekly_play_matches_15", name: "Semaine en mer", category: "parties", questType: "weekly", objectiveKey: "play_matches", targetValue: 15, ...WEEKLY.booster, botProgressAllowed: true },
  { code: "weekly_win_matches_7", name: "Vieux loup de mer", category: "parties", questType: "weekly", objectiveKey: "win_matches", targetValue: 7, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_play_matches_20", name: "Une longue semaine", category: "parties", questType: "weekly", objectiveKey: "play_matches", targetValue: 20, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_win_pvp_8", name: "Pavillon haut", category: "parties", questType: "weekly", objectiveKey: "win_pvp_matches", targetValue: 8, ...WEEKLY.standard, botProgressAllowed: false },

  // ======================================================================
  // 3. DECKS — varier les équipages.
  // ======================================================================
  { code: "daily_distinct_decks_2", name: "Changer d'air", category: "decks", questType: "daily", objectiveKey: "distinct_decks_played", targetValue: 2, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_distinct_decks_won_2", name: "Deux équipages", category: "decks", questType: "daily", objectiveKey: "distinct_decks_won", targetValue: 2, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_precon_trial_1", name: "Essai en mer", category: "decks", questType: "daily", objectiveKey: "precon_trials", targetValue: 1, ...DAILY.light, botProgressAllowed: true },
  { code: "weekly_distinct_decks_3", name: "Un peu de tout", category: "decks", questType: "weekly", objectiveKey: "distinct_decks_played", targetValue: 3, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_distinct_decks_won_3", name: "Tous les horizons", category: "decks", questType: "weekly", objectiveKey: "distinct_decks_won", targetValue: 3, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_distinct_decks_4", name: "Tour du port", category: "decks", questType: "weekly", objectiveKey: "distinct_decks_played", targetValue: 4, ...WEEKLY.standard, botProgressAllowed: true },

  // ======================================================================
  // 4. STATS — dégâts, Ancrage, survie.
  // ======================================================================
  { code: "daily_deal_damage_40", name: "Sang sur le pont", category: "stats", questType: "daily", objectiveKey: "deal_damage", targetValue: 40, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_take_damage_30", name: "Ça encaisse", category: "stats", questType: "daily", objectiveKey: "take_damage", targetValue: 30, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_finish_high_anchor_2", name: "Encore debout", category: "stats", questType: "daily", objectiveKey: "finish_high_anchor", targetValue: 2, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_finish_low_anchor_1", name: "À un fil", category: "stats", questType: "daily", objectiveKey: "finish_low_anchor", targetValue: 1, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_damage_in_one_turn_1", name: "Gros calibre", category: "stats", questType: "daily", objectiveKey: "damage_in_one_turn", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_damaging_creatures_1", name: "Ça pique", category: "stats", questType: "daily", objectiveKey: "damaging_creatures_in_match", targetValue: 1, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_scuttle_structures_3", name: "Couler ses propres épaves", category: "stats", questType: "daily", objectiveKey: "scuttle_structures", targetValue: 3, ...DAILY.standard, botProgressAllowed: true },
  { code: "weekly_deal_damage_200", name: "Canon chargé", category: "stats", questType: "weekly", objectiveKey: "deal_damage", targetValue: 200, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_take_damage_150", name: "Dur au mal", category: "stats", questType: "weekly", objectiveKey: "take_damage", targetValue: 150, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_draw_extra_30", name: "Jamais rassasié", category: "stats", questType: "weekly", objectiveKey: "draw_extra_cards", targetValue: 30, ...WEEKLY.standard, botProgressAllowed: true },

  // ======================================================================
  // 5. MARÉE — la catégorie identitaire.
  // ======================================================================
  { code: "daily_modify_tide_5", name: "Gros temps", category: "maree", questType: "daily", objectiveKey: "modify_tide", targetValue: 5, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_tide_rise_3", name: "Ça monte", category: "maree", questType: "daily", objectiveKey: "tide_rise", targetValue: 3, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_tide_fall_3", name: "Ça redescend", category: "maree", questType: "daily", objectiveKey: "tide_fall", targetValue: 3, ...DAILY.standard, botProgressAllowed: true },
  { code: "daily_tide_both_ways_1", name: "Changer de courant", category: "maree", questType: "daily", objectiveKey: "tide_both_ways_in_match", targetValue: 1, ...DAILY.heavy, botProgressAllowed: true },
  { code: "daily_reach_abysses_2", name: "Jusqu'à la limite", category: "maree", questType: "daily", objectiveKey: "reach_abysses", targetValue: 2, ...DAILY.standard, botProgressAllowed: true },
  { code: "weekly_modify_tide_20", name: "Courants contraires", category: "maree", questType: "weekly", objectiveKey: "modify_tide", targetValue: 20, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_tide_rise_12", name: "Montée des eaux", category: "maree", questType: "weekly", objectiveKey: "tide_rise", targetValue: 12, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_tide_fall_12", name: "Marée basse", category: "maree", questType: "weekly", objectiveKey: "tide_fall", targetValue: 12, ...WEEKLY.standard, botProgressAllowed: true },
  { code: "weekly_reach_abysses_8", name: "Descente répétée", category: "maree", questType: "weekly", objectiveKey: "reach_abysses", targetValue: 8, ...WEEKLY.standard, botProgressAllowed: true },
];

export function questLabel(quest: Pick<QuestDefinition, "objectiveKey" | "targetValue">): string {
  return QUEST_OBJECTIVE_LABELS[quest.objectiveKey](quest.targetValue);
}

/** Entrée du catalogue par code — `undefined` si le code n'existe plus. */
export function questByCode(code: string): QuestDefinition | undefined {
  return QUEST_CATALOG.find((quest) => quest.code === code);
}
