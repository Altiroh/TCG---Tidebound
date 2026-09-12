import type { QuestDefinition, QuestObjectiveKey, QuestType } from "@/game/quests/types";

/**
 * Catalogue des quêtes et calibrage.
 *
 * STATUT DU CADRAGE (Notion "Boosters & économie de collection") — sont
 * verrouillés les PRINCIPES, pas les nombres :
 *   - 3 quêtes quotidiennes, 2 à 3 hebdomadaires ;
 *   - elles sont « l'une des principales sources contrôlées de Tides » ;
 *   - chaque quête porte `bot_progress_allowed` ; les objectifs de victoire
 *     ou de performance PvP sont à `false` ;
 *   - pas de carte ni de rareté précise, des actions de jeu observables ;
 *   - validation et récompense entièrement côté serveur ;
 *   - cadence cible : ~1 booster (500 Tides) tous les 2 à 3 jours pour un
 *     joueur régulier.
 *
 * PROPOSITION de calibrage (à retester), dans la continuité de
 * `game/progression/constants.ts` : un joueur régulier gagne déjà ~110
 * Tides/jour hors quêtes (paliers ~30, parties PvP ~20, première victoire
 * du jour 60). 3 quotidiennes à 25 (75/jour) + 3 hebdomadaires à 120
 * (~51/jour) portent le total à ~236 Tides/jour, soit un booster tous les
 * ~2,1 jours. Un joueur 100 % solo contre bot ne touche que les quêtes
 * compatibles bot et les paliers : un booster tous les ~4 à 5 jours, ce qui
 * garde le bot moins rentable que le PvP sans le rendre inutile.
 *
 * Ce fichier est la SOURCE DE VÉRITÉ : la table `quests` n'en est qu'un
 * miroir, synchronisé par `npm run seed:cards` (comme `cards`).
 */

export const DAILY_QUEST_COUNT = 3;
export const WEEKLY_QUEST_COUNT = 3;

/**
 * Nombre maximum de quêtes PvP-only dans une même période. Sans ce plafond,
 * un joueur qui ne joue que contre le bot pourrait tirer trois quêtes
 * qu'il ne peut physiquement pas faire avancer.
 */
export const MAX_PVP_ONLY_PER_PERIOD: Record<QuestType, number> = {
  daily: 1,
  weekly: 1,
};

const DAILY_REWARD = 25;
const WEEKLY_REWARD = 120;

/** Libellés joueur de chaque objectif, en fonction de la cible. */
export const QUEST_OBJECTIVE_LABELS: Record<QuestObjectiveKey, (target: number) => string> = {
  play_matches: (n) => `Jouer ${n} partie${n > 1 ? "s" : ""}`,
  play_creatures: (n) => `Jouer ${n} Créature${n > 1 ? "s" : ""}`,
  play_marins: (n) => `Jouer ${n} Marin${n > 1 ? "s" : ""}`,
  play_structures: (n) => `Poser ${n} Structure${n > 1 ? "s" : ""}`,
  break_objects: (n) => `Briser ${n} Objet${n > 1 ? "s" : ""}`,
  scuttle_structures: (n) => `Saborder ${n} Structure${n > 1 ? "s" : ""}`,
  reach_abysses: (n) => `Atteindre les Abysses ${n} fois`,
  win_pvp_matches: (n) => `Gagner ${n} partie${n > 1 ? "s" : ""} en PvP`,
  pvp_ship_damage: (n) => `Infliger ${n} dégâts directs aux Navires adverses en PvP`,
  pvp_win_high_anchor: (n) =>
    n > 1 ? `Remporter ${n} parties PvP avec au moins 5 Ancrage restant` : "Remporter une partie PvP avec au moins 5 Ancrage restant",
};

export const QUEST_CATALOG: readonly QuestDefinition[] = [
  // --- Quotidiennes, compatibles bot -------------------------------------
  { code: "daily_play_matches_3", questType: "daily", objectiveKey: "play_matches", targetValue: 3, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_play_creatures_6", questType: "daily", objectiveKey: "play_creatures", targetValue: 6, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_play_marins_6", questType: "daily", objectiveKey: "play_marins", targetValue: 6, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_play_structures_5", questType: "daily", objectiveKey: "play_structures", targetValue: 5, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_break_objects_3", questType: "daily", objectiveKey: "break_objects", targetValue: 3, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_scuttle_structures_2", questType: "daily", objectiveKey: "scuttle_structures", targetValue: 2, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  { code: "daily_reach_abysses_2", questType: "daily", objectiveKey: "reach_abysses", targetValue: 2, rewardTides: DAILY_REWARD, botProgressAllowed: true },
  // --- Quotidiennes, PvP uniquement -------------------------------------
  { code: "daily_win_pvp_2", questType: "daily", objectiveKey: "win_pvp_matches", targetValue: 2, rewardTides: DAILY_REWARD, botProgressAllowed: false },
  { code: "daily_pvp_ship_damage_15", questType: "daily", objectiveKey: "pvp_ship_damage", targetValue: 15, rewardTides: DAILY_REWARD, botProgressAllowed: false },
  { code: "daily_pvp_win_high_anchor_1", questType: "daily", objectiveKey: "pvp_win_high_anchor", targetValue: 1, rewardTides: DAILY_REWARD, botProgressAllowed: false },
  // --- Hebdomadaires, compatibles bot -----------------------------------
  { code: "weekly_play_matches_15", questType: "weekly", objectiveKey: "play_matches", targetValue: 15, rewardTides: WEEKLY_REWARD, botProgressAllowed: true },
  { code: "weekly_play_creatures_30", questType: "weekly", objectiveKey: "play_creatures", targetValue: 30, rewardTides: WEEKLY_REWARD, botProgressAllowed: true },
  { code: "weekly_play_structures_20", questType: "weekly", objectiveKey: "play_structures", targetValue: 20, rewardTides: WEEKLY_REWARD, botProgressAllowed: true },
  { code: "weekly_reach_abysses_8", questType: "weekly", objectiveKey: "reach_abysses", targetValue: 8, rewardTides: WEEKLY_REWARD, botProgressAllowed: true },
  // --- Hebdomadaires, PvP uniquement ------------------------------------
  { code: "weekly_win_pvp_8", questType: "weekly", objectiveKey: "win_pvp_matches", targetValue: 8, rewardTides: WEEKLY_REWARD, botProgressAllowed: false },
  { code: "weekly_pvp_ship_damage_60", questType: "weekly", objectiveKey: "pvp_ship_damage", targetValue: 60, rewardTides: WEEKLY_REWARD, botProgressAllowed: false },
];

export function questLabel(quest: Pick<QuestDefinition, "objectiveKey" | "targetValue">): string {
  return QUEST_OBJECTIVE_LABELS[quest.objectiveKey](quest.targetValue);
}
