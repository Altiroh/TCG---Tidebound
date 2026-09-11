import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import { createSeed, shuffle } from "@/game/rng";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";
import type { DeckList } from "@/game/cards/decks/preconstructed";

let instanceCounter = 0;
function createInstanceId(): string {
  instanceCounter += 1;
  return `inst_${instanceCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildDeckInstances(deck: DeckList, ownerId: PlayerId): CardInstance[] {
  return deck.cardIds.map((cardId) => {
    getCardDefinition(cardId); // valide que la carte existe
    return {
      instanceId: createInstanceId(),
      cardId,
      ownerId,
      damageMarked: 0,
      modifiers: [],
      summoningSick: false,
      hasAttackedThisTurn: false,
    };
  });
}

export interface CreateGameStateInput {
  gameId: string;
  player1: { id: PlayerId; deck: DeckList };
  player2: { id: PlayerId; deck: DeckList };
  /** Graine RNG optionnelle, pour des parties reproductibles en test. */
  seed?: number;
}

/**
 * Construit l'état initial d'une partie : mélange les deux decks,
 * distribue les mains de départ, installe le Navire et l'Ancrage de
 * chaque joueur, initialise la Marée (Calme, orientation Montante — cadrage
 * 2026-09-10), et place le premier joueur en priorité. Aucune mutation
 * d'état externe — retourne un `GameState` entièrement neuf.
 */
export function createGameState(input: CreateGameStateInput): GameState {
  const rngState = createSeed(input.seed);

  const player1Deck = buildDeckInstances(input.player1.deck, input.player1.id);
  const player2Deck = buildDeckInstances(input.player2.deck, input.player2.id);

  const shuffled1 = shuffle(player1Deck, rngState);
  const shuffled2 = shuffle(player2Deck, shuffled1.nextState);

  const player1Hand = shuffled1.value.slice(0, RULES.STARTING_HAND_SIZE);
  const player1Remaining = shuffled1.value.slice(RULES.STARTING_HAND_SIZE);

  // Le second joueur pioche une carte supplémentaire pour compenser le
  // désavantage de ne pas jouer en premier.
  const player2HandSize = RULES.STARTING_HAND_SIZE + RULES.SECOND_PLAYER_EXTRA_CARD;
  const player2Hand = shuffled2.value.slice(0, player2HandSize);
  const player2Remaining = shuffled2.value.slice(player2HandSize);

  const ship1 = getShipDefinition(input.player1.deck.shipId);
  const ship2 = getShipDefinition(input.player2.deck.shipId);

  // Les deux joueurs commencent à 50% de leur Raison maximale, pas au
  // maximum (Notion "Moteur de partie — déroulement, Raison & chaînes
  // d'effets", "Principes déjà retenus", verrouillage du 2026-09-10).
  const startingReason = (reasonMax: number) => Math.floor(reasonMax * RULES.STARTING_REASON_RATIO);

  const player1: PlayerState = {
    id: input.player1.id,
    shipId: ship1.id,
    anchor: ship1.startingAnchor,
    reason: startingReason(ship1.reasonMax),
    reasonMax: ship1.reasonMax,
    deck: player1Remaining,
    hand: player1Hand,
    board: [],
    graveyard: [],
    statusFlags: [],
  };

  const player2: PlayerState = {
    id: input.player2.id,
    shipId: ship2.id,
    anchor: ship2.startingAnchor,
    reason: startingReason(ship2.reasonMax),
    reasonMax: ship2.reasonMax,
    deck: player2Remaining,
    hand: player2Hand,
    board: [],
    graveyard: [],
    statusFlags: [],
  };

  return {
    id: input.gameId,
    createdAt: Date.now(),
    players: [player1, player2],
    turnNumber: 1,
    activePlayerId: player1.id,
    priorityPlayerId: player1.id,
    phase: "mainPhase",
    rngState: shuffled2.nextState,
    environment: {
      tideState: "calme",
      tideRemainingTurns: RULES.TIDE_STATE_DURATION.calme,
      tideOrientation: "montante",
      tideIntensity: RULES.TIDE_BASE_INTENSITY,
      pendingTideModifiers: [],
    },
    eventLog: [
      {
        type: "GAME_STARTED",
        turnNumber: 1,
        timestamp: Date.now(),
      },
      {
        type: "TURN_STARTED",
        turnNumber: 1,
        timestamp: Date.now(),
        playerId: player1.id,
      },
    ],
    status: "active",
  };
}
