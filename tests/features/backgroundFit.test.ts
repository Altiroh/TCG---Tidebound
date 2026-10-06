import { describe, expect, it } from "vitest";
import { BACKGROUND_H, BACKGROUND_W, fitBackground, unionRect } from "@/features/match/table/backgroundFit";

/**
 * Cadrage du fond : la zone faite pour le plateau (le tapis, l'enclos de
 * murs) englobe l'interface mesurée, et le fond couvre toujours la vue.
 */
const vue = { width: 1280, height: 720 };
// Rangées + bande centrale + colonne de droite, mesurées au labo en 1280 × 720.
const ui = { left: 18, top: 121, right: 1262, bottom: 600 };
const tapis = [55 / 1672, 162 / 941, 1597 / 1672, 803 / 941] as const;

describe("le fond se cale sur l'interface", () => {
  const box = fitBackground(vue, ui, tapis, 9);
  const zone = {
    left: box.left + tapis[0] * box.width,
    top: box.top + tapis[1] * box.height,
    right: box.left + tapis[2] * box.width,
    bottom: box.top + tapis[3] * box.height,
  };

  it("la zone du fond englobe l'interface et sa marge", () => {
    expect(zone.left).toBeLessThanOrEqual(ui.left - 9 + 0.5);
    expect(zone.right).toBeGreaterThanOrEqual(ui.right + 9 - 0.5);
    expect(zone.top).toBeLessThanOrEqual(ui.top);
    expect(zone.bottom).toBeGreaterThanOrEqual(ui.bottom);
  });

  it("le fond couvre toute la vue, sans en découvrir un bord", () => {
    expect(box.left).toBeLessThanOrEqual(0);
    expect(box.top).toBeLessThanOrEqual(0);
    expect(box.left + box.width).toBeGreaterThanOrEqual(vue.width);
    expect(box.top + box.height).toBeGreaterThanOrEqual(vue.height);
    expect(box.width / box.height).toBeCloseTo(BACKGROUND_W / BACKGROUND_H);
  });

  it("une interface toute petite garde le simple « cover »", () => {
    const petit = fitBackground(vue, { left: 600, top: 340, right: 680, bottom: 380 }, tapis, 0);
    expect(petit.width).toBeCloseTo(Math.max(vue.width, (vue.height * BACKGROUND_W) / BACKGROUND_H));
  });

  it("l'union ignore les zones vides", () => {
    expect(unionRect([{ left: 0, top: 0, right: 0, bottom: 0 }])).toBeNull();
    expect(unionRect([ui, { left: 5, top: 200, right: 10, bottom: 210 }])).toEqual({ ...ui, left: 5 });
  });
});
