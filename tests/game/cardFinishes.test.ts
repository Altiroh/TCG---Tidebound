import { describe, expect, it } from "vitest";
import { drawBooster } from "@/game/boosters";
import {
  CARD_FINISH_ODDS,
  RARE_CARD_FINISHES,
  rareFinishChance,
  rarestFinish,
  rollCardFinish,
} from "@/game/cosmetics/finishes";

/**
 * FINITIONS DE CARTE (16/10/2026) : Monochrome, Star Foil, Prismatic,
 * Negative — très rares, sur n'importe quelle carte, sans effet de jeu.
 */
describe("finitions de carte", () => {
  it("sont TRÈS rares : moins d'une carte sur 200, et la Prismatic la plus rare", () => {
    expect(rareFinishChance()).toBeLessThan(1 / 200);
    expect(rareFinishChance()).toBeGreaterThan(0);
    const odds = RARE_CARD_FINISHES.map((f) => CARD_FINISH_ODDS[f]);
    expect([...odds].sort((a, b) => b - a)).toEqual(odds);
  });

  it("le tirage respecte les chances annoncées, à l'échelle de 200 000 cartes", () => {
    const counts: Record<string, number> = {};
    let state = 1234;
    const n = 200_000;
    for (let i = 0; i < n; i += 1) {
      const roll = rollCardFinish(state);
      state = roll.nextState;
      if (roll.finish) counts[roll.finish] = (counts[roll.finish] ?? 0) + 1;
    }
    for (const finish of RARE_CARD_FINISHES) {
      const attendu = n * CARD_FINISH_ODDS[finish];
      expect(counts[finish] ?? 0).toBeGreaterThan(attendu * 0.6);
      expect(counts[finish] ?? 0).toBeLessThan(attendu * 1.4);
    }
  });

  it("n'importe quelle carte peut sortir en finition rare, sans changer la composition du booster", () => {
    const pool = [
      { id: "a", rarity: "common" as const },
      { id: "b", rarity: "uncommon" as const },
      { id: "c", rarity: "rare" as const },
    ];
    const slots = [1, 2, 3].map((slotIndex) => ({ slotIndex, guaranteedRarity: "common" as const }));
    let avecFinition = 0;
    for (let seed = 0; seed < 3000; seed += 1) {
      const result = drawBooster({ slots, pool, ownedCardIds: new Set(["a", "b", "c"]), packsSinceAbyssal: 0, seed });
      expect(result.cards.map((c) => c.cardId)).toEqual(["a", "a", "a"]);
      avecFinition += result.cards.filter((c) => c.finish).length;
    }
    expect(avecFinition).toBeGreaterThan(0);
    expect(avecFinition).toBeLessThan(9000 / 100);
  });

  it("la collection montre la finition la plus rare possédée", () => {
    expect(rarestFinish(undefined)).toBe("classique");
    expect(rarestFinish(["monochrome", "prismatic", "negative"])).toBe("prismatic");
  });
});
