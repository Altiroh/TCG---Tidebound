import { describe, expect, it } from "vitest";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameState } from "@/game/state/types";
import { testGameState, testPlayer } from "./testHelpers";

/**
 * `conditionOpponentReasonAtMost` — miroir de `conditionControllerReasonAtMost`,
 * lu sur l'ADVERSAIRE du contrôleur (29/09/2026, mesure d'À bout de Raison :
 * « s'il a alors 0 Raison ou moins, il perd aussi 1 Ancrage »).
 */

const dette: EffectDefinition = {
  type: "damage",
  target: { kind: "opponentPlayer" },
  amount: { kind: "flat", value: 1 },
  conditionOpponentReasonAtMost: 0,
};

function avecRaisonAdverse(reason: number): GameState {
  return testGameState({ players: [testPlayer("p1"), testPlayer("p2", { shipId: "le-goliath", reason })] });
}

describe("condition : Raison de l'adversaire au plus N", () => {
  it("s'applique quand l'adversaire est à 0 ou en dette", () => {
    for (const reason of [0, -2]) {
      const state = avecRaisonAdverse(reason);
      const after = resolveEffect(state, dette, { controllerId: "p1", turnNumber: 1 }).state;
      expect(after.players[1]!.anchor).toBe(state.players[1]!.anchor - 1);
    }
  });

  it("ne s'applique pas au-dessus du plafond", () => {
    const state = avecRaisonAdverse(1);
    const after = resolveEffect(state, dette, { controllerId: "p1", turnNumber: 1 }).state;
    expect(after.players[1]!.anchor).toBe(state.players[1]!.anchor);
  });

  it("placée après une perte de Raison, elle lit la Raison que cette perte laisse", () => {
    const state = avecRaisonAdverse(1);
    let current = resolveEffect(state, { type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } }, { controllerId: "p1", turnNumber: 1 }).state;
    current = resolveEffect(current, dette, { controllerId: "p1", turnNumber: 1 }).state;
    expect(current.players[1]!.anchor).toBe(state.players[1]!.anchor - 1);
  });
});
