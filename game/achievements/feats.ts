import { TIDE_REWARD, type TideRewardTier } from "@/game/economy/constants";
import type { AchievementDefinition, AchievementProgress, AchievementRequirement, AchievementStats } from "@/game/achievements/catalog";
import type { AchievementFamilyId } from "@/game/achievements/families";
import type { MatchStatKey } from "@/game/quests/matchStats";

/**
 * EXPLOITS DE PARTIE — cent jalons lus sur les statistiques à vie
 * (`game/quests/matchStats.ts`, `AchievementStats.lifetime` / `.records`).
 *
 * Tous sont faits de DONNÉES (`AchievementRequirement`) : une clé du
 * catalogue `MATCH_STATS`, une portée (cumul à vie ou record d'une partie)
 * et un seuil. `isUnlocked` et `progress` en sont dérivés ici, une fois
 * pour toutes — aucun exploit n'écrit sa propre logique.
 *
 * Les CODES sont figés : ils sont la clé d'idempotence en base
 * (`player_achievements.code`). On en ajoute, on n'en renomme jamais.
 *
 * FAISABILITÉ (vérifiée contre les règles le 29/09/2026) :
 *   - « en même temps » plafonne au plateau adverse : 4 à 6 Slots selon le
 *     Navire (`shipData.ts`), d'où 5 au plus pour un exploit visible, et 6
 *     en caché (seul Le Brise-Lames en aligne six) ;
 *   - un coup de 10 existe (Créature d'attaque 10), 8 en a deux ;
 *   - la Raison n'a pas de plancher : jouer 8 cartes dans un tour ou
 *     régler une dette de 10 est ruineux, pas impossible ;
 *   - 25 Ancrage restant à la victoire tient sur toute coque de 30 (Le
 *     Courlis, à 26, n'a le droit qu'à un point d'écart).
 */

/** Cumul à vie ≥ `target` (clé de nature `sum`). */
export function lifetime(key: MatchStatKey, target: number): AchievementRequirement {
  return { scope: "lifetime", key, target };
}

/** Record d'une partie ≥ `target` (toute clé). */
export function record(key: MatchStatKey, target: number): AchievementRequirement {
  return { scope: "record", key, target };
}

/** Valeur actuelle d'une condition : une clé absente vaut 0. */
export function requirementValue(stats: AchievementStats, requirement: AchievementRequirement): number {
  const source = requirement.scope === "lifetime" ? stats.lifetime : stats.records;
  return source[requirement.key] ?? 0;
}

function met(stats: AchievementStats, requirement: AchievementRequirement): boolean {
  return requirementValue(stats, requirement) >= requirement.target;
}

/**
 * Jauge : le compteur lui-même pour une condition seule ; pour une
 * combinaison, le nombre de conditions remplies — une somme de seuils
 * disparates (25 Créatures + 1 Tempête) ne dirait rien.
 */
function progressOf(stats: AchievementStats, requirements: readonly AchievementRequirement[]): AchievementProgress {
  if (requirements.length === 1) {
    const only = requirements[0]!;
    return { current: Math.max(0, Math.min(requirementValue(stats, only), only.target)), target: only.target };
  }
  return { current: requirements.filter((requirement) => met(stats, requirement)).length, target: requirements.length };
}

interface FeatSpec {
  code: string;
  name: string;
  description: string;
  reward: TideRewardTier;
  requires: readonly AchievementRequirement[];
  hidden?: boolean;
}

/** Fabrique : un exploit de partie à partir de ses conditions. */
function feat(family: AchievementFamilyId, spec: FeatSpec): AchievementDefinition {
  const requirements = spec.requires;
  return {
    code: spec.code,
    family,
    name: spec.name,
    description: spec.description,
    rewardTides: TIDE_REWARD[spec.reward],
    ...(spec.hidden ? { hidden: true } : {}),
    requirements,
    isUnlocked: (stats) => requirements.every((requirement) => met(stats, requirement)),
    progress: (stats) => progressOf(stats, requirements),
  };
}

