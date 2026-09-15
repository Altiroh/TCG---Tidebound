import { describe, expect, it } from "vitest";
import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { BOOSTER_STANDARD_PRICE } from "@/game/economy/constants";
import { RARITY_ORDER } from "@/game/boosters/types";
import { CORE_SET } from "@/game/cards/sets/core";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { keepThreshold, recycleValueOf, sellableCopies } from "@/features/collection/recycleValue";
import { DEFAULT_MAX_COPIES, getMaxCopies } from "@/game";

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

/**
 * Ce qui est REVENDABLE. La règle a changé : on ne vend plus « les
 * doubles » mais l'EXCÉDENT — ce qui dépasse la limite de deck de la carte.
 * Vendre un 2ᵉ exemplaire d'une carte jouable en triple était une erreur
 * sans recours, que l'écran comme la base autorisaient.
 */
describe("sellableCopies", () => {
  it("ne rend vendable que ce qui dépasse la limite de la carte", () => {
    for (const def of CORE_SET.slice(0, 40)) {
      const keep = getMaxCopies(def);
      expect(keepThreshold(def.id)).toBe(keep);
      // Pile à la limite, et en dessous : rien à vendre.
      expect(sellableCopies(def.id, keep)).toBe(0);
      expect(sellableCopies(def.id, keep - 1)).toBe(0);
      expect(sellableCopies(def.id, 0)).toBe(0);
      // Au-dessus : uniquement le surplus.
      expect(sellableCopies(def.id, keep + 1)).toBe(1);
      expect(sellableCopies(def.id, keep + 2)).toBe(2);
    }
  });

  it("respecte la limite PROPRE à la carte, pas un 3 uniforme", () => {
    // Les cartes plafonnées plus bas que le défaut existent, et leur
    // excédent commence donc plus tôt : un seuil uniforme les aurait
    // laissées invendables.
    const bridees = CORE_SET.filter((def) => getMaxCopies(def) < DEFAULT_MAX_COPIES);
    expect(bridees.length).toBeGreaterThan(0);
    for (const def of bridees) {
      const keep = getMaxCopies(def);
      expect(sellableCopies(def.id, DEFAULT_MAX_COPIES)).toBe(DEFAULT_MAX_COPIES - keep);
    }
  });

  it("ne rend rien de vendable pour une carte inconnue", () => {
    expect(keepThreshold("carte-qui-nexiste-pas")).toBeNull();
    expect(sellableCopies("carte-qui-nexiste-pas", 99)).toBe(0);
  });
});
