import type { CardRarity } from "@/game/boosters/types";

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
  abyssal: 5,
};

/** Valeur de recyclage d'un exemplaire en trop, par rareté — VERROUILLÉ. */
export const RECYCLE_VALUE: Record<CardRarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 45,
  abyssal: 120,
};

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
 * Prix du booster standard, en Tides.
 *
 * NON verrouillé : le cadrage dit « prix en Tides à recalibrer » selon la
 * cadence cible. 500 est la valeur déjà présente en base
 * (`booster_definitions.price_currency`, migration
 * `20260910120000_cards_collection_economy.sql`) ; elle est conservée pour
 * ne pas faire dériver le code et la base, et c'est la base de tout le
 * calibrage de `game/progression/constants.ts`. La source de vérité à
 * l'exécution reste la colonne en base — cette constante n'est qu'un
 * repli/documentation.
 */
export const STANDARD_BOOSTER_PRICE = 500;
