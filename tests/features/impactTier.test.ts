import { describe, expect, it } from "vitest";
import { IMPACT_SCALE, impactTier } from "@/features/match/impactTier";

describe("intensité d'un coup selon ses dégâts", () => {
  it("1 à 3 : classique ; 4 et 5 : lourd ; 6 et plus : massif", () => {
    expect([0, 1, 2, 3].map(impactTier)).toEqual(["light", "light", "light", "light"]);
    expect([4, 5].map(impactTier)).toEqual(["heavy", "heavy"]);
    expect([6, 9, 20].map(impactTier)).toEqual(["massive", "massive", "massive"]);
  });

  it("l'ampleur croît d'un palier à l'autre", () => {
    expect(IMPACT_SCALE.light).toBe(1);
    expect(IMPACT_SCALE.heavy).toBeGreaterThan(IMPACT_SCALE.light);
    expect(IMPACT_SCALE.massive).toBeGreaterThan(IMPACT_SCALE.heavy);
  });
});