type Palier = [target: number, code: string, name: string, reward: TideRewardTier, hidden?: "caché"];

/**
 * Fabrique d'ÉCHELLE : plusieurs paliers d'une même statistique, la
 * description écrite une fois (`dire(n)`).
 */
function paliers(
  family: AchievementFamilyId,
  scope: "lifetime" | "record",
  key: MatchStatKey,
  dire: (target: number) => string,
  steps: readonly Palier[]
): AchievementDefinition[] {
  return steps.map(([target, code, name, reward, hidden]) =>
    feat(family, {
      code,
      name,
      description: dire(target),
      reward,
      requires: [scope === "lifetime" ? lifetime(key, target) : record(key, target)],
      hidden: hidden === "caché",
    })
  );
}

const fr = (n: number) => n.toLocaleString("fr-FR");

// ---------------------------------------------------------------------------
// PREMIÈRES ESCALES — le métier qui rentre
// ---------------------------------------------------------------------------
const escales: AchievementDefinition[] = [
  ...paliers("voyage", "lifetime", "play_matches", (n) => `Jouer ${fr(n)} parties.`, [
    [100, "matches_100", "Journal de bord épais", "standard"],
    [500, "matches_500", "Du sel dans les veines", "big"],
  ]),
  ...paliers("voyage", "lifetime", "win_matches", (n) => `Remporter ${fr(n)} parties, bot compris.`, [
    [10, "wins_10", "Dix pavillons", "small"],
    [50, "wins_50", "Mât pavoisé", "standard"],
    [200, "wins_200", "Grand pavois", "big"],
  ]),
  ...paliers("voyage", "lifetime", "win_pvp_matches", (n) => (n === 1 ? "Remporter une partie contre un autre joueur." : `Remporter ${fr(n)} parties contre d'autres joueurs.`), [
    [1, "win_pvp_1", "Premier duel", "small"],
    [50, "win_pvp_50", "La terreur des quais", "big"],
  ]),
  feat("voyage", {
    code: "play_new_deck_10",
    name: "Odeur de peinture fraîche",
    description: "Jouer 10 parties avec un deck fraîchement obtenu.",
    reward: "small",
    requires: [lifetime("play_new_deck", 10)],
  }),
];

// ---------------------------------------------------------------------------
// L'ÉQUIPAGE — ce qu'on met sur le pont
// ---------------------------------------------------------------------------
const equipage: AchievementDefinition[] = [
  ...paliers("equipage", "lifetime", "play_cards", (n) => `Jouer ${fr(n)} cartes.`, [
    [500, "play_cards_500", "Cinq cents cartes à l'eau", "small"],
    [5000, "play_cards_5000", "Paquet de mer", "big"],
  ]),
  ...paliers("equipage", "lifetime", "play_creatures", (n) => `Jouer ${fr(n)} Créatures.`, [[250, "play_creatures_250", "Bestiaire des profondeurs", "standard"]]),
  ...paliers("equipage", "lifetime", "play_marins", (n) => `Jouer ${fr(n)} Marins.`, [[250, "play_marins_250", "Toute la taverne à bord", "standard"]]),
  ...paliers("equipage", "lifetime", "play_structures", (n) => `Jouer ${fr(n)} Structures.`, [[100, "play_structures_100", "Charpentier de marine", "small"]]),
  ...paliers("equipage", "lifetime", "play_equipments", (n) => `Jouer ${fr(n)} Équipements.`, [[50, "play_equipments_50", "Armurier de bord", "small"]]),
  ...paliers("equipage", "lifetime", "play_big_cards", (n) => `Jouer ${fr(n)} cartes à 5 Raison ou plus.`, [[100, "play_big_cards_100", "Poids lourds", "standard"]]),
  ...paliers("equipage", "lifetime", "summon_units", (n) => `Invoquer ${fr(n)} unités par des effets.`, [[100, "summon_units_100", "Appel du large", "standard"]]),
  feat("equipage", {
    code: "all_card_types_25",
    name: "Équipage bigarré",
    description: "Jouer au moins 25 cartes de chaque type : Marins, Créatures, Structures, Objets, Équipements et Anomalies.",
    reward: "standard",
    requires: [
      lifetime("play_marins", 25),
      lifetime("play_creatures", 25),
      lifetime("play_structures", 25),
      lifetime("play_objects", 25),
      lifetime("play_equipments", 25),
      lifetime("play_anomalies", 25),
    ],
  }),
  ...paliers("equipage", "lifetime", "draw_cards", (n) => `Piocher ${fr(n)} cartes.`, [[1000, "draw_cards_1000", "Pioche infatigable", "standard"]]),
  ...paliers("equipage", "lifetime", "reveal_enemy_hand_cards", (n) => `Révéler ${fr(n)} cartes de la main adverse.`, [[50, "reveal_enemy_hand_50", "Longue-vue indiscrète", "standard"]]),
  ...paliers("equipage", "lifetime", "discard_cards", (n) => `Défausser ${fr(n)} cartes de votre main.`, [[100, "discard_cards_100", "Jeté aux mouettes", "small", "caché"]]),
];

