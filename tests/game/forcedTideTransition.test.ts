import { describe, expect, it } from "vitest";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { applyTideTurnEffects } from "@/game/environment/resolveEnvironment";
import { STATUS_MALADE } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Transitions de Marée FORCÉES par une carte : le choc d'entrée ou de
 * sortie doit s'y appliquer comme au tick naturel. Constaté le 29/09/2026 :
 * une descente forcée en Abysses n'ôtait pas la Raison max, la sortie
 * naturelle la rendait quand même — +2 de Raison max permanents.
 */

const context = { controllerId: "p1", turnNumber: 3 };

function enTempete(): GameState {
  return testGameState({ environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1 }) });
}

const reasonMaxOf = (state: GameState) => state.players.map((p) => p.reasonMax);
const anchorOf = (state: GameState) => state.players.map((p) => p.anchor);

describe("Marée forcée — choc de transition", () => {
  it("une descente forcée en Abysses ôte la Raison max et l'Ancrage d'entrée", () => {
    const before = enTempete();
    const after = resolveEffect(before, { type: "tideForceJumpToAbysses", target: { kind: "allPlayers" } }, context).state;

    expect(after.environment.tideState).toBe("abysses");
    expect(reasonMaxOf(after)).toEqual(reasonMaxOf(before).map((m) => m - RULES.ABYSSES_REASON_MAX_PENALTY));
    for (const [i, anchor] of anchorOf(after).entries()) expect(anchor).toBeLessThan(anchorOf(before)[i]!);
  });

  it("descente forcée puis sortie NATURELLE : la Raison max revient à l'identique, pas au-dessus", () => {
    const before = enTempete();
    const forced = resolveEffect(before, { type: "tideForceJumpToAbysses", target: { kind: "allPlayers" } }, context).state;
    const exited = applyTideTurnEffects(forced, "abysses", "tempete", 1, 4).state;

    expect(reasonMaxOf(exited)).toEqual(reasonMaxOf(before));
  });

  it("entrée naturelle puis sortie FORCÉE : la Raison max est rendue", () => {
    const before = enTempete();
    const entered = applyTideTurnEffects(before, "tempete", "abysses", 1, 3).state;
    const inAbysses: GameState = { ...entered, environment: { ...entered.environment, tideState: "abysses" } };
    const retreated = resolveEffect(inAbysses, { type: "tideForceRetreat", target: { kind: "allPlayers" } }, context).state;

    expect(retreated.environment.tideState).not.toBe("abysses");
    expect(reasonMaxOf(retreated)).toEqual(reasonMaxOf(before));
  });

  it("quitter la Houle de force retire le statut MALADE", () => {
    const malade = instance("tetard-fesse", "p1", { statuses: [STATUS_MALADE] });
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 2 }),
      players: [testPlayer("p1", { board: [malade] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = resolveEffect(state, { type: "tideForceAdvance", target: { kind: "allPlayers" } }, context).state;

    expect(after.environment.tideState).not.toBe("houle");
    expect(after.players[0]!.board[0]!.statuses ?? []).not.toContain(STATUS_MALADE);
  });
});
