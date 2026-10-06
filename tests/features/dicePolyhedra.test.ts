import { describe, expect, it } from "vitest";
import { eulerMatrix, faceValues, multiply, placeFaces, restMatrix, rotate, slerp, type Mat4 } from "@/features/match/dice/polyhedra";

const DICE = [4, 6, 8] as const;
const SANS_TILT = { x: 0, y: 0 };

function det3(m: Mat4): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}

describe("dés en volume", () => {
  it("chaque dé porte chacune de ses valeurs une seule fois", () => {
    for (const die of DICE) expect([...faceValues(die)].sort((a, b) => a - b)).toEqual(Array.from({ length: die }, (_, i) => i + 1));
  });

  it("au repos, la face obtenue regarde le joueur, à l'endroit et sans miroir", () => {
    for (const die of DICE) {
      const faces = placeFaces(die, 100);
      for (const value of faceValues(die)) {
        const rest = restMatrix(die, value, SANS_TILT);
        expect(det3(rest)).toBeCloseTo(1, 6);
        const face = faces.find((f) => f.value === value)!;
        const n = rotate(rest, face.normal);
        expect(n[2]).toBeCloseTo(1, 6);
        // Tuile posée : son axe horizontal va vers la droite de l'écran, son axe vertical vers le bas.
        const pose = multiply(rest, face.matrix);
        expect(pose[0]).toBeGreaterThan(0.99);
        expect(pose[5]).toBeGreaterThan(0.99);
        // Aucune autre face ne fait face au joueur.
        for (const other of faces) if (other.value !== value) expect(rotate(rest, other.normal)[2]).toBeLessThan(0.95);
      }
    }
  });

  it("l'inclinaison laisse la face obtenue la plus visible", () => {
    for (const die of DICE) {
      const faces = placeFaces(die, 100);
      for (const value of faceValues(die)) {
        const rest = restMatrix(die, value, { x: -16, y: 20 });
        const best = faces.reduce((a, b) => (rotate(rest, a.normal)[2] >= rotate(rest, b.normal)[2] ? a : b));
        expect(best.value).toBe(value);
      }
    }
  });

  it("slerp va d'une rotation à l'autre", () => {
    const a = eulerMatrix(10, 20, 30);
    const b = restMatrix(6, 3, SANS_TILT);
    slerp(a, b, 0).slice(0, 11).forEach((x, i) => expect(x).toBeCloseTo(a[i]!, 6));
    slerp(a, b, 1).slice(0, 11).forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));
    expect(det3(slerp(a, b, 0.5))).toBeCloseTo(1, 6);
  });
});
