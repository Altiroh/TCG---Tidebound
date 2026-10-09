import {
  BIG_CARD_MIN_COST,
  BIG_TURN_DAMAGE,
  HIGH_ANCHOR_THRESHOLD,
  LONG_MATCH_TURNS,
  LOW_ANCHOR_THRESHOLD,
  LOW_COST_CREATURE_MAX,
} from "@/game/quests/catalog";
import type { QuestObjectiveKey } from "@/game/quests/types";

/**
 * STATISTIQUES À VIE — ce qu'une partie terminée rapporte au compteur
 * permanent d'un joueur (`player_lifetime_stats`).
 *
 * Même source que les quêtes : tout est dérivé du journal d'événements et
 * de l'état final par `computeMatchStats` (`game/quests/progress.ts`), dans
 * la MÊME passe que `computeMatchQuestContribution`. Rien n'est envoyé par
 * le client.
 *
 * DEUX NATURES, et chaque clé en a exactement une :
 *   - `sum` : la valeur de la partie s'AJOUTE au total à vie (« 500 unités
 *     ennemies détruites en tout ») ;
 *   - `record` : la valeur ne s'additionne pas, seule la PLUS GRANDE jamais
 *     vue compte (« 5 unités ennemies détruites en même temps »).
 *
 * La base garde, pour CHAQUE clé, les deux colonnes : `total` (somme de
 * toutes les parties) et `record` (meilleure partie). Une clé `sum` a donc
 * AUSSI son record par partie, gratuitement : « détruire 12 unités ennemies
 * dans une même partie » se lit sur `records.destroy_enemy_units`. Pour une
 * clé `record`, le total n'a pas de sens et n'est pas exposé
 * (`AchievementStats.lifetime` ne porte que les clés `sum`).
 *
 * Les clés sont FIGÉES : elles sont écrites en base à chaque partie. On en
 * ajoute, on n'en renomme jamais — une clé renommée repartirait de zéro.
 */
export type MatchStatNature = "sum" | "record";

/**
 * Plafond du temps de jeu crédité par partie (`play_seconds`). Le chrono
 * d'inactivité borne déjà une partie abandonnée, mais une partie reprise
 * des heures plus tard (rattrapage d'un délai à la reconnexion) ne doit pas
 * gonfler le compteur d'un après-midi entier.
 */
export const MAX_MATCH_SECONDS = 2 * 3600;

/**
 * Objectifs de quête repris tels quels comme cumuls à vie. Exclus : les
 * ensembles (jours, decks distincts — une valeur, pas un compte), la série
 * de jours (un ÉTAT du compte, déjà suivi par `best_play_streak`) et les
 * quêtes journalières terminées (jamais produites par une partie).
 */
export type QuestLifetimeKey = Exclude<
  QuestObjectiveKey,
  "play_days" | "play_streak" | "complete_daily_quests" | "distinct_decks_played" | "distinct_decks_won"
>;

/** Cumuls propres aux statistiques à vie — aucune quête ne les lit. */
export type LifetimeOnlySumKey =
  // --- Cartes ---------------------------------------------------------
  | "play_equipments"
  | "break_objects_from_hand"
  | "draw_cards"
  | "discard_cards"
  | "gain_reason_from_cards"
  // --- Combat et destructions ------------------------------------------
  | "attacks"
  | "direct_attacks"
  | "destroy_enemy_units"
  | "destroy_enemy_structures"
  | "lose_units"
  | "deal_ship_damage"
  | "take_ship_damage"
  | "ship_ability_damage"
  | "intercept_attacks"
  // --- Réactions et pièges ----------------------------------------------
  | "spring_traps"
  | "break_in_reaction"
  | "react_to_attack"
  | "react_to_play"
  | "react_to_break"
  | "reveal_enemy_hand_cards"
  // --- Marée et Déraison -------------------------------------------------
  | "reach_tempete"
  | "tide_state_changes"
  | "deraison_debt"
  // --- Coup fatal ----------------------------------------------------------
  | "lethal_by_ship_ability"
  | "lethal_by_attack"
  | "lethal_by_effect"
  | "lethal_by_tide"
  | "lethal_by_deraison"
  // --- Temps et volume de jeu ---------------------------------------------
  | "play_seconds"
  | "own_turns"
  | "play_pvp_matches"
  | "play_bot_matches"
  | "play_first"
  | "spend_reason"
  // --- Issues de partie ------------------------------------------------------
  | "draw_matches"
  | "win_first"
  | "lose_matches"
  | "lose_to_own_deraison"
  | "win_bot_matches"
  | "win_by_concede"
  | "win_by_timeout"
  | "win_by_ocean_judgment"
  | "win_at_one_anchor"
  | "win_without_losing_unit"
  | "win_without_ship_damage"
  | "win_while_deraison"
  | "win_within_5_turns"
  | "win_within_7_turns"
  | "win_within_10_turns";

