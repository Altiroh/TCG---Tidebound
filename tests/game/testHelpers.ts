import type { CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import type { EnvironmentState } from "@/game/environment/types";
import type { GameState, PlayerState } from "@/game/state/types";

let counter = 0;
export function instance(cardId: string, ownerId: string, overrides: Partial<CardInstance> = {}): CardInstance {
  counter += 1;
  return {
    instanceId: `test_${counter}`,
    cardId,
    ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    ...overrides,
  };
}

/** Navire par défaut des tests : Le Brise-Lames (24 Ancrage, 8 Raison, 6 emplacements). */
export function testPlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  const shipId = overrides.shipId ?? "le-brise-lames";
  const ship = getShipDefinition(shipId);
  return {
    id,
    shipId,
    anchor: ship.startingAnchor,
    reason: 10,
    reasonMax: 10,
    hasUsedMainActionThisTurn: false,
    deck: [],
    hand: [],
    board: [],
    graveyard: [],
    statusFlags: [],
    ...overrides,
  };
}

export function testEnvironment(overrides: Partial<EnvironmentState> = {}): EnvironmentState {
  return {
    tideState: "calme",
    tideRemainingTurns: RULES.TIDE_STATE_DURATION.calme,
    tideOrientation: "montante",
    tideIntensity: RULES.TIDE_BASE_INTENSITY,
    pendingTideModifiers: [],
    ...overrides,
  };
}

export function testGameState(overrides: Partial<GameState> = {}): GameState {
  const p1 = testPlayer("p1");
  const p2 = testPlayer("p2", { shipId: "lerrant" });
  return {
    id: "test-game",
    createdAt: 0,
    players: [p1, p2],
    turnNumber: 1,
    activePlayerId: "p1",
    priorityPlayerId: "p1",
    phase: "mainPhase",
    rngState: 12345,
    environment: testEnvironment(),
    eventLog: [],
    status: "active",
    ...overrides,
  };
}
