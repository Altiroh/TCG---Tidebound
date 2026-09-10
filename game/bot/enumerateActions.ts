import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES } from "@/game/cards/types";
import type { CardInstance } from "@/game/cards/types";
import type { PlayerAction } from "@/game/actions/types";
import type { GameState, PlayerId } from "@/game/state/types";

function isEligibleAttacker(unit: CardInstance): boolean {
  return (
    (UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(unit.cardId).type) &&
    !unit.summoningSick &&
    !unit.hasAttackedThisTurn
  );
}

/**
 * Génère des actions CANDIDATES pour `playerId` — délibérément
 * sur-inclusive plutôt que d'essayer de dupliquer les règles de validation
 * du moteur : chaque candidat est ensuite simplement soumis à `dispatch`
 * par `chooseAction.ts`, qui écarte silencieusement ceux qui sont refusés.
 * Ça garantit que le bot ne peut jamais proposer un coup illégal, sans
 * jamais avoir à réimplémenter `game/rules/validation.ts`.
 *
 * Consciente des Phases (`game/actions/advancePhase.ts`) : jouer une
 * carte/Saborder/Briser n'est proposé qu'en Phase principale, attaquer
 * qu'en Phase de combat — cohérent avec ce que `dispatch` accepterait de
 * toute façon, mais évite de gonfler inutilement la liste de candidats.
 */
export function enumerateCandidateActions(state: GameState, playerId: PlayerId): PlayerAction[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [{ type: "endTurn", playerId }];

  const opponent = state.players.find((p) => p.id !== playerId);
  const allBoardUnits = [...player.board, ...(opponent?.board ?? [])];
  const actions: PlayerAction[] = [];

  if (state.phase === "mainPhase") {
    if (!player.hasUsedMainActionThisTurn) {
      for (const card of player.hand) {
        const def = getCardDefinition(card.cardId);
        const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");
        if (needsTarget) {
          for (const target of allBoardUnits) {
            actions.push({
              type: "playCard",
              playerId,
              instanceId: card.instanceId,
              targetInstanceId: target.instanceId,
            });
          }
        } else {
          actions.push({ type: "playCard", playerId, instanceId: card.instanceId });
        }
      }

      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        if (def.type === "objet") {
          const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
          if (needsTarget) {
            for (const target of allBoardUnits) {
              actions.push({
                type: "breakObject",
                playerId,
                instanceId: unit.instanceId,
                targetInstanceId: target.instanceId,
              });
            }
          } else {
            actions.push({ type: "breakObject", playerId, instanceId: unit.instanceId });
          }
        }
        actions.push({ type: "saborder", playerId, instanceId: unit.instanceId });
      }
    }

    actions.push({ type: "advancePhase", playerId });
    // N'offre "passer directement" que s'il n'y a rien à attaquer derrière —
    // sinon `chooseAction.ts` favorise de toute façon `advancePhase` via son
    // bonus heuristique, mais autant ne pas tenter le sort avec un
    // choix aléatoire (difficulté "facile") qui zapperait une attaque gratuite.
    if (!player.board.some(isEligibleAttacker)) {
      actions.push({ type: "endTurn", playerId });
    }
  } else if (state.phase === "combatPhase") {
    actions.push({ type: "endTurn", playerId });
    for (const unit of player.board) {
      if (!isEligibleAttacker(unit)) continue;
      actions.push({ type: "attack", playerId, attackerInstanceId: unit.instanceId });
      for (const defender of opponent?.board ?? []) {
        actions.push({
          type: "attack",
          playerId,
          attackerInstanceId: unit.instanceId,
          defenderInstanceId: defender.instanceId,
        });
      }
    }
  } else {
    actions.push({ type: "endTurn", playerId });
  }

  return actions;
}
