import { describe, expect, it } from "vitest";
import { winsOfStronger, withSeededRandom } from "./ladder";

/** Échelle de difficulté du bot — voir `ladder.ts`. Test LENT : `npm run test:lents`. */
describe("échelle de difficulté du bot", () => {
  it("« moyen » bat « facile » — l'échelle était inversée", () => {
    // 120 PARTIES (29/09/2026). Seize, puis quarante, ne suffisaient pas :
    // chaque révision de préconstruit change les appariements tirés, et le
    // score retombait sur le seuil (8/16, puis 24/40 = 0,600 pile) alors que
    // la mesure sur 120 parties donne 0,717. À 120, l'écart-type est
    // d'environ 0,04 : le seuil est à près de trois écarts-types.
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("moyen", "facile", 60));
    expect(played).toBeGreaterThan(100);
    expect(wins / played).toBeGreaterThan(0.6);
  });
});
