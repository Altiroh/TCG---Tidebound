import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import { createSeed, shuffle } from "@/game/rng";
import { startingReasonCap } from "@/game/state/reason";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";
import type { DeckList } from "@/game/cards/decks/types";

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
  /**
   * Types de cartes à GARANTIR dans la main de départ du joueur 1, dans
   * cet ordre de priorité (`["creature", "objet", "objet"]` : au moins une
   * unité et deux Objets).
   *
   * N'invente jamais de carte : les exemplaires sont remontés depuis le
   * deck mélangé du joueur, et le reste de la main est complété
   * normalement. Une demande impossible (le deck ne contient pas assez de
   * ce type) est satisfaite partiellement plutôt que de lever — une partie
   * doit pouvoir démarrer.
   *
   * Sert au TUTORIEL, dont chaque étape demande un geste précis : sans
   * cette garantie, une main d'ouverture malchanceuse rend une étape
   * infranchissable et bloque le joueur sans explication.
   */
  guaranteedOpeningTypes?: readonly string[];
}

/**
 * Construit l'état initial d'une partie : mélange les deux decks,
 * distribue les mains de départ, installe le Navire et l'Ancrage de
 * chaque joueur, initialise la Marée (Calme, orientation Montante — cadrage
 * 2026-09-10), et place le premier joueur en priorité. Aucune mutation
 * d'état externe — retourne un `GameState` entièrement neuf.
 */
/**
 * Sépare main de départ et pioche, en remontant d'abord un exemplaire de
 * chaque type garanti.
 *
 * L'ordre du deck est par ailleurs préservé : ce n'est pas un second
 * mélange, juste une extraction. Sans type garanti, le comportement est
 * exactement l'ancien découpage.
 */
function dealOpeningHand(
  deck: readonly CardInstance[],
  handSize: number,
  guaranteedTypes: readonly string[] | undefined
): { hand: CardInstance[]; rest: CardInstance[] } {
  if (!guaranteedTypes?.length) {
    return { hand: [...deck.slice(0, handSize)], rest: [...deck.slice(handSize)] };
  }

  const remaining = [...deck];
  const hand: CardInstance[] = [];

  for (const wanted of guaranteedTypes) {
    if (hand.length >= handSize) break;
    const index = remaining.findIndex((card) => {
      try {
        return getCardDefinition(card.cardId).type === wanted;
      } catch {
        return false;
      }
    });
    // Type absent du deck : on n'insiste pas, la main se complète au hasard.
    if (index === -1) continue;
    hand.push(...remaining.splice(index, 1));
  }

  while (hand.length < handSize && remaining.length > 0) hand.push(remaining.shift()!);

  return { hand, rest: remaining };
}

export function createGameState(input: CreateGameStateInput): GameState {
  const rngState = createSeed(input.seed);

  const player1Deck = buildDeckInstances(input.player1.deck, input.player1.id);
  const player2Deck = buildDeckInstances(input.player2.deck, input.player2.id);

  const shuffled1 = shuffle(player1Deck, rngState);
  const shuffled2 = shuffle(player2Deck, shuffled1.nextState);

  const dealt1 = dealOpeningHand(shuffled1.value, RULES.STARTING_HAND_SIZE, input.guaranteedOpeningTypes);
  const player1Hand = dealt1.hand;
  const player1Remaining = dealt1.rest;

  // Le second joueur pioche une carte supplémentaire pour compenser le
  // désavantage de ne pas jouer en premier.
  const player2HandSize = RULES.STARTING_HAND_SIZE + RULES.SECOND_PLAYER_EXTRA_CARD;
  const player2Hand = shuffled2.value.slice(0, player2HandSize);
  const player2Remaining = shuffled2.value.slice(player2HandSize);

  const ship1 = getShipDefinition(input.player1.deck.shipId);
  const ship2 = getShipDefinition(input.player2.deck.shipId);

  // Courbe de début de partie : chaque joueur commence au plafond de son 1er
  // tour (25 % de sa Raison max, arrondi au supérieur), relevé ensuite au
  // début de ses tours suivants (`game/actions/endTurn.ts`).
  const cap1 = startingReasonCap(ship1.reasonMax, 1) ?? ship1.reasonMax;
  const cap2 = startingReasonCap(ship2.reasonMax, 1) ?? ship2.reasonMax;

  const player1: PlayerState = {
    id: input.player1.id,
    shipId: ship1.id,
    anchor: ship1.startingAnchor,
    reason: cap1,
    reasonMax: ship1.reasonMax,
    reasonCap: cap1,
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
    reason: cap2,
    reasonMax: ship2.reasonMax,
    reasonCap: cap2,
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
