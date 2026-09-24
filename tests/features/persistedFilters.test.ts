/**
 * Filtres MÉMORISÉS (demande du 24/09/2026) : ce qui est relu du stockage
 * est vérifié, jamais appliqué tel quel. Un filtre périmé (booster retiré,
 * Navire renommé) ou corrompu tombe, au lieu de vider l'écran.
 */
import { describe, expect, it } from "vitest";
import { decodeCollectionFilters, EMPTY_FILTERS, encodeCollectionFilters } from "@/features/collection/collectionFilters";
import { decodeDeckFilters, encodeDeckFilters } from "@/features/decks/deckFilters";
import { BOOSTER_EXTENSIONS } from "@/game/boosters";

describe("filtres de la Collection", () => {
  it("font l'aller-retour, sans la recherche tapée", () => {
    const booster = BOOSTER_EXTENSIONS[0]!.boosterId;
    const filtres = { ...EMPTY_FILTERS, type: "creature" as const, ownership: "missing" as const, costs: [2, 3], boosters: [booster], search: "harpon" };
    const relu = decodeCollectionFilters(JSON.parse(JSON.stringify(encodeCollectionFilters(filtres))), EMPTY_FILTERS);
    expect(relu).toEqual({ ...filtres, search: "" });
  });

  it("écartent ce qui n'existe plus, et gardent le reste", () => {
    const relu = decodeCollectionFilters(
      { variant: "brillant", type: "vaisseau", ownership: "owned", costs: [1, 42, 1], boosters: ["booster-disparu"] },
      EMPTY_FILTERS
    );
    expect(relu).toEqual({ ...EMPTY_FILTERS, ownership: "owned", costs: [1] });
  });

  it("refusent une valeur qui n'est pas un objet", () => {
    expect(decodeCollectionFilters("n'importe quoi", EMPTY_FILTERS)).toBeUndefined();
    expect(decodeCollectionFilters(null, EMPTY_FILTERS)).toBeUndefined();
  });
});

describe("filtres de la liste des decks", () => {
  it("font l'aller-retour (les Set voyagent en tableaux) et écartent un Navire inconnu", () => {
    const encode = encodeDeckFilters({ search: "abysses", styles: new Set(["agressif", "autre"] as const), ships: new Set(["la-verriere"]) });
    const relu = decodeDeckFilters({ ...(JSON.parse(JSON.stringify(encode)) as object), ships: ["la-verriere", "navire-fantome"] });
    expect(relu?.search).toBe("");
    expect([...relu!.styles]).toEqual(["agressif", "autre"]);
    expect([...relu!.ships]).toEqual(["la-verriere"]);
  });
});
