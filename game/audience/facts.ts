import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameState, PlayerId } from "@/game/state/types";
import type { MatchFacts } from "@/game/audience/types";
import { readTimeline } from "@/game/audience/moments";

/**
 * Relève les faits d'une partie pour le joueur `playerId`. L'Ancrage, les
 * changements de meneur et la conduite (tours passés, délais, Déraison)
 * viennent de la lecture des moments (`readTimeline`) : une seule façon de
 * les compter, partagée par le direct et le verdict.
 */
export function readMatchFacts(state: GameState, playerId: PlayerId): MatchFacts {
  const me = state.players.find((player) => player.id === playerId);
  const opponent = state.players.find((player) => player.id !== playerId);
  const timeline = readTimeline(state, playerId);

  let cardsPlayed = 0;
  const distinct = new Set<string>();
  const types = new Set<string>();
  let attacks = 0;
  let directAttacks = 0;
  let reactions = 0;
  let shipAbilities = 0;
  let tideManipulations = 0;
  let conceded = false;
  let opponentLeft = false;

  for (const event of state.eventLog) {
    switch (event.type) {
      case "PLAY_CARD":
        if (event.playerId !== playerId) break;
        cardsPlayed += 1;
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
        if (!event.defenderInstanceId) directAttacks += 1;
        break;
      case "REACTION_ACTIVATED":
        if (event.playerId === playerId) reactions += 1;
        break;
      case "SHIP_ABILITY_FIRED":
        if (event.playerId === playerId) shipAbilities += 1;
        break;
      case "TIDE_MODIFIED":
      case "TIDE_ORIENTATION_CHANGED":
        tideManipulations += 1;
        break;
      case "GAME_ENDED":
        if (event.reason !== "concede" && event.reason !== "timeout") break;
        // Abandon (ou délais épuisés) : celui qui part a abandonné, l'autre a vu la table se vider.
        if (event.winnerId === playerId) opponentLeft = true;
        else if (event.reason === "concede") conceded = true;
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
    startingAnchor: timeline.startingAnchor,
    opponentStartingAnchor: timeline.opponentStartingAnchor,
    lowestAnchor: timeline.lowestAnchor,
    finalAnchor: me?.anchor ?? timeline.startingAnchor,
    opponentFinalAnchor: opponent?.anchor ?? timeline.opponentStartingAnchor,
    leadChanges: timeline.leadChanges,
    cardsPlayed,
    distinctCards: distinct.size,
    distinctTypes: types.size,
    attacks,
    directAttacks,
    reactions,
    shipAbilities,
    tideManipulations,
    timeouts: timeline.timeouts,
    idleTurns: timeline.idleTurns,
    deraisons: timeline.deraisons,
    conceded,
    opponentLeft,
    momentsTotal: timeline.moments.filter((moment) => moment.kind === "jeu").reduce((sum, moment) => sum + moment.weight, 0),
  };
}
