import { describe, expect, it } from "vitest";
import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import { RARITY_ORDER } from "@/game/boosters/types";
import { CORE_SET } from "@/game/cards/sets/core";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { recycleValueOf } from "@/features/collection/recycleValue";

/**
 * Barème de revente. Les propriétés vérifiées ici sont celles dont dépend
 * l'économie — et celles que l'ancien barème SQL, gravé en dur, avait
 * violées : il ignorait les raretés ajoutées depuis, et une carte Épique
 * serait repartie avec une valeur indéfinie.
 */
describe("recycleValueOf", () => {
  it("donne une valeur à TOUTE carte du catalogue", () => {
    const sansValeur = CORE_SET.filter((def) => recycleValueOf(def.id) === null).map((def) => def.id);
    expect(sansValeur).toEqual([]);
  });

  it("suit la rareté de la carte", () => {
    for (const def of CORE_SET) {
      expect(recycleValueOf(def.id)).toBe(RECYCLE_VALUE[rarityForCardId(def.id)!]);
    }
  });

  it("croît avec la rareté, sans jamais atteindre le prix d'un booster", () => {
    const values = RARITY_ORDER.map((rarity) => RECYCLE_VALUE[rarity]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
    // Revendre une carte ne doit jamais valoir mieux qu'ouvrir le booster
    // qui l'a donnée : sinon l'économie se retourne.
    expect(Math.max(...values)).toBeLessThan(BOOSTER_STANDARD_PRICE);
  });

  it("rend null pour une carte inconnue", () => {
    expect(recycleValueOf("carte-qui-nexiste-pas")).toBeNull();
  });
});
