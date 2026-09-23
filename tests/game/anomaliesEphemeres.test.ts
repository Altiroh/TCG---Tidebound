/**
 * Une Anomalie sans durée ni capacité se résout et part au Cimetière : elle
 * n'a plus rien à faire en jeu (retour du 23/09 — Par-dessus Bord ! restait
 * posée sur le plateau après usage, et y occupait un Slot).
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";

describe("Anomalies à résolution immédiate", () => {
  it("Par-dessus Bord ! renvoie sa cible, puis part au Cimetière", () => {
    const anomalie = instance("par-dessus-bord", "p1");
    const cible = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [anomalie], reason: 10 }), testPlayer("p2", { board: [cible] })],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: anomalie.instanceId,
      targetInstanceId: cible.instanceId,
    });
    if (!result.ok) throw new Error(result.error);

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    const p2 = result.state.players.find((p) => p.id === "p2")!;
    expect(p2.hand.map((c) => c.cardId)).toContain("marin-des-jetees");
    expect(p2.board).toHaveLength(0);
    expect(p1.board.map((c) => c.instanceId)).not.toContain(anomalie.instanceId);
    expect(p1.graveyard.map((c) => c.instanceId)).toContain(anomalie.instanceId);
  });
});