/** Records : seule la meilleure partie compte. */
export type MatchRecordKey =
  | "max_destroyed_at_once"
  | "max_enemy_units_destroyed_in_turn"
  | "max_damage_in_turn"
  | "max_single_hit"
  | "max_cards_played_in_turn"
  | "max_deraison_debt"
  | "max_win_anchor";

export type MatchStatKey = QuestLifetimeKey | LifetimeOnlySumKey | MatchRecordKey;

export interface MatchStatDefinition {
  nature: MatchStatNature;
  /** Définition en une ligne — ce qu'un exploit peut promettre au joueur. */
  description: string;
}

/**
 * LE CATALOGUE. Chaque clé calculée par `computeMatchStats` y figure, avec
 * sa nature ; le test `tests/game/matchStats.test.ts` vérifie qu'aucune
 * n'est produite sans y être déclarée.
 *
 * « Vous », « votre action » : l'attribution suit celle des quêtes — le
 * joueur dont l'action (pose, attaque, Bris, capacité, réaction…) est en
 * cours de résolution (`game/quests/progress.ts`, « ATTRIBUTION »). Ce que
 * la Marée ou le début de tour provoque n'est crédité à personne.
 */
export const MATCH_STATS: Readonly<Record<MatchStatKey, MatchStatDefinition>> = {
  // --- Repris des quêtes (cumuls) ------------------------------------------
  play_cards: { nature: "sum", description: "Cartes jouées (posées ou lancées depuis la main)." },
  play_creatures: { nature: "sum", description: "Créatures jouées." },
  play_low_cost_creatures: { nature: "sum", description: `Créatures à ${LOW_COST_CREATURE_MAX} Raison ou moins jouées.` },
  play_marins: { nature: "sum", description: "Marins joués." },
  play_structures: { nature: "sum", description: "Structures jouées." },
  play_objects: { nature: "sum", description: "Objets joués." },
  play_or_break_objects: { nature: "sum", description: "Objets joués ou Brisés." },
  break_objects: { nature: "sum", description: "Objets Brisés (plateau ou main, action du joueur)." },
  draw_extra_cards: { nature: "sum", description: "Cartes piochées au-delà de la pioche de début de tour." },
  creatures_in_match: { nature: "sum", description: "Parties avec au moins 5 Créatures jouées." },
  objects_in_match: { nature: "sum", description: "Parties avec au moins 5 Objets joués." },
  broken_objects_in_match: { nature: "sum", description: "Parties avec au moins 2 Objets Brisés." },
  play_matches: { nature: "sum", description: "Parties jouées (comptées comme jouées : pas d'abandon immédiat)." },
  win_matches: { nature: "sum", description: "Parties gagnées, bot compris." },
  win_pvp_matches: { nature: "sum", description: "Parties gagnées contre un joueur." },
  long_matches: { nature: "sum", description: `Parties d'au moins ${LONG_MATCH_TURNS} tours de table.` },
  play_new_deck: { nature: "sum", description: "Parties jouées avec un deck obtenu récemment." },
  precon_trials: { nature: "sum", description: "Essais de préconstruit contre le bot." },
  deal_damage: { nature: "sum", description: "Dégâts infligés à l'adversaire (unités et Navire) par vos actions." },
  take_damage: { nature: "sum", description: "Dégâts subis par vos unités et votre Navire, toutes origines." },
  pvp_ship_damage: { nature: "sum", description: "Dégâts d'attaques directes au Navire adverse, en PvP seulement." },
  scuttle_structures: { nature: "sum", description: "Structures sabordées." },
  finish_high_anchor: { nature: "sum", description: `Parties terminées avec au moins ${HIGH_ANCHOR_THRESHOLD} Ancrage.` },
  finish_low_anchor: { nature: "sum", description: `Parties terminées debout avec ${LOW_ANCHOR_THRESHOLD} Ancrage ou moins.` },
  damage_in_one_turn: { nature: "sum", description: `Parties avec au moins ${BIG_TURN_DAMAGE} dégâts infligés dans une même phase (seuil des quêtes).` },
  damaging_creatures_in_match: { nature: "sum", description: "Parties où 5 Créatures distinctes ont infligé des dégâts." },
  modify_tide: { nature: "sum", description: "Modifications de Marée provoquées (état, durée, sens, Intensité)." },
  tide_rise: { nature: "sum", description: "Fois où vous avez fait monter la Marée." },
  tide_fall: { nature: "sum", description: "Fois où vous avez fait descendre la Marée." },
  reach_abysses: { nature: "sum", description: "Entrées de la Marée dans les Abysses (toutes causes)." },
  tide_both_ways_in_match: { nature: "sum", description: "Parties où vous avez fait monter ET descendre la Marée." },
  exact_lethal: { nature: "sum", description: "Parties finies en ramenant l'Ancrage adverse à exactement 0." },
  ship_ability_uses: { nature: "sum", description: "Capacités de Navire activées (l'activation, pas le tir)." },
  deraison_turns: { nature: "sum", description: "Tours terminés en Déraison." },
  destroy_enemy_permanents: { nature: "sum", description: "Permanents adverses (tous types) détruits par vos actions." },
  scuttle_permanents: { nature: "sum", description: "Permanents sabordés, tous types." },
  play_big_cards: { nature: "sum", description: `Cartes à ${BIG_CARD_MIN_COST} Raison ou plus jouées.` },
  play_in_abysses: { nature: "sum", description: "Cartes jouées pendant que la Marée est aux Abysses." },
  turns_in_tempete: { nature: "sum", description: "Tours commencés en Tempête." },
  activate_reactions: { nature: "sum", description: "Réactions activées depuis une fenêtre (pièges compris)." },
  summon_units: { nature: "sum", description: "Unités invoquées par un effet." },
  reveal_traps: { nature: "sum", description: "Vos Structures révélées (Marée ou piège déclenché)." },
  heal_anchor: { nature: "sum", description: "Ancrage récupéré par votre Navire." },
  play_anomalies: { nature: "sum", description: "Anomalies jouées." },
  win_after_low_anchor: { nature: "sum", description: `Victoires après être tombé à ${LOW_ANCHOR_THRESHOLD} Ancrage ou moins.` },
  win_without_deraison: { nature: "sum", description: "Victoires sans avoir fini un seul tour en Déraison." },

  // --- Cartes --------------------------------------------------------------
  play_equipments: { nature: "sum", description: "Équipements joués." },
  break_objects_from_hand: { nature: "sum", description: "Objets Brisés directement depuis la main." },
  draw_cards: { nature: "sum", description: "Cartes piochées, pioche de début de tour comprise (main de départ exclue)." },
  discard_cards: { nature: "sum", description: "Cartes de votre main défaussées (effet ou limite de main)." },
  gain_reason_from_cards: { nature: "sum", description: "Raison récupérée grâce à une carte (hors régénération de tour)." },

  // --- Combat et destructions ----------------------------------------------
  attacks: { nature: "sum", description: "Attaques déclarées (une attaque suspendue par un piège compte une fois)." },
  direct_attacks: { nature: "sum", description: "Attaques déclarées contre le Navire adverse." },
  destroy_enemy_units: { nature: "sum", description: "Unités adverses (Marins, Créatures) détruites par vos actions." },
  destroy_enemy_structures: { nature: "sum", description: "Structures adverses détruites par vos actions." },
  lose_units: { nature: "sum", description: "Vos unités détruites, Sabordages exclus." },
  deal_ship_damage: { nature: "sum", description: "Dégâts infligés au Navire adverse par vos actions, toutes sources." },
  take_ship_damage: { nature: "sum", description: "Dégâts subis par votre Navire, toutes origines (Déraison et Marée comprises)." },
  ship_ability_damage: { nature: "sum", description: "Dégâts infligés à l'adversaire par vos capacités de Navire." },
  intercept_attacks: { nature: "sum", description: "Attaques adverses interceptées (dégâts directs annulés par un piège)." },

  // --- Réactions et pièges ----------------------------------------------------
  spring_traps: { nature: "sum", description: "Pièges déclenchés : réaction cachée d'une de vos Structures activée." },
  break_in_reaction: { nature: "sum", description: "Objets Brisés en réaction (Harpon à Ressort, Bouclier d'Écume…)." },
  react_to_attack: { nature: "sum", description: "Réactions activées en réponse à une attaque adverse." },
  react_to_play: { nature: "sum", description: "Réactions activées en réponse à une carte jouée par l'adversaire." },
  react_to_break: { nature: "sum", description: "Réactions activées en réponse à un Bris adverse." },
  reveal_enemy_hand_cards: { nature: "sum", description: "Cartes de la main adverse révélées." },

  // --- Marée et Déraison -------------------------------------------------------
  reach_tempete: { nature: "sum", description: "Entrées de la Marée en Tempête (toutes causes)." },
  tide_state_changes: { nature: "sum", description: "Changements d'état de la Marée vécus (toutes causes)." },
  deraison_debt: { nature: "sum", description: "Points de dette de Déraison réglés en fin de tour." },

  // --- Coup fatal (0 ou 1 par partie, victoires seulement) ------------------
  lethal_by_ship_ability: { nature: "sum", description: "Victoires dont le coup fatal vient d'une de vos capacités de Navire." },
  lethal_by_attack: { nature: "sum", description: "Victoires dont le coup fatal vient d'une de vos attaques." },
  lethal_by_effect: { nature: "sum", description: "Victoires dont le coup fatal vient d'un de vos effets de carte." },
  lethal_by_tide: { nature: "sum", description: "Victoires où l'adversaire coule hors de toute action (Marée, début de tour)." },
  lethal_by_deraison: { nature: "sum", description: "Victoires où l'adversaire coule sous sa propre Déraison." },

  // --- Temps et volume de jeu ----------------------------------------------------
  play_seconds: {
    nature: "sum",
    description: `Temps passé en partie, en secondes (du début au dernier coup, plafonné à ${MAX_MATCH_SECONDS / 3600} h par partie).`,
  },
  own_turns: { nature: "sum", description: "Tours joués (les vôtres, pas ceux de la table)." },
  play_pvp_matches: { nature: "sum", description: "Parties jouées contre un joueur." },
  play_bot_matches: { nature: "sum", description: "Parties jouées contre le bot." },
  play_first: { nature: "sum", description: "Parties où vous avez joué le premier tour." },
  spend_reason: { nature: "sum", description: "Raison engagée : coût imprimé des cartes jouées (réductions non déduites)." },

  // --- Issues de partie (0 ou 1 par partie) ----------------------------------
  draw_matches: { nature: "sum", description: "Parties terminées sans vainqueur (match nul)." },
  win_first: { nature: "sum", description: "Victoires en ayant joué le premier tour." },
  lose_matches: { nature: "sum", description: "Parties perdues (nulles comprises)." },
  lose_to_own_deraison: { nature: "sum", description: "Défaites où votre Navire coule sous votre propre dette de Déraison." },
  win_bot_matches: { nature: "sum", description: "Parties gagnées contre le bot." },
  win_by_concede: { nature: "sum", description: "Victoires par abandon adverse." },
  win_by_timeout: { nature: "sum", description: "Victoires par délais adverses dépassés." },
  win_by_ocean_judgment: { nature: "sum", description: "Victoires au Jugement de l'Océan." },
  win_at_one_anchor: { nature: "sum", description: "Victoires en finissant à exactement 1 Ancrage." },
  win_without_losing_unit: { nature: "sum", description: "Victoires sans avoir perdu une seule unité (Sabordages exclus)." },
  win_without_ship_damage: { nature: "sum", description: "Victoires sans que votre Navire ait subi le moindre dégât." },
  win_while_deraison: { nature: "sum", description: "Victoires en finissant la partie en Déraison (Raison sous 0)." },
  win_within_5_turns: { nature: "sum", description: "Victoires en 5 de vos tours ou moins." },
  win_within_7_turns: { nature: "sum", description: "Victoires en 7 de vos tours ou moins." },
  win_within_10_turns: { nature: "sum", description: "Victoires en 10 de vos tours ou moins." },

  // --- Records -------------------------------------------------------------------
  max_destroyed_at_once: {
    nature: "record",
    description: "Unités adverses détruites EN MÊME TEMPS : par une même action et ses conséquences immédiates.",
  },
  max_enemy_units_destroyed_in_turn: { nature: "record", description: "Unités adverses détruites par vos actions en un seul tour." },
  max_damage_in_turn: { nature: "record", description: "Dégâts infligés à l'adversaire en un seul tour (toutes phases)." },
  max_single_hit: { nature: "record", description: "Plus gros coup unique infligé à l'adversaire (unité ou Navire)." },
  max_cards_played_in_turn: { nature: "record", description: "Cartes jouées en un seul tour." },
  max_deraison_debt: { nature: "record", description: "Plus grosse dette de Déraison réglée en une fin de tour." },
  max_win_anchor: { nature: "record", description: "Ancrage restant à l'issue d'une victoire." },
};

export const MATCH_STAT_KEYS = Object.keys(MATCH_STATS) as MatchStatKey[];

/** Clés dont le TOTAL à vie a un sens (`AchievementStats.lifetime`). */
export const LIFETIME_SUM_KEYS: readonly MatchStatKey[] = MATCH_STAT_KEYS.filter((key) => MATCH_STATS[key].nature === "sum");

export function isMatchStatKey(value: string): value is MatchStatKey {
  return Object.prototype.hasOwnProperty.call(MATCH_STATS, value);
}

/** Contribution d'UNE partie : valeur par clé, zéros omis. */
export type MatchStats = Partial<Record<MatchStatKey, number>>;
