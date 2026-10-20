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
    //
    // 600 PARTIES (20/10/2026). Les Structures simplifiées (Cylindre
    // flottant, Caisses Arrimées, Filet à la Dérive, Cage de Flottaison :
    // actives même masquées, sans Réaction cachée) renforcent les
    // préconstruits défensifs, et la marge de « moyen » est retombée à
    // 0,612 sur 600 parties (0,640 avant) — nouvelle force acceptée par le
    // propriétaire. À 120 parties, la graine tombait à 0,571 ; à 600,
    // l'écart-type est d'environ 0,02 et le seuil reste à trois écarts-types
    // sous la mesure.
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("moyen", "facile", 300));
    expect(played).toBeGreaterThan(550);
    expect(wins / played).toBeGreaterThan(0.55);
  });
});