// ---------------------------------------------------------------------------
// COMBAT — cumuls d'attaques, de dégâts et de destructions
// ---------------------------------------------------------------------------
const combat: AchievementDefinition[] = [
  ...paliers("combat", "lifetime", "attacks", (n) => `Déclarer ${fr(n)} attaques.`, [[1000, "attacks_1000", "Mille assauts", "standard"]]),
  ...paliers("combat", "lifetime", "direct_attacks", (n) => `Attaquer ${fr(n)} fois le Navire adverse directement.`, [[250, "direct_attacks_250", "Cap sur la coque", "standard"]]),
  ...paliers("combat", "lifetime", "deal_damage", (n) => `Infliger ${fr(n)} dégâts à l'adversaire, unités et Navire confondus.`, [[10000, "deal_damage_10000", "Faiseur d'épaves", "big"]]),
  ...paliers("combat", "lifetime", "destroy_enemy_units", (n) => `Détruire ${fr(n)} unités adverses.`, [
    [25, "destroy_units_25", "Premiers naufrages", "small"],
    [250, "destroy_units_250", "Cimetière marin", "standard"],
    [1000, "destroy_units_1000", "Le fond est plein", "big"],
  ]),
  ...paliers("combat", "lifetime", "destroy_enemy_structures", (n) => `Détruire ${fr(n)} Structures adverses.`, [[50, "destroy_structures_50", "Démolisseur de quais", "standard"]]),
  ...paliers("combat", "lifetime", "damaging_creatures_in_match", (n) => `Finir ${fr(n)} parties où 5 Créatures différentes ont infligé des dégâts.`, [
    [10, "damaging_creatures_10", "Meute lâchée", "standard"],
  ]),
  ...paliers("combat", "lifetime", "lose_units", (n) => `Perdre ${fr(n)} de vos unités (Sabordages exclus).`, [[500, "lose_units_500", "Chair à requins", "small", "caché"]]),
  ...paliers("combat", "lifetime", "take_ship_damage", (n) => `Encaisser ${fr(n)} dégâts sur votre Navire.`, [[2000, "take_ship_damage_2000", "Coque rapiécée", "small", "caché"]]),
];

