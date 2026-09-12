import { describe, expect, it } from "vitest";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { CORE_SET } from "@/game/cards/sets/core";
import { drawTestBoosterCards } from "@/features/boosters/opening/testBoosterCards";

/** PRNG à graine pour des tirages reproductibles. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const CATALOGUE_IDS = new Set(CORE_SET.map((definition) => definition.id));

describe("drawTestBoosterCards", () => {
  it("tire 5 cartes distinctes du catalogue pour le booster standard", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const cards = drawTestBoosterCards("standard", seededRandom(seed));
      expect(cards).toHaveLength(5);
      expect(new Set(cards.map((card) => card.cardId)).size).toBe(5);
      for (const card of cards) {
        expect(CATALOGUE_IDS.has(card.cardId!)).toBe(true);
      }
    }
  });

  it("donne une rareté de mise en scène cohérente avec la carte tirée", () => {
    const cards = drawTestBoosterCards("standard", seededRandom(7));
    for (const card of cards) {
      const rarity = rarityForCardId(card.cardId!);
      const expected = rarity === "abyssal" ? "abyssal" : rarity === "rare" ? "rare" : "standard";
      expect(card.rarity).toBe(expected);
    }
  });

  it("ne met jamais de Rare ni d'Abyssale dans le booster de Bienvenue", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const cards = drawTestBoosterCards("welcome_tutorial", seededRandom(seed));
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        expect(["common", "uncommon"]).toContain(rarityForCardId(card.cardId!));
      }
    }
  });

  it("varie d'une ouverture à l'autre", () => {
    const first = drawTestBoosterCards("standard", seededRandom(1)).map((card) => card.cardId);
    const second = drawTestBoosterCards("standard", seededRandom(2)).map((card) => card.cardId);
    expect(first).not.toEqual(second);
  });
});
