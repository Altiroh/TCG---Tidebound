import type { CardRarity } from "@/game/boosters";

/**
 * Palier VISUEL d'une carte pendant l'ouverture. Volontairement distinct de
 * `CardRarity` (4 paliers de gameplay) : la scène n'a que trois
 * intensités de mise en scène, et ne doit pas dépendre du modèle serveur.
 */
export type BoosterOpeningRarity = "standard" | "rare" | "abyssal";

/** Une carte telle que la scène d'ouverture la consomme. */
export interface BoosterOpeningCard {
  id: string;
  rarity: BoosterOpeningRarity;
}

/**
 * Traduction d'une rareté de gameplay vers un palier de mise en scène.
 * Pas encore utilisée : servira quand la scène recevra le vrai résultat
 * de `openBooster()` (cf. TODO dans `BoostersScreen`).
 */
export function toOpeningRarity(rarity: CardRarity): BoosterOpeningRarity {
  if (rarity === "abyssal") return "abyssal";
  if (rarity === "rare") return "rare";
  return "standard";
}

export const OPENING_RARITY_LABEL: Record<BoosterOpeningRarity, string> = {
  standard: "Standard",
  rare: "Rare",
  abyssal: "Abyssal",
};