// ---------------------------------------------------------------------------
// RECORDS — sur une action, un tour, une partie
// ---------------------------------------------------------------------------
const records: AchievementDefinition[] = [
  ...paliers("records", "record", "max_destroyed_at_once", (n) => `Détruire ${n} unités adverses d'une seule action et de ses suites immédiates.`, [
    [2, "destroyed_at_once_2", "Coup double", "small"],
    [3, "destroyed_at_once_3", "Trois d'un coup", "standard"],
    [5, "destroyed_at_once_5", "Table rase", "big"],
    [6, "destroyed_at_once_6", "Brise-lames brisé", "big", "caché"],
  ]),
  ...paliers("records", "record", "max_enemy_units_destroyed_in_turn", (n) => `Détruire ${n} unités adverses en un seul tour.`, [[4, "destroyed_in_turn_4", "Sale journée pour eux", "standard"]]),
  ...paliers("records", "record", "destroy_enemy_units", (n) => `Détruire ${n} unités adverses dans une même partie.`, [[12, "destroyed_in_match_12", "Hécatombe", "big"]]),
  ...paliers("records", "record", "max_single_hit", (n) => `Infliger ${n} dégâts ou plus en un seul coup.`, [
    [8, "single_hit_8", "Coup de massue", "standard"],
    [10, "single_hit_10", "Coup de tonnerre", "big", "caché"],
  ]),
  ...paliers("records", "record", "max_damage_in_turn", (n) => `Infliger ${n} dégâts à l'adversaire en un seul tour.`, [
    [15, "damage_in_turn_15", "Bordée complète", "standard"],
    [25, "damage_in_turn_25", "Ouragan de fer", "big"],
  ]),
  ...paliers("records", "record", "max_cards_played_in_turn", (n) => `Jouer ${n} cartes en un seul tour.`, [
    [5, "cards_in_turn_5", "Branle-bas", "standard"],
    [8, "cards_in_turn_8", "Tout sur la table", "big", "caché"],
  ]),
];

// ---------------------------------------------------------------------------
// MARÉE
// ---------------------------------------------------------------------------
const maree: AchievementDefinition[] = [
  ...paliers("maree", "lifetime", "tide_rise", (n) => `Faire monter la Marée ${fr(n)} fois.`, [[50, "tide_rise_50", "Faiseur de vagues", "small"]]),
  ...paliers("maree", "lifetime", "tide_fall", (n) => `Faire descendre la Marée ${fr(n)} fois.`, [[50, "tide_fall_50", "Apaiseur de flots", "small"]]),
  ...paliers("maree", "lifetime", "modify_tide", (n) => `Modifier la Marée ${fr(n)} fois (état, durée, sens ou Intensité).`, [[250, "modify_tide_250", "Main sur la Marée", "standard"]]),
  ...paliers("maree", "lifetime", "tide_both_ways_in_match", (n) => `Finir ${fr(n)} parties où vous avez fait monter ET descendre la Marée.`, [[10, "tide_both_ways_10", "Flux et reflux", "standard"]]),
  ...paliers("maree", "lifetime", "reach_tempete", (n) => `Voir la Marée entrer ${fr(n)} fois en Tempête.`, [[25, "reach_tempete_25", "Enfant de la Tempête", "small"]]),
  ...paliers("maree", "lifetime", "turns_in_tempete", (n) => `Commencer ${fr(n)} de vos tours en Tempête.`, [[100, "turns_in_tempete_100", "Cap-hornier", "standard"]]),
  ...paliers("maree", "lifetime", "reach_abysses", (n) => `Voir la Marée plonger ${fr(n)} fois dans les Abysses.`, [[10, "reach_abysses_10", "Frôler les Abysses", "small"]]),
  ...paliers("maree", "lifetime", "play_in_abysses", (n) => `Jouer ${fr(n)} cartes pendant que la Marée est aux Abysses.`, [[100, "play_in_abysses_100", "Lanterne des Abysses", "standard"]]),
  ...paliers("maree", "record", "tide_state_changes", (n) => `Vivre ${n} changements d'état de la Marée dans une même partie.`, [[8, "tide_changes_in_match_8", "Mer démontée", "standard", "caché"]]),
  feat("maree", {
    code: "all_tides",
    name: "Toutes les eaux",
    description: "Connaître la Tempête et les Abysses, commencer un tour en Tempête, et faire monter puis descendre la Marée dans une même partie.",
    reward: "standard",
    requires: [lifetime("reach_tempete", 1), lifetime("reach_abysses", 1), lifetime("turns_in_tempete", 1), lifetime("tide_both_ways_in_match", 1)],
  }),
];

