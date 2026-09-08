import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { WATER_POOL, getWaterDefinition } from "@/game/environment/waterData";
import { RULES } from "@/game/rules/constants";
import { createSeed, nextInt, shuffle } from "@/game/rng";
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
  /**
   * Eaux de départ ; par défaut tirées aléatoirement dans `WATER_POOL`
   * (les Eaux ne sont jamais choisies par un joueur — cadrage section 25).
   */
  startingWaterId?: string;
  /** Graine RNG optionnelle, pour des parties reproductibles en test. */
  seed?: number;
}

/**
 * Construit l'état initial d'une partie : mélange les deux decks,
 * distribue les mains de départ, installe le Navire et l'Ancrage de
 * chaque joueur, initialise la Marée et les Eaux, et place le premier
 * joueur en priorité. Aucune mutation d'état externe — retourne un
 * `GameState` entièrement neuf.
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

  // Les deux joueurs commencent avec leur Raison au maximum (pas de rampe
  // de ressource asymétrique comme dans un modèle de mana classique — la
  // Raison est LA ressource, cadrage "Navires, Slots et Raison").
  const player1: PlayerState = {
    id: input.player1.id,
    shipId: ship1.id,
    anchor: ship1.startingAnchor,
    reason: ship1.reasonMax,
    reasonMax: ship1.reasonMax,
    hasUsedMainActionThisTurn: false,
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
    reason: ship2.reasonMax,
    reasonMax: ship2.reasonMax,
    hasUsedMainActionThisTurn: false,
    deck: player2Remaining,
    hand: player2Hand,
    board: [],
    graveyard: [],
    statusFlags: [],
  };

  let startingWaterId = input.startingWaterId;
  let rngAfterWater = shuffled2.nextState;
  if (!startingWaterId) {
    const draw = nextInt(rngAfterWater, WATER_POOL.length);
    startingWaterId = WATER_POOL[draw.value]!.id;
    rngAfterWater = draw.nextState;
  }
  const startingWater = getWaterDefinition(startingWaterId);

  return {
    id: input.gameId,
    createdAt: Date.now(),
    players: [player1, player2],
    turnNumber: 1,
    activePlayerId: player1.id,
    priorityPlayerId: player1.id,
    phase: "mainPhase",
    rngState: rngAfterWater,
    environment: {
      tideState: "calme",
      tideRemainingTurns: RULES.TIDE_STATE_DURATION.calme,
      tideIntensity: RULES.TIDE_BASE_INTENSITY,
      pendingTideModifiers: [],
      currentWaterId: startingWaterId,
      waterRemainingTurns: startingWater.duration,
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
