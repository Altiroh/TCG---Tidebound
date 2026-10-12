import { describe, expect, it } from "vitest";
import { dustBounds, perimeterPoint } from "@/features/match/impactFx";

describe("impactFx — la poussière s'échappe tout autour de la carte", () => {
  const rect = { left: 100, top: 200, width: 80, height: 120 };

  it("les points du pourtour sont sur les bords, avec une normale qui sort de la carte", () => {
    for (let i = 0; i < 40; i += 1) {
      const { point, normal } = perimeterPoint(rect, i / 40);
      const onEdge =
        point.x === rect.left || point.x === rect.left + rect.width || point.y === rect.top || point.y === rect.top + rect.height;
      expect(onEdge).toBe(true);
      // Un pas le long de la normale éloigne du centre : elle pointe vers l'extérieur.
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const before = Math.hypot(point.x - center.x, point.y - center.y);
      const after = Math.hypot(point.x + normal.x - center.x, point.y + normal.y - center.y);
      expect(after).toBeGreaterThan(before);
    }
  });

  it("les quatre bords sont couverts — pas de nuage en un seul point", () => {
    const sides = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(perimeterPoint(rect, i / 40).normal)));
    expect(sides.size).toBe(4);
  });

  it("le canvas laisse à la poussière la place de s'étaler autour de la carte", () => {
    const bounds = dustBounds({ rect });
    expect(bounds.left).toBeLessThan(rect.left - 50);
    expect(bounds.top).toBeLessThan(rect.top - 50);
    expect(bounds.left + bounds.width).toBeGreaterThan(rect.left + rect.width + 50);
    expect(bounds.top + bounds.height).toBeGreaterThan(rect.top + rect.height + 50);
  });
});