// ---------------------------------------------------------------------------
// DÉRAISON
// ---------------------------------------------------------------------------
const deraison: AchievementDefinition[] = [
  ...paliers("deraison", "lifetime", "deraison_turns", (n) => (n === 1 ? "Finir un tour en Déraison." : `Finir ${fr(n)} tours en Déraison.`), [
    [1, "deraison_turns_1", "Premier vertige", "small"],
    [100, "deraison_turns_100", "Pied dans le vide", "standard"],
  ]),
  ...paliers("deraison", "lifetime", "deraison_debt", (n) => `Régler ${fr(n)} points de dette de Déraison, toutes parties confondues.`, [
    [200, "deraison_debt_200", "L'Océan tient les comptes", "standard"],
    [500, "deraison_debt_500", "Endetté jusqu'au cou", "big", "caché"],
  ]),
  ...paliers("deraison", "record", "max_deraison_debt", (n) => `Régler une dette de Déraison de ${n} points en une seule fin de tour.`, [
    [5, "deraison_debt_once_5", "Fièvre des profondeurs", "standard"],
    [10, "deraison_debt_once_10", "Au-delà de la raison", "big", "caché"],
  ]),
  ...paliers("deraison", "lifetime", "win_while_deraison", (n) => (n === 1 ? "Gagner une partie en la finissant en Déraison." : `Gagner ${fr(n)} parties en les finissant en Déraison.`), [
    [1, "win_while_deraison_1", "Fou, mais vainqueur", "standard"],
    [10, "win_while_deraison_10", "Méthode dans la folie", "big", "caché"],
  ]),
  ...paliers("deraison", "lifetime", "win_without_deraison", (n) => `Gagner ${fr(n)} parties sans finir un seul tour en Déraison.`, [[50, "win_without_deraison_50", "Sang-froid de capitaine", "standard"]]),
  ...paliers("deraison", "lifetime", "lose_to_own_deraison", () => "Couler sous votre propre dette de Déraison.", [[1, "lose_to_own_deraison_1", "Son pire ennemi", "small", "caché"]]),
];

// ---------------------------------------------------------------------------
// BRIS & PIÈGES — les Objets qu'on casse, les réponses qu'on tient prêtes
// ---------------------------------------------------------------------------
const bris: AchievementDefinition[] = [
  ...paliers("bris", "lifetime", "break_objects", (n) => `Briser ${fr(n)} Objets.`, [
    [50, "break_objects_50", "Casse-tout", "small"],
    [250, "break_objects_250", "Bris en série", "standard"],
  ]),
  ...paliers("bris", "lifetime", "break_objects_from_hand", (n) => `Briser ${fr(n)} Objets directement depuis votre main.`, [[25, "break_from_hand_25", "Jamais servi", "small"]]),
  ...paliers("bris", "lifetime", "break_in_reaction", (n) => (n === 1 ? "Briser un Objet en réaction." : `Briser ${fr(n)} Objets en réaction.`), [
    [1, "break_in_reaction_1", "Ressort détendu", "small"],
    [25, "break_in_reaction_25", "Réflexe de gabier", "standard"],
  ]),
  ...paliers("bris", "lifetime", "spring_traps", (n) => (n === 1 ? "Déclencher un piège : la réaction cachée d'une de vos Structures." : `Déclencher ${fr(n)} pièges.`), [
    [1, "spring_traps_1", "Le piège se referme", "small"],
    [50, "spring_traps_50", "Côte à récifs", "standard"],
    [200, "spring_traps_200", "Naufrageur de la côte", "big", "caché"],
  ]),
  ...paliers("bris", "lifetime", "react_to_attack", (n) => `Activer ${fr(n)} réactions en réponse à une attaque adverse.`, [[25, "react_to_attack_25", "Riposte", "standard"]]),
  ...paliers("bris", "lifetime", "react_to_break", (n) => (n === 1 ? "Répondre à un Bris adverse par une réaction." : `Répondre ${fr(n)} fois à un Bris adverse par une réaction.`), [
    [1, "react_to_break_1", "Bris pour Bris", "standard"],
    [10, "react_to_break_10", "Contre-Bris", "big", "caché"],
  ]),
  ...paliers("bris", "lifetime", "intercept_attacks", (n) => `Intercepter ${fr(n)} attaques adverses avec un piège.`, [[10, "intercept_attacks_10", "Mur d'écume", "standard"]]),
  feat("bris", {
    code: "answer_everything",
    name: "Réponse à tout",
    description: "Activer une réaction en réponse à une attaque, à une carte jouée et à un Bris adverses.",
    reward: "big",
    requires: [lifetime("react_to_attack", 1), lifetime("react_to_play", 1), lifetime("react_to_break", 1)],
  }),
  ...paliers("bris", "lifetime", "reveal_traps", (n) => `Voir ${fr(n)} de vos Structures révélées, par la Marée ou par un piège.`, [[100, "reveal_traps_100", "Tout finit par se voir", "small", "caché"]]),
];

