import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/match/AttackImpactLayer", () => ({ findElement: () => null }));
vi.mock("@/features/match/cardFx", () => ({ showGuard: () => {} }));

const { blockingGuardsFor, interceptBlockedAttack } = await import("@/features/match/guardBlock");
const { instance, testGameState, testPlayer } = await import("@/tests/game/testHelpers");

describe("guardBlock — la Garde s'interpose avant que l'attaque ne parte", () => {
  const attaquant = instance("marin-des-jetees", "p1");
  const garde = instance("mouette-du-brise-lames", "p2");
  const state = {
    ...testGameState({ players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { board: [garde] })] }),
    phase: "combatPhase" as const,
    activePlayerId: "p1",
    turnNumber: 3,
  };

  it("viser le Navire adverse : la Garde se montre et l'attaque n'est pas envoyée", () => {
    const action = { type: "attack" as const, playerId: "p1", attackerInstanceId: attaquant.instanceId };
    expect(blockingGuardsFor(state, action)).toEqual([garde.instanceId]);
    expect(interceptBlockedAttack(state, action)).toBe(true);
  });

  it("viser la Garde : rien ne s'interpose, le coup part", () => {
    const action = { type: "attack" as const, playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: garde.instanceId };
    expect(interceptBlockedAttack(state, action)).toBe(false);
  });

  it("hors Phase de combat, ce n'est pas la Garde qui refuse : elle ne se montre pas", () => {
    const action = { type: "attack" as const, playerId: "p1", attackerInstanceId: attaquant.instanceId };
    expect(blockingGuardsFor({ ...state, phase: "mainPhase" }, action)).toEqual([]);
  });

  it("une autre action n'est jamais interceptée", () => {
    expect(interceptBlockedAttack(state, { type: "endTurn", playerId: "p1" })).toBe(false);
  });
});
