import { describe, expect, it } from "vitest";
import { legendTerm, markerLegend, tokenPiles } from "@/features/match/boardTokens";

/**
 * JETONS SUR UNE CARTE EN JEU (28/10/2026) : sur le plateau, les marqueurs
 * cumulés s'empilent par trois ; dans le détail, on lit leur nombre.
 */
describe("jetons d'une carte en jeu", () => {
  it("s'empilent par trois : 4 Souillures font une pile pleine et le début d'une seconde", () => {
    expect(tokenPiles(1)).toEqual([1]);
    expect(tokenPiles(3)).toEqual([3]);
    expect(tokenPiles(4)).toEqual([3, 1]);
    expect(tokenPiles(7)).toEqual([3, 3, 1]);
    expect(tokenPiles(0)).toEqual([]);
  });

  it("le détail donne le nombre de Souillures ; un marqueur unique (Mort) n'a pas de compte", () => {
    expect(markerLegend({ souillure: 4 }).map((item) => item.label)).toEqual(["Souillure ×4"]);
    expect(markerLegend({ mort: 1 }).map((item) => item.label)).toEqual(["Mort"]);
    expect(markerLegend({ souillure: 0 })).toEqual([]);
    expect(legendTerm("Souillure ×4")).toBe("Souillure");
  });
});