// ---------------------------------------------------------------------------
// NAVIRES — la coque, sa capacité, son Ancrage
// ---------------------------------------------------------------------------
const navires: AchievementDefinition[] = [
  ...paliers("navire", "lifetime", "ship_ability_uses", (n) => `Activer ${fr(n)} fois la capacité de votre Navire.`, [
    [10, "ship_ability_10", "Premier ordre", "small"],
    [100, "ship_ability_100", "Maître à bord", "standard"],
    [500, "ship_ability_500", "Ne faire qu'un avec la coque", "big"],
  ]),
  ...paliers("navire", "lifetime", "ship_ability_damage", (n) => `Infliger ${fr(n)} dégâts avec la capacité de votre Navire.`, [[200, "ship_ability_damage_200", "Canonnier de proue", "standard"]]),
  ...paliers("navire", "record", "heal_anchor", (n) => `Récupérer ${n} Ancrage dans une même partie.`, [[8, "heal_in_match_8", "Radoub en pleine mer", "standard", "caché"]]),
  ...paliers("navire", "lifetime", "scuttle_permanents", (n) => `Saborder ${fr(n)} de vos permanents.`, [[25, "scuttle_25", "Sabordeur", "small"]]),
  ...paliers("navire", "record", "scuttle_permanents", (n) => `Saborder ${n} permanents dans une même partie.`, [[4, "scuttle_in_match_4", "Vider les cales", "standard", "caché"]]),
  ...paliers("navire", "lifetime", "finish_high_anchor", (n) => `Finir ${fr(n)} parties avec au moins 10 Ancrage.`, [[25, "finish_high_anchor_25", "Bien amarré", "standard"]]),
  ...paliers("navire", "record", "max_win_anchor", (n) => `Gagner une partie avec au moins ${n} Ancrage restant.`, [[25, "win_anchor_25", "Coque de chêne", "big"]]),
  ...paliers("navire", "lifetime", "win_without_ship_damage", () => "Gagner une partie sans que votre Navire subisse le moindre dégât.", [[1, "win_without_ship_damage_1", "Pas une éraflure", "big"]]),
];

