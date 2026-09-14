import { describe, expect, it } from "vitest";
import { PACK_SLOT_RATIO, stackedShelfLayout } from "@/features/boosters/stackedShelf";

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
