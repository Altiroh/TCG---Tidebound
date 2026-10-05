import { describe, expect, it } from "vitest";
import { effectsPolarity, sourcePolarity } from "@/features/match/table/targetPolarity";

/**
 * Couleur du ciblage (05/10/2026) : rouge quand l'effet nuit à l'unité
 * désignée, bleu quand il l'aide.
 */
describe("sens d'un ciblage", () => {
  it("dégâts, destruction et malus sont hostiles", () => {
    expect(effectsPolarity([{ type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 2 } }])).toBe("hostile");
    expect(effectsPolarity([{ type: "destroy", target: { kind: "chosenUnit" } }])).toBe("hostile");
    expect(
      effectsPolarity([{ type: "buff", target: { kind: "chosenUnit" }, attackAmount: { kind: "flat", value: -2 }, duration: "endOfTurn" }])
    ).toBe("hostile");
  });

  it("soin, bonus et renvoi d'une unité à soi sont bienfaisants", () => {
    expect(effectsPolarity([{ type: "heal", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 2 } }])).toBe("friendly");
    expect(
      effectsPolarity([{ type: "buff", target: { kind: "chosenUnit" }, attackAmount: { kind: "flat", value: 1 }, duration: "endOfTurn" }])
    ).toBe("friendly");
    expect(effectsPolarity([{ type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { sameController: true } } }])).toBe("friendly");
  });

  it("lit les effets de la bonne capacité d'une carte", () => {
    // Le Masque Fendu : renvoie une Marionnette QUE VOUS CONTRÔLEZ — un repli.
    expect(sourcePolarity("le-masque-fendu", "break")).toBe("friendly");
    // Jusqu'à ce que ça casse : un dégât de plus à l'unité qui a survécu.
    expect(sourcePolarity("jusqua-ce-que-ca-casse", "reaction", 0)).toBe("hostile");
  });
});
