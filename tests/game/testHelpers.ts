import type { CardInstance } from "@/game/cards/types";
import { dispatch } from "@/game/engine";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
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

/** Navire par défaut des tests : Le Brise-Lames (36 Ancrage, 8 Raison, 6 emplacements). */
export function testPlayer(id: string, overrides: Partial<PlayerState> = {}): PlayerState {
  const shipId = overrides.shipId ?? "le-brise-lames";
  const ship = getShipDefinition(shipId);
  return {
    id,
    shipId,
    anchor: ship.startingAnchor,
    reason: 10,
    reasonMax: 10,
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
  // Le Goliath en face : même gabarit que L'Errant (30 Ancrage, 10 Raison,
  // 5 Slots), mais ni passif ni faiblesse — et surtout aucune capacité de
  // FENÊTRE. Depuis que Changer de cap et Virage court s'activent pendant
  // l'annonce d'une Marée, un Navire qui en porte une ouvre une fenêtre à
  // chaque changement d'état : légitime en partie, parasite dans un test
  // qui mesure autre chose. Le Canon de proue, lui, ne se déclenche jamais
  // tout seul.
  const p2 = testPlayer("p2", { shipId: "le-goliath" });
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

/**
 * Réactions facultatives actuellement proposées au joueur que la fenêtre
 * attend. Recalculées et non lues d'un cache : c'est ce que fait le moteur.
 */
export function pendingCandidates(state: GameState) {
  const pending = state.pendingReaction;
  if (!pending) return [];
  return eligibleCandidatesFor(state, pending.events, pending.awaitingPlayerId, pending.turnNumber, pending.usedCandidateKeys);
}

/**
 * Active la réaction facultative de `cardId` — le geste que le joueur ferait.
 * Échoue bruyamment si la fenêtre ne la propose pas : un effet qu'on croit
 * déclenché mais qui n'est jamais proposé est exactement le défaut que ces
 * tests cherchent.
 */
export function activateReactionFor(state: GameState, cardId: string, targetInstanceId?: string) {
  const pending = state.pendingReaction;
  if (!pending) throw new Error(`Aucune fenêtre de réaction ouverte pour ${cardId}.`);
  const candidate = pendingCandidates(state).find((c) => c.cardId === cardId);
  if (!candidate) throw new Error(`${cardId} n'est pas proposée dans la fenêtre de réaction.`);
  return dispatch(state, {
    type: "activateReaction",
    playerId: pending.awaitingPlayerId,
    sourceInstanceId: candidate.sourceInstanceId,
    abilityIndex: candidate.abilityIndex,
    ...(targetInstanceId ? { targetInstanceId } : {}),
  });
}

/**
 * Répond à un choix de défausse ouvert par un effet — le geste que le joueur
 * ferait. Sans argument, il désigne le DÉBUT de sa main : c'est ce que le
 * moteur faisait d'office avant que le choix existe, ce qui garde les
 * anciens tests comparables.
 *
 * Échoue bruyamment si aucun choix n'attend : un effet qu'on croit résolu
 * mais qui attend encore une réponse est exactement le défaut que ces tests
 * cherchent.
 */
export function answerHandDiscard(state: GameState, instanceIds?: string[]) {
  const choice = state.pendingChoice;
  if (choice?.kind !== "handDiscard") throw new Error("Aucune défausse en attente de réponse.");
  const hand = state.players.find((p) => p.id === choice.playerId)!.hand;
  return dispatch(state, {
    type: "resolveChoice",
    playerId: choice.playerId,
    choice: { discardInstanceIds: instanceIds ?? hand.slice(0, choice.count).map((card) => card.instanceId) },
  });
}
