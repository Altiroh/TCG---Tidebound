import { BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import { RARITY_ORDER, type CardRarity } from "@/game/boosters/types";

/**
 * Boosters & économie de collection — valeurs du cadrage Notion
 * ("Boosters & économie de collection", verrouillage du 2026-09-10).
 *
 * Sauf mention contraire, tout ce fichier est VERROUILLÉ côté design : ne
 * pas ajuster ces nombres pour faire passer un test ou équilibrer au
 * doigt mouillé.
 */

/**
 * Poids du palier dans la génération des boosters — VERROUILLÉ. C'est le
 * poids du PALIER, pas la probabilité individuelle d'une carte : une fois
 * le palier tiré, la carte est choisie uniformément dedans.
 */
export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 55,
  uncommon: 28,
  rare: 12,
  // Paliers ouverts par le Lot 11. Insérés SOUS Abyssale sans toucher aux
  // quatre poids verrouillés : la fréquence relative de Commune à Rare est
  // inchangée, Épique et Légendaire se glissent dans l'espace qui restait.
  epic: 4,
  legendary: 1,
  abyssal: 5,
};

/**
 * Part du prix d'un booster que rend le recyclage d'un exemplaire en trop.
 *
 * Exprimée en FRACTION et non en Tides, à dessein. Le cadrage pose une
 * règle plus forte que ses propres chiffres :
 *
 *   > Le recyclage ne doit jamais rembourser intégralement la valeur
 *   > moyenne d'un booster afin d'éviter toute boucle d'ouverture
 *   > autosuffisante.
 *
 * Ses « valeurs de travail » (5 / 15 / 45 / 120) étaient calibrées sur un
 * booster à 500 Tides, soit 1 % / 3 % / 9 % / 24 %. Le passage du booster
 * d'entrée à 100 Tides les aurait rendues absurdes : une Abyssale en double
 * aurait rapporté 120 pour un booster à 100 — exactement la boucle
 * autosuffisante que la règle interdit.
 *
 * Les RATIOS d'origine sont donc conservés, et c'est le montant qui suit le
 * prix. Une future variation de prix ne pourra plus casser la règle en
 * silence.
 */
const RECYCLE_SHARE_OF_BOOSTER: Record<CardRarity, number> = {
  common: 0.01,
  uncommon: 0.03,
  rare: 0.09,
  // Intercalés entre Rare et Abyssale, en gardant l'écart croissant.
  epic: 0.15,
  legendary: 0.2,
  abyssal: 0.24,
};

/** Valeur de recyclage d'un exemplaire en trop, par rareté, en Tides. */
export const RECYCLE_VALUE: Record<CardRarity, number> = Object.fromEntries(
  RARITY_ORDER.map((rarity) => [rarity, Math.max(1, Math.round(BOOSTER_STANDARD_PRICE * RECYCLE_SHARE_OF_BOOSTER[rarity]))])
) as Record<CardRarity, number>;

/**
 * Pity Abyssal — VERROUILLÉ : « Après 10 boosters sans Abyssale, la chance
 * du slot Profondeur d'être Abyssale augmente progressivement. Au 20e
 * booster maximum, une Abyssale est garantie. »
 *
 * `packsSinceAbyssal` compte les boosters ouverts SANS Abyssale ; le
 * booster en cours d'ouverture est donc le n° `packsSinceAbyssal + 1`.
 */
export const PITY = {
  /** Le renforcement commence au booster suivant les 10 premiers sans Abyssale. */
  rampStartsAfterPacks: 10,
  /** Numéro du booster où l'Abyssale est garantie. */
  guaranteeAtPack: 20,
} as const;

/**
 * Chance de base du slot Profondeur d'être Abyssale, avant pity —
 * VERROUILLÉ (slot Profondeur : 55% Peu commune / 35% Rare / 10% Abyssale).
 * Dérivée de `weighted_rarities` en base plutôt que codée en dur ; cette
 * constante ne sert que de repli si un slot pondéré n'exprime aucun poids
 * Abyssal alors que le pity doit s'appliquer.
 */
export const DEPTH_SLOT_BASE_ABYSSAL_CHANCE = 0.1;

/**
 * Prix du booster d'entrée — RÉEXPORT de `game/economy/constants.ts`.
 *
 * Il y avait deux constantes de prix dans le code (500 ici, 150 là-bas),
 * dont une morte. Une seule reste, dans le module d'économie, et ce
 * réexport garde les appelants historiques sans rouvrir la porte à une
 * seconde valeur de vérité.
 */
export const STANDARD_BOOSTER_PRICE = BOOSTER_STANDARD_PRICE;
