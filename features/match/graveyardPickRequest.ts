import {
  getCardDefinition,
  graveyardChoicesForAbility,
  graveyardChoicesForBreak,
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
 * Écrit une fois pour les deux plateaux (local et en ligne) : le Bris était
 * le seul cas jusqu'au Lot 13, et il était recopié de part et d'autre —
 * trois gestes recopiés deux fois auraient fini par diverger.
 *
 * Les listes viennent du MOTEUR (`graveyardChoicesFor*`) : l'écran propose
 * donc exactement ce que la validation acceptera, jamais plus.
 */
export function graveyardPickView(
  state: GameState,
  playerId: PlayerId,
  request: GraveyardPickRequest
): { sourceCardId: string; choices: CardInstance[]; actionFor: (chosen: CardInstance) => PlayerAction } {
  if (request.kind === "break") {
    const def = getCardDefinition(request.card.cardId);
    return {
      sourceCardId: request.card.cardId,
      choices: graveyardChoicesForBreak(state, playerId, def),
      actionFor: (chosen) => ({
        type: "breakObject",
        playerId,
        instanceId: request.card.instanceId,
        fromHand: request.fromHand,
        chosenGraveyardInstanceId: chosen.instanceId,
      }),
    };
  }

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
      }),
    };
  }

  const { candidate } = request;
  return {
    sourceCardId: candidate.cardId,
    choices: graveyardChoicesForAbility(state, playerId, candidate.cardId, candidate.abilityIndex),
    actionFor: (chosen) => ({
      type: "activateReaction",
      playerId,
      sourceInstanceId: candidate.sourceInstanceId,
      abilityIndex: candidate.abilityIndex,
      chosenGraveyardInstanceId: chosen.instanceId,
    }),
  };
}
