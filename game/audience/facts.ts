import { getCardDefinition } from "@/game/cards/sets/core";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState, PlayerId } from "@/game/state/types";
import type { MatchFacts } from "@/game/audience/types";
import { readMoments } from "@/game/audience/moments";

function startingAnchorOf(shipId: string | undefined): number {
  try {
    return shipId ? getShipDefinition(shipId).startingAnchor : 20;
  } catch {
    return 20;
  }
}

/**
 * Relève les faits d'une partie pour le joueur `playerId` — UNE passe sur
 * le journal, que tous les analyseurs partagent.
 */
export function readMatchFacts(state: GameState, playerId: PlayerId): MatchFacts {
  const me = state.players.find((player) => player.id === playerId);
  const opponent = state.players.find((player) => player.id !== playerId);
  const startingAnchor = startingAnchorOf(me?.shipId);
  const opponentStartingAnchor = startingAnchorOf(opponent?.shipId);

  let myAnchor = startingAnchor;
  let theirAnchor = opponentStartingAnchor;
  let lowestAnchor = startingAnchor;
  let leader = 0;
  let leadChanges = 0;
  let cardsPlayed = 0;
  const distinct = new Set<string>();
  const types = new Set<string>();
  let attacks = 0;
  let directAttacks = 0;
  let reactions = 0;
  let shipAbilities = 0;
  let tideManipulations = 0;
  let timeouts = 0;
  let idleTurns = 0;
  let deraisons = 0;
  let conceded = false;
  let actedThisTurn = false;

  for (const event of state.eventLog) {
    switch (event.type) {
      case "PLAY_CARD":
        if (event.playerId !== playerId) break;
        cardsPlayed += 1;
        actedThisTurn = true;
        distinct.add(event.cardId);
        try {
          types.add(getCardDefinition(event.cardId).type);
        } catch {
          // Carte inconnue du catalogue : elle compte, sans type.
        }
        break;
      case "ATTACK":
        if (event.playerId !== playerId) break;
        attacks += 1;
        actedThisTurn = true;
        if (!event.defenderInstanceId) directAttacks += 1;
        break;
      case "END_TURN":
        if (event.playerId !== playerId) break;
        if (!actedThisTurn) idleTurns += 1;
        actedThisTurn = false;
        break;
      case "DAMAGE": {
        if (event.targetAnchorAfter === undefined || !event.targetPlayerId) break;
        if (event.targetPlayerId === playerId) {
          myAnchor = event.targetAnchorAfter;
          lowestAnchor = Math.min(lowestAnchor, myAnchor);
        } else {
          theirAnchor = event.targetAnchorAfter;
        }
        // Qui mène, en part de son Ancrage de départ ? Un écart de moins de 10 % n'est pas une avance.
        const gap = myAnchor / startingAnchor - theirAnchor / opponentStartingAnchor;
        const now = gap > 0.1 ? 1 : gap < -0.1 ? -1 : 0;
        if (now !== 0 && leader !== 0 && now !== leader) leadChanges += 1;
        if (now !== 0) leader = now;
        break;
      }
      case "REACTION_ACTIVATED":
        if (event.playerId === playerId) reactions += 1;
        break;
      case "SHIP_ABILITY_FIRED":
      case "SHIP_ABILITY_ACTIVATED":
        if (event.playerId === playerId) {
          shipAbilities += event.type === "SHIP_ABILITY_FIRED" ? 1 : 0;
          actedThisTurn = true;
        }
        break;
      case "TIDE_MODIFIED":
      case "TIDE_ORIENTATION_CHANGED":
        tideManipulations += 1;
        break;
      case "TURN_TIMED_OUT":
        if (event.playerId === playerId) timeouts += 1;
        break;
      case "DERAISON_SETTLED":
        if (event.playerId === playerId) deraisons += 1;
        break;
      case "GAME_ENDED":
        if (event.reason === "concede" && event.winnerId !== playerId) conceded = true;
        break;
      default:
        break;
    }
  }

  return {
    playerId,
    finished: state.status !== "active",
    won: state.winnerId === playerId,
    tableTurns: Math.ceil(state.turnNumber / 2),
    startingAnchor,
    opponentStartingAnchor,
    lowestAnchor: Math.min(lowestAnchor, me?.anchor ?? lowestAnchor),
    finalAnchor: me?.anchor ?? myAnchor,
    opponentFinalAnchor: opponent?.anchor ?? theirAnchor,
    leadChanges,
    cardsPlayed,
    distinctCards: distinct.size,
    distinctTypes: types.size,
    attacks,
    directAttacks,
    reactions,
    shipAbilities,
    tideManipulations,
    timeouts,
    idleTurns,
    deraisons,
    conceded,
    momentsTotal: readMoments(state, playerId).reduce((sum, moment) => sum + moment.weight, 0),
  };
}
