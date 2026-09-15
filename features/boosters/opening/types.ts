import type { CardRarity } from "@/game/boosters";

/**
 * Palier VISUEL d'une carte pendant l'ouverture : les six raretés de la
 * collection, chacune avec sa lumière (cf. `BoosterOpening.module.css`,
 * « Réaction lumineuse par rareté »).
 *
 * La scène n'en avait que trois (standard / rare / abyssal) : une commune et
 * une peu commune se retournaient pareil, une Légendaire comme une Rare. Le
 * type reste distinct de `CardRarity` par son nom — la scène ne dépend pas
 * du modèle serveur — mais il en suit les paliers un pour un.
 */
export type BoosterOpeningRarity = CardRarity;

/** Une carte telle que la scène d'ouverture la consomme. */
export interface BoosterOpeningCard {
  /** Clé stable dans le booster (une même carte peut apparaître deux fois). */
  id: string;
  /** Carte du catalogue affichée une fois retournée. Absente : face provisoire « Carte test ». */
  cardId?: string;
  rarity: BoosterOpeningRarity;
}

/** Traduction d'une rareté de collection vers un palier de mise en scène — un pour un. */
export function toOpeningRarity(rarity: CardRarity): BoosterOpeningRarity {
  return rarity;
}

export const OPENING_RARITY_LABEL: Record<BoosterOpeningRarity, string> = {
  common: "Commune",
  uncommon: "Peu commune",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  abyssal: "Abyssale",
};

/** Raretés qui méritent un son de révélation et une poussière lumineuse. */
export function isHighRarity(rarity: BoosterOpeningRarity): boolean {
  return rarity === "rare" || rarity === "epic" || rarity === "legendary" || rarity === "abyssal";
}
