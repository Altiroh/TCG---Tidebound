import { describe, expect, it } from "vitest";
import {
  FULL_SHELF_SLOTS,
  PACKS_PER_SHELF,
  PACK_SLOT_RATIO,
  SHELF_PACK_OVERLAP,
  splitIntoShelves,
  stackedShelfLayout,
} from "@/features/boosters/stackedShelf";

describe("splitIntoShelves", () => {
  it("pose 5 sachets par étagère, dans l'ordre", () => {
    const shelves = splitIntoShelves(Array.from({ length: 12 }, (_, i) => i));
    expect(shelves.map((shelf) => shelf.length)).toEqual([5, 5, 2]);
    expect(shelves[1]?.[0]).toBe(5);
  });

  it("ne crée aucune étagère sans sachet", () => {
    expect(splitIntoShelves([])).toEqual([]);
  });
});

describe("stackedShelfLayout", () => {
  it("centre un sachet seul", () => {
    const layout = stackedShelfLayout(1, 1000, 400);
    expect(layout.packHeight).toBe(400);
    expect(layout.offset).toBeCloseTo((1000 - 400 * PACK_SLOT_RATIO) / 2);
  });

  it("espace les sachets tant qu'il y a la place", () => {
    const layout = stackedShelfLayout(2, 1000, 400, { gap: 24 });
    expect(layout.step).toBeCloseTo(layout.slotWidth + 24);
  });

  it("rapproche les sachets jusqu'à les faire se chevaucher, sans changer leur taille", () => {
    const few = stackedShelfLayout(2, 1000, 400);
    const many = stackedShelfLayout(12, 1000, 400);
    expect(many.packHeight).toBe(few.packHeight);
    expect(many.step).toBeLessThan(many.slotWidth);
    // La rangée tient exactement dans la largeur.
    expect(many.offset).toBeCloseTo(0);
    expect(many.slotWidth + many.step * 11).toBeCloseTo(1000);
  });

  it("ne descend jamais sous le pas minimal", () => {
    const layout = stackedShelfLayout(500, 1000, 400, { minStep: 14 });
    expect(layout.step).toBe(14);
  });

  it("borne la hauteur du sachet à la largeur disponible", () => {
    const layout = stackedShelfLayout(1, 100, 400);
    expect(layout.slotWidth).toBeLessThanOrEqual(100);
  });
});

describe("présentoir plein — grands sachets qui se chevauchent", () => {
  /** Reproduit le calcul de `BoostersScreen` pour une zone de `width` × `height`. */
  function fullShelf(width: number, height: number) {
    const packHeight = Math.min(height * 0.94, width / (FULL_SHELF_SLOTS * PACK_SLOT_RATIO));
    return stackedShelfLayout(PACKS_PER_SHELF, width, packHeight, {
      gap: -packHeight * PACK_SLOT_RATIO * SHELF_PACK_OVERLAP,
      maxPackHeight: Number.POSITIVE_INFINITY,
    });
  }

  it("les cinq sachets se chevauchent légèrement", () => {
    const layout = fullShelf(1200, 600);
    expect(layout.step).toBeLessThan(layout.slotWidth);
    expect(layout.step).toBeCloseTo(layout.slotWidth * (1 - SHELF_PACK_OVERLAP), 4);
  });

  it("les sachets prennent quasiment toute la hauteur quand la largeur le permet", () => {
    const height = 600;
    const layout = fullShelf(2400, height);
    expect(layout.packHeight).toBeCloseTo(height * 0.94, 4);
  });

  it("la rangée pleine ne déborde jamais de la largeur disponible", () => {
    for (const [width, height] of [[900, 500], [1400, 700], [640, 360], [2400, 400]] as const) {
      const layout = fullShelf(width, height);
      expect(layout.offset + layout.slotWidth + layout.step * (PACKS_PER_SHELF - 1)).toBeLessThanOrEqual(width + 0.001);
    }
  });
});
