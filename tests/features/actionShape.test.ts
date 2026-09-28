import { describe, expect, it } from "vitest";
import { hasSaneActionShape } from "@/features/matches/actionShape";

/** Un coup venu du navigateur doit avoir la FORME d'un coup avant d'atteindre le moteur. */
describe("hasSaneActionShape", () => {
  it("laisse passer les coups ordinaires", () => {
    expect(hasSaneActionShape({ type: "endTurn", playerId: "p1" })).toBe(true);
    expect(hasSaneActionShape({ type: "resolveChoice", playerId: "p1", healAllocation: [{ instanceId: "u1", amount: 2 }] })).toBe(true);
  });

  it("refuse NaN, l'infini, et les nombres déguisés", () => {
    expect(hasSaneActionShape({ type: "resolveChoice", healAllocation: [{ instanceId: "u1", amount: Number.NaN }] })).toBe(false);
    expect(hasSaneActionShape({ type: "playCard", boardIndex: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("refuse les charges démesurées", () => {
    expect(hasSaneActionShape({ type: "playCard", instanceId: "x".repeat(10_000) })).toBe(false);
    expect(hasSaneActionShape({ type: "playCard", targets: new Array(100_000).fill("u1") })).toBe(false);
    let deep: unknown = "fond";
    for (let i = 0; i < 20; i += 1) deep = { deep };
    expect(hasSaneActionShape(deep)).toBe(false);
  });

  it("refuse ce qui n'est pas un objet ordinaire", () => {
    expect(hasSaneActionShape(new Map())).toBe(false);
    expect(hasSaneActionShape({ when: new Date() })).toBe(false);
    expect(hasSaneActionShape({ fn: () => 1 })).toBe(false);
  });
});
