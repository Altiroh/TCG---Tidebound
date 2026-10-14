import {
  getCardDefinition,
  graveyardChoicesForAbility,
  graveyardChoicesForPlay,
  type CardInstance,
  type GameState,
  type PlayerAction,
  type PlayerId,
} from "@/game";
import type { GraveyardPickRequest } from "@/features/match/useBoardInteraction";

/**
 * Traduit un geste suspendu à un choix dans le Cimetière en ce qu'il faut
 * pour l'écran : quelle carte pose la question, quelles cartes sont
 * proposées, et quelle action part une fois la réponse donnée.
 *
 * Écrit une fois pour les deux plateaux (local et en ligne) : des gestes
 * recopiés de part et d'autre auraient fini par diverger.
 *
 * Les listes viennent du MOTEUR (`graveyardChoicesFor*`) : l'écran propose
 * donc exactement ce que la validation acceptera, jamais plus.
 */
export function graveyardPickView(
  state: GameState,
  playerId: PlayerId,
  request: GraveyardPickRequest
): { sourceCardId: string; choices: CardInstance[]; actionFor: (chosen: CardInstance) => PlayerAction } {
  if (request.kind === "play") {
    const def = getCardDefinition(request.card.cardId);
    return {
      sourceCardId: request.card.cardId,
      choices: graveyardChoicesForPlay(state, playerId, def),
      actionFor: (chosen) => ({
        type: "playCard",
        playerId,
        instanceId: request.card.instanceId,
        chosenGraveyardInstanceId: chosen.instanceId,
        boardSlot: request.boardSlot,
      }),
    };
  }

  const { candidate } = request;
  return {
    sourceCardId: candidate.cardId,
    choices: graveyardChoicesForAbility(state, playerId, candidate.cardId, candidate.abilityIndex),
    actionFor: (chosen) => ({
      // Effet d'arrivée en réserve : activé depuis la carte posée à droite, pas depuis une fenêtre.
      type: request.arrival ? "activateArrival" : "activateReaction",
      playerId,
      sourceInstanceId: candidate.sourceInstanceId,
      abilityIndex: candidate.abilityIndex,
      chosenGraveyardInstanceId: chosen.instanceId,
    }),
  };
}
