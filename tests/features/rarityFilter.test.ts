import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game";
import { rarityForCardId } from "@/game/boosters";
import { EMPTY_FILTERS, RARITY_FILTERS, decodeCollectionFilters, hasActiveFilters, matchesFilters } from "@/features/collection/collectionFilters";

/** Le filtre de RARETÉ (les gemmes de la maquette de l'Éditeur, 26/09/2026). */
describe("filtre de rareté", () => {
  it("ne garde que les raretés cochées, et plusieurs se cumulent", () => {
    const rares = { ...EMPTY_FILTERS, rarities: ["rare" as const] };
    const kept = CORE_SET.filter((def) => matchesFilters(def, rares, new Set()));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((def) => rarityForCardId(def.id) === "rare")).toBe(true);

    const both = { ...EMPTY_FILTERS, rarities: ["rare" as const, "epic" as const] };
    expect(CORE_SET.filter((def) => matchesFilters(def, both, new Set())).length).toBeGreaterThan(kept.length);
    expect(hasActiveFilters(rares)).toBe(true);
  });

  it("aucune gemme cochée : toutes les cartes passent", () => {
    expect(CORE_SET.every((def) => matchesFilters(def, EMPTY_FILTERS, new Set()))).toBe(true);
  });

  it("se relit depuis l'appareil sans laisser passer une rareté inconnue", () => {
    expect(decodeCollectionFilters({ rarities: ["rare", "legendary"] }, EMPTY_FILTERS)?.rarities).toEqual(["rare", "legendary"]);
    expect(decodeCollectionFilters({ rarities: ["mythique"] }, EMPTY_FILTERS)?.rarities).toEqual([]);
    expect(RARITY_FILTERS).toEqual(["common", "uncommon", "rare", "epic", "legendary"]);
  });
});
