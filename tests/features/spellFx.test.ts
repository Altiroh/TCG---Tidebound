import { describe, expect, it } from "vitest";
import { arcControl, arcHeading, arcPoint, cometBounds, cubicBezier, FLIGHT_EASING, seededRandom, seedFrom, trajectoryFor } from "@/features/match/spellFx";

describe("spellFx — la géométrie des comètes dessinées", () => {
  const from = { x: 100, y: 500 };
  const to = { x: 700, y: 120 };

  it("l'arc part de l'orbe et arrive sur la cible", () => {
    const control = arcControl(from, to);
    expect(arcPoint(from, control, to, 0)).toEqual(from);
    expect(arcPoint(from, control, to, 1)).toEqual(to);
  });

  it("l'arc bombe toujours vers le haut de l'écran, dans un sens comme dans l'autre", () => {
    for (const [a, b] of [
      [from, to],
      [to, from],
      [{ x: 400, y: 600 }, { x: 400, y: 100 }],
    ] as const) {
      const control = arcControl(a, b);
      expect(control.y).toBeLessThanOrEqual((a.y + b.y) / 2);
    }
  });

  it("la tête regarde dans le sens du vol", () => {
    const control = arcControl(from, to);
    const heading = arcHeading(from, control, to, 0.5);
    const ahead = arcPoint(from, control, to, 0.51);
    const here = arcPoint(from, control, to, 0.5);
    expect(Math.cos(heading) * (ahead.x - here.x) + Math.sin(heading) * (ahead.y - here.y)).toBeGreaterThan(0);
  });

  it("garde le rythme de vol des autres projectiles (courbe CSS)", () => {
    expect(FLIGHT_EASING(0)).toBe(0);
    expect(FLIGHT_EASING(1)).toBe(1);
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 3);
    // Lente au départ, rapide au milieu.
    expect(FLIGHT_EASING(0.2)).toBeLessThan(0.2);
    for (let t = 0.05; t < 1; t += 0.05) expect(FLIGHT_EASING(t)).toBeGreaterThanOrEqual(FLIGHT_EASING(t - 0.05));
  });

  it("le canvas couvre tout l'arc, lueurs comprises", () => {
    const bounds = cometBounds({ from, to, size: 140, kind: "attack", flightMs: 400, forward: -1 });
    const path = trajectoryFor(from, to, -1);
    for (const point of [from, to, ...Array.from({ length: 11 }, (_, i) => path.at(i / 10))]) {
      expect(point.x).toBeGreaterThan(bounds.left);
      expect(point.x).toBeLessThan(bounds.left + bounds.width);
      expect(point.y).toBeGreaterThan(bounds.top);
      expect(point.y).toBeLessThan(bounds.top + bounds.height);
    }
  });

  it("une même comète se dessine pareil d'une image à l'autre, deux comètes diffèrent", () => {
    const a = seededRandom(seedFrom(1, 2, 3, 4));
    const b = seededRandom(seedFrom(1, 2, 3, 4));
    const c = seededRandom(seedFrom(1, 2, 3, 5));
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  describe("soin sur un allié : le tir part devant, s'incurve et revient derrière", () => {
    // Une carte de son propre camp (en bas de l'écran) : « devant », c'est vers le haut (−1).
    const caster = { x: 300, y: 560 };
    const ally = { x: 520, y: 600 };

    it("une cible en face reçoit l'arc simple", () => {
      const enemy = { x: 500, y: 150 };
      const path = trajectoryFor(caster, enemy, -1);
      expect(path.hull).toHaveLength(3);
      expect(path.at(1)).toEqual(enemy);
    });

    it("un allié de la même rangée reçoit le boomerang : il passe loin devant avant de retomber", () => {
      const path = trajectoryFor(caster, ally, -1);
      expect(path.hull).toHaveLength(4);
      expect(path.at(0)).toEqual(caster);
      const end = path.at(1);
      expect(end.x).toBeCloseTo(ally.x, 6);
      expect(end.y).toBeCloseTo(ally.y, 6);
      // Au milieu du vol, la comète est DEVANT (au-dessus) des deux cartes.
      expect(path.at(0.5).y).toBeLessThan(Math.min(caster.y, ally.y) - 80);
      // Elle part vers l'avant…
      expect(Math.sin(path.heading(0))).toBeLessThan(0);
      // … et revient sur l'allié depuis l'avant, en redescendant.
      expect(Math.sin(path.heading(1))).toBeGreaterThan(0);
    });

    it("même chose depuis l'autre camp, en miroir", () => {
      const path = trajectoryFor({ x: 300, y: 160 }, { x: 520, y: 150 }, 1);
      expect(path.at(0.5).y).toBeGreaterThan(160 + 80);
    });

    it("sur soi-même, la boucle s'ouvre sur le côté au lieu de faire un aller-retour sur place", () => {
      const path = trajectoryFor(caster, { x: caster.x + 5, y: caster.y + 40 }, -1);
      const xs = Array.from({ length: 21 }, (_, i) => path.at(i / 20).x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60);
    });
  });
});
