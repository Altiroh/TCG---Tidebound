import type { CardInstance } from "@/game/cards/types";
import { dispatch } from "@/game/engine";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import { getShipDefinition, SHIP_DATABASE } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import { discardableHand } from "@/game/state/discard";
import type { EnvironmentState, ShipDefinition } from "@/game/environment/types";
import type { GameState, PlayerState } from "@/game/state/types";

let counter = 0;

/**
 * Enregistre un Navire FICTIF le temps d'un test — pour éprouver une
 * primitive de Navire qu'aucun Navire du roster ne porte plus (ex:
 * `directAttackWeakness`, depuis que Le Courlis a perdu Coque légère).
 * `SHIP_DATABASE` est typée en lecture seule pour le reste du projet.
 */
export function withTestShip<T>(ship: ShipDefinition, run: () => T): T {
  const table = SHIP_DATABASE as Map<string, ShipDefinition>;
  table.set(ship.id, ship);
  try {
    return run();
  } finally {
    table.delete(ship.id);
  }
}

/** Navire fictif à coque légère : +1 dégât par attaque directe subie. */
export const TEST_COQUE_LEGERE: ShipDefinition = {
  id: "test-coque-legere",
  name: "Coque légère (test)",
  startingAnchor: 26,
  reasonMax: 10,
  slotCount: 5,
  directAttackWeakness: 1,
};
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
  // 5 Slots), mais ni passif ni faiblesse. Le Canon de proue ne se
  // déclenche jamais tout seul : rien ne parasite un test qui mesure autre
  // chose.
  const p2 = testPlayer("p2", { shipId: "le-goliath" });
  return {
    id: "test-game",
    createdAt: 0,
    players: [p1, p2],
    // Le 2e tour de p1, pas le 1er : au tout premier tour de la partie, le
    // premier joueur ne peut pas attaquer (règle du 08/10/2026) — un cas
    // particulier que seuls les tests qui le visent doivent rencontrer.
    turnNumber: 3,
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
  const hand = discardableHand(state.players.find((p) => p.id === choice.playerId)!.hand, choice);
  return dispatch(state, {
    type: "resolveChoice",
    playerId: choice.playerId,
    choice: { discardInstanceIds: instanceIds ?? hand.slice(0, choice.count).map((card) => card.instanceId) },
  });
}

/**
 * Prêt à finir son tour : pas de fin de tour en Phase principale 1 (règle du
 * 08/10/2026). Les tests qui terminent un tour « tout de suite » passent par
 * ici : l'état est posé en Phase principale 2, sans rejouer la phase de
 * combat (ni ses déclencheurs) — exactement ce qu'ils faisaient avant.
 */
export function enFinDeTour(state: GameState): GameState {
  return state.phase === "mainPhase" ? { ...state, phase: "mainPhase2" } : state;
}
