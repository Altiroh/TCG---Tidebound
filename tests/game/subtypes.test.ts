import { describe, expect, it } from "vitest";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import { displayedSubtypes, hasSubtype, isSubtypeId, MAX_SUBTYPES, SUBTYPE_FAMILIES, SUBTYPE_LABELS, subtypesOf } from "@/game/cards/subtypes";

/**
 * SOUS-TYPES (`game/cards/subtypes.ts`) — vocabulaire fermé, au plus trois
 * par carte, et un lecteur unique que tout effet emprunte.
 */
describe("sous-types", () => {
  const cards = [...CARD_DATABASE.values()];

  it("chaque Marin et chaque Créature en porte au moins un", () => {
    const without = cards.filter((card) => (card.type === "marin" || card.type === "creature") && subtypesOf(card).length === 0).map((card) => card.id);
    expect(without).toEqual([]);
  });

  it("au plus trois par carte, tous issus du vocabulaire", () => {
    for (const card of cards) {
      const all = subtypesOf(card);
      expect(all.length, card.id).toBeLessThanOrEqual(MAX_SUBTYPES);
      for (const subtype of all) expect(isSubtypeId(subtype), `${card.id} : ${subtype}`).toBe(true);
    }
  });

  it("chaque identifiant du vocabulaire a une famille, et une seule", () => {
    const listed = Object.values(SUBTYPE_FAMILIES).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(Object.keys(SUBTYPE_LABELS).sort());
  });

  it("un effet qui vise un sous-type voit aussi les sous-types transversaux", () => {
    const chevalier = CARD_DATABASE.get("chevalier-cra-poiscail")!;
    expect(hasSubtype(chevalier, "chevalier")).toBe(true);
    expect(hasSubtype(chevalier, "amphibien")).toBe(true);
    expect(hasSubtype(chevalier, "pirate")).toBe(false);
    // La famille historique reste lue comme avant.
    expect(hasSubtype(CARD_DATABASE.get("pulcinella-gonfle")!, "marionnette")).toBe(true);
  });

  it("à l'affichage, la famille qui n'est que l'archétype s'efface (elle est écrite en bas de la carte)", () => {
    // Un Dead, Altérés, Cavalerie : archétypes pour le joueur, sous-types pour le moteur.
    expect(displayedSubtypes(CARD_DATABASE.get("ptit-bout")!)).toEqual(["mort-vivant"]);
    expect(displayedSubtypes(CARD_DATABASE.get("le-feral")!)).toEqual(["sauvage", "metahumain"]);
    expect(hasSubtype(CARD_DATABASE.get("le-feral")!, "altere")).toBe(true);
    // Marionnette reste un sous-type imprimé ; la troupe est l'archétype Théâtre Englouti.
    expect(displayedSubtypes(CARD_DATABASE.get("il-capitano-naufrage")!)).toEqual(["marionnette", "pirate"]);
    expect(CARD_DATABASE.get("trappe-du-souffleur")!.archetype).toBe("theatre-englouti");
    expect(displayedSubtypes({ subtype: "marionnette", subtypes: ["humain", "pirate", "maudit"] })).toHaveLength(MAX_SUBTYPES);
  });
});
