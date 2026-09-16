import { describe, expect, it } from "vitest";
import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import { RARITY_ORDER } from "@/game/boosters/types";
import { CORE_SET } from "@/game/cards/sets/core";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { keptCopiesOf, recycleValueOf, surplusOf, surplusPlan } from "@/features/collection/recycleValue";
import { getMaxCopies } from "@/game/cards/types";

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

describe("surplus", () => {
  const def = CORE_SET[0]!;
  const max = getMaxCopies(def);

  it("garde le maximum d'exemplaires d'un deck", () => {
    expect(keptCopiesOf(def.id)).toBe(Math.max(1, max));
    expect(keptCopiesOf("carte-qui-nexiste-pas")).toBeNull();
  });

  it("ne compte QUE ce qui dépasse le maximum", () => {
    expect(surplusOf(def.id, 0)).toBe(0);
    expect(surplusOf(def.id, max)).toBe(0);
    expect(surplusOf(def.id, max + 2)).toBe(2);
    expect(surplusOf("carte-qui-nexiste-pas", 9)).toBe(0);
  });

  it("récapitule les cartes en surplus, la plus lucrative d'abord", () => {
    const other = CORE_SET.find((card) => recycleValueOf(card.id)! > recycleValueOf(def.id)!)!;
    const plan = surplusPlan({ [def.id]: max + 1, [other.id]: getMaxCopies(other) + 1, [CORE_SET[2]!.id]: 1 });
    expect(plan.map((line) => line.cardId)).toEqual([other.id, def.id]);
    expect(plan[1]).toMatchObject({ quantity: 1, keep: max, tides: recycleValueOf(def.id) });
  });
});
