import { describe, expect, it } from "vitest";
import { deckLookRefusal } from "@/game/rules/deckLook";
import type { DeckLookChoice } from "@/game/state/types";
import { instance } from "./testHelpers";

/**
 * Ce qu'un regard de pioche permet de PRENDRE : une seule règle pour le
 * moteur, le bot et l'écran (qui grise et barre les cartes refusées).
 */
function regard(overrides: Partial<DeckLookChoice>): DeckLookChoice {
  return { kind: "deckLook", playerId: "p1", revealed: [], take: 1, refusable: true, turnNumber: 1, ...overrides };
}

describe("cartes prenables d'un regard de pioche", () => {
  const sentinelle = instance("gardienne-de-leclat", "p1");
  const creature = instance("poisson-lanterne", "p1");
  const objet = instance("thermos-du-dernier-quart", "p1");

  it("sans restriction, tout se prend", () => {
    expect([sentinelle, creature, objet].map((c) => deckLookRefusal(regard({}), c))).toEqual([null, null, null]);
  });

  it("« une Sentinelle parmi elles » refuse les autres familles", () => {
    const choix = regard({ takeableArchetype: "sentinelle-chromatique" });
    expect(deckLookRefusal(choix, sentinelle)).toBeNull();
    expect(deckLookRefusal(choix, creature)).toBe("archetype");
    expect(deckLookRefusal(choix, objet)).toBe("archetype");
  });

  it("un type, puis une couleur", () => {
    expect(deckLookRefusal(regard({ takeableCardTypes: ["objet"] }), creature)).toBe("type");
    expect(deckLookRefusal(regard({ takeableChromaticColors: ["rouge"] }), sentinelle)).toBe("color");
    expect(deckLookRefusal(regard({ takeableChromaticColors: ["jaune"] }), sentinelle)).toBeNull();
  });
});
