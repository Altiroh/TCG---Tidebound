import { describe, expect, it } from "vitest";
import { winsOfStronger, withSeededRandom } from "./ladder";

/** Échelle de difficulté du bot — voir `ladder.ts`. Test LENT : `npm run test:lents`. */
describe("échelle de difficulté du bot", () => {
  it("« difficile » écrase « facile »", () => {
    // 24 PARTIES ET NON 12 (29/09/2026) : une révision de liste de
    // préconstruit a suffi à changer les appariements tirés, et le score
    // est tombé à 8/12 — 0,667, sous le seuil — alors que la même mesure
    // sur 60 parties donnait 53/60 (0,88). À douze parties, un seul match
    // décidait du test.
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("difficile", "facile", 12));
    expect(played).toBeGreaterThan(16);
    expect(wins / played).toBeGreaterThan(0.7);
  });
});
