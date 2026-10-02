import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * L'Errant — Cap sûr (décision de design du 29/09/2026) :
 * « La première fois de la partie que votre Raison tombe à 0 ou moins,
 *   récupérez la Raison perdue pendant ce tour. »
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

const reasonOf = (state: GameState) => state.players[0]!.reason;

function table(shipId = "lerrant", reason = 4): { state: GameState; matelot: string; murene: string; autre: string } {
  const matelot = instance("matelot-du-sans-nom", "p1"); // coût 3
  const murene = instance("murene-aveugle", "p1"); // coût 2
  const autre = instance("murene-aveugle", "p1");
  const state = testGameState({
    players: [
      testPlayer("p1", { shipId, reason, reasonMax: 10, hand: [matelot, murene, autre] }),
      testPlayer("p2", { shipId: "le-goliath" }),
    ],
  });
  return { state, matelot: matelot.instanceId, murene: murene.instanceId, autre: autre.instanceId };
}

describe("L'Errant — Cap sûr", () => {
  it("la Raison qui tombe à 0 ou moins revient à ce qu'elle était avant les pertes du tour", () => {
    const { state, matelot, murene } = table();
    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: matelot });
    ok(first);
    expect(reasonOf(first.state)).toBe(1); // 4 - 3 : pas encore à 0

    const second = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: murene });
    ok(second);
    // 1 - 2 = -1, puis les 5 perdues ce tour reviennent : 4.
    expect(reasonOf(second.state)).toBe(4);
    expect(second.events.some((e) => e.type === "REASON_CHANGED" && e.playerId === "p1" && e.delta === 5)).toBe(true);
  });

  it("une seule fois par partie", () => {
    const { state, matelot, murene, autre } = table();
    let current = state;
    for (const id of [matelot, murene]) {
      const r = dispatch(current, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      current = r.state;
    }
    expect(reasonOf(current)).toBe(4);
    const drained: GameState = {
      ...current,
      players: current.players.map((p) => (p.id === "p1" ? { ...p, reason: 1 } : p)) as GameState["players"],
    };
    const again = dispatch(drained, { type: "playCard", playerId: "p1", instanceId: autre });
    ok(again);
    expect(reasonOf(again.state)).toBe(-1);
  });

  it("jamais au-delà de la Raison maximale", () => {
    const { state, matelot } = table("lerrant", 3);
    const capped: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, reasonMax: 2, reasonLostThisTurn: { turnNumber: state.turnNumber, amount: 6 } } : p)) as GameState["players"],
    };
    const r = dispatch(capped, { type: "playCard", playerId: "p1", instanceId: matelot });
    ok(r);
    expect(reasonOf(r.state)).toBe(2);
  });

  it("un autre Navire ne rend rien", () => {
    const { state, matelot, murene } = table("le-brise-lames");
    let current = state;
    for (const id of [matelot, murene]) {
      const r = dispatch(current, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      current = r.state;
    }
    expect(reasonOf(current)).toBe(-1);
  });
});