// ---------------------------------------------------------------------------
// COUPS FATALS — comment la partie s'achève
// ---------------------------------------------------------------------------
const fatals: AchievementDefinition[] = [
  ...paliers("fatal", "lifetime", "lethal_by_attack", (n) => `Couler ${fr(n)} Navires adverses d'une attaque.`, [[10, "lethal_by_attack_10", "Dernier assaut", "standard"]]),
  ...paliers("fatal", "lifetime", "lethal_by_effect", (n) => `Couler ${fr(n)} Navires adverses par un effet de carte.`, [[10, "lethal_by_effect_10", "Coup de théâtre", "standard"]]),
  ...paliers("fatal", "lifetime", "lethal_by_ship_ability", () => "Couler un Navire adverse avec la capacité de votre Navire.", [[1, "lethal_by_ship_ability_1", "Le Navire a le dernier mot", "standard"]]),
  ...paliers("fatal", "lifetime", "lethal_by_tide", () => "Gagner quand la Marée achève le Navire adverse.", [[1, "lethal_by_tide_1", "La mer a tranché", "standard", "caché"]]),
  ...paliers("fatal", "lifetime", "lethal_by_deraison", () => "Gagner quand l'adversaire coule sous sa propre Déraison.", [[1, "lethal_by_deraison_1", "Perdu dans sa folie", "standard", "caché"]]),
  feat("fatal", {
    code: "all_lethals",
    name: "Cinq façons de couler",
    description: "Achever un Navire adverse de chaque façon : attaque, effet de carte, capacité de Navire, Marée et Déraison adverse.",
    reward: "big",
    requires: [
      lifetime("lethal_by_attack", 1),
      lifetime("lethal_by_effect", 1),
      lifetime("lethal_by_ship_ability", 1),
      lifetime("lethal_by_tide", 1),
      lifetime("lethal_by_deraison", 1),
    ],
  }),
  ...paliers("fatal", "lifetime", "exact_lethal", (n) => `Finir ${fr(n)} parties en ramenant l'Ancrage adverse à exactement 0.`, [[10, "exact_lethal_10", "Compte juste", "standard"]]),
  ...paliers("fatal", "lifetime", "win_at_one_anchor", (n) => (n === 1 ? "Gagner une partie avec exactement 1 Ancrage." : `Gagner ${fr(n)} parties avec exactement 1 Ancrage.`), [
    [1, "win_at_one_anchor_1", "Sur un fil de chanvre", "big"],
    [5, "win_at_one_anchor_5", "Funambule des flots", "big", "caché"],
  ]),
  ...paliers("fatal", "lifetime", "win_within_5_turns", () => "Gagner une partie en 5 de vos tours ou moins.", [[1, "win_within_5_turns_1", "Éclair sur l'eau", "big"]]),
  ...paliers("fatal", "lifetime", "win_without_losing_unit", () => "Gagner une partie sans perdre une seule unité (Sabordages exclus).", [[1, "win_without_losing_unit_1", "Personne à la mer", "standard"]]),
  ...paliers("fatal", "lifetime", "win_by_ocean_judgment", () => "Gagner au Jugement de l'Océan.", [[1, "win_by_ocean_judgment_1", "Jugé par l'Océan", "standard", "caché"]]),
  ...paliers("fatal", "lifetime", "win_by_concede", (n) => `Gagner ${fr(n)} parties par abandon adverse.`, [[10, "win_by_concede_10", "Pavillon blanc", "small", "caché"]]),
  feat("fatal", {
    code: "legend_of_the_ports",
    name: "Légende des ports",
    description: "Gagner en 5 tours ou moins, gagner sans perdre d'unité, gagner à 1 Ancrage et gagner en Déraison.",
    reward: "big",
    hidden: true,
    requires: [lifetime("win_within_5_turns", 1), lifetime("win_without_losing_unit", 1), lifetime("win_at_one_anchor", 1), lifetime("win_while_deraison", 1)],
  }),
];

/** Les cent exploits de partie, famille par famille, chacun du plus simple au plus rare. */
export const FEAT_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  ...escales,
  ...equipage,
  ...combat,
  ...records,
  ...maree,
  ...deraison,
  ...bris,
  ...navires,
  ...fatals,
];
