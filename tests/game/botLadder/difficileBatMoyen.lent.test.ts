import { describe, expect, it } from "vitest";
import { winsOfStronger, withSeededRandom } from "./ladder";

/** Échelle de difficulté du bot — voir `ladder.ts`. Test LENT : `npm run test:lents`. */
describe("échelle de difficulté du bot", () => {
  it("« difficile » bat « moyen »", () => {
    // Écart mesuré sur 120 parties (22/09/2026) : ≈ 0,68. Le seuil est placé
    // sous cette valeur, avec assez de marge pour qu'un réglage mineur ne
    // fasse pas tomber le test — mais pas au point d'accepter la parité.
    //
    // 36 PARTIES ET NON 20 : la refonte des decks d'emprunt (22/09/2026)
    // fait passer `PLAYABLE_DECKS` de dix à dix-huit listes, et
    // l'échantillon en tire d'autres appariements. Sur vingt parties, la
    // variance d'appariement pesait plus lourd que l'écart de difficulté —
    // 0,550 tout rond, pile sur le seuil, alors que la même mesure sur 120
    // parties donnait 0,678. Sur trente-six, quatre graines de hasard
    // distinctes rendent 0,600 à 0,639 : c'est stable, et ça coûte une
    // quinzaine de secondes de plus.
    const { wins, played } = withSeededRandom(20260918, () => winsOfStronger("difficile", "moyen", 18));
    expect(played).toBeGreaterThan(30);
    expect(wins / played).toBeGreaterThan(0.55);
  });
});
