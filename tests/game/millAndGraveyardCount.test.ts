import { describe, expect, it } from "vitest";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Primitives du 29/09/2026 (Test Verrier, Veillée) : `mill` envoie le haut
 * de la pioche au Cimetière ; `graveyardCount` compte un Cimetière.
 */

const context = { controllerId: "p1", turnNumber: 3 };

describe("effet mill", () => {
  it("envoie les N premières cartes de la pioche au Cimetière, dans l'ordre, et les inscrit au journal", () => {
    const [a, b, c] = [instance("tetard-fesse", "p1"), instance("ptite-fesse", "p1"), instance("murene-aveugle", "p1")];
    const state = testGameState({ players: [testPlayer("p1", { deck: [a, b, c] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const r = resolveEffect(state, { type: "mill", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }, context);
    const p1 = r.state.players[0]!;
    expect(p1.deck.map((x) => x.instanceId)).toEqual([c.instanceId]);
    expect(p1.graveyard.map((x) => x.instanceId)).toEqual([a.instanceId, b.instanceId]);
    expect(p1.hand).toHaveLength(0);
    expect((p1.graveyardArrivals ?? []).filter((x) => x.fromZone === "deck")).toHaveLength(2);
    expect(r.events.filter((e) => e.type === "CARD_MOVED" && e.fromZone === "deck" && e.toZone === "graveyard")).toHaveLength(2);
  });

  it("pioche trop courte : s'arrête sans Jugement de l'Océan", () => {
    const state = testGameState({ players: [testPlayer("p1", { deck: [instance("tetard-fesse", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const r = resolveEffect(state, { type: "mill", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 3 } }, context);
    expect(r.state.players[0]!.deck).toHaveLength(0);
    expect(r.state.players[0]!.graveyard).toHaveLength(1);
    expect(r.state.pendingOceanJudgment).toBeUndefined();
  });
});

describe("montant graveyardCount", () => {
  const cimetiere = [
    ...Array.from({ length: 5 }, () => instance("ptit-bout", "p1")),
    ...Array.from({ length: 3 }, () => instance("tetard-fesse", "p1")),
  ];
  const dommage = (amount: object) => {
    const state = testGameState({ players: [testPlayer("p1", { graveyard: cimetiere }), testPlayer("p2", { shipId: "le-goliath" })] });
    const r = resolveEffect(state, { type: "damage", target: { kind: "opponentPlayer" }, amount: amount as never }, context);
    return state.players[1]!.anchor - r.state.players[1]!.anchor;
  };

  it("compte une tranche par perCards cartes", () => {
    expect(dommage({ kind: "graveyardCount", perCards: 4 })).toBe(2);
  });
  it("ne compte que le sous-type demandé", () => {
    expect(dommage({ kind: "graveyardCount", subtype: "un-dead" })).toBe(5);
  });
  it("respecte le plafond", () => {
    expect(dommage({ kind: "graveyardCount", max: 3 })).toBe(3);
  });
  it("ne compte que les types de carte demandés", () => {
    // Le Cimetière de ce test ne contient que des unités (P'tit Bout, Têtard-Fesse).
    expect(dommage({ kind: "graveyardCount", cardTypes: ["structure"] })).toBe(0);
    expect(dommage({ kind: "graveyardCount", cardTypes: ["creature", "marin"] })).toBe(8);
  });
});
