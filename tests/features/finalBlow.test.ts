import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game";
import type { GameState } from "@/game/state/types";
import { describeFinalBlow } from "@/features/match/finalBlow";
import { instance, testEnvironment, testGameState, testPlayer } from "../game/testHelpers";

const label = (id?: string) => (id === "p1" ? "Alti" : id === "p2" ? "le bot" : "?");

function table(p2Anchor: number): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    phase: "combatPhase",
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, board: [instance("destrier-du-ressac", "p1")] }),
      testPlayer("p2", { reason: 10, reasonMax: 10, anchor: p2Anchor }),
    ],
  });
}

describe("coup fatal — ce qui a fini la partie, en mots", () => {
  it("nomme l'attaquant et les dégâts du dernier coup", () => {
    const state = table(2);
    const attaquant = state.players[0].board[0]!;
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.status).toBe("finished");
    const blow = describeFinalBlow(r.state, label);
    expect(blow).toMatchObject({ title: "Coup fatal", loserId: "p2", struck: true });
    expect(blow?.amount).toBeGreaterThan(0);
    expect(blow?.line).toBe(`${getCardDefinition("destrier-du-ressac").name} frappe le Navire de le bot.`);
  });

  it("une partie en cours n'a pas de coup fatal", () => {
    expect(describeFinalBlow(table(20), label)).toBeNull();
  });

  it("un abandon se dit tel quel, sans coup porté", () => {
    const r = dispatch(table(20), { type: "concede", playerId: "p2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(describeFinalBlow(r.state, label)).toMatchObject({ title: "Abandon", struck: false, loserId: "p2" });
  });
});
