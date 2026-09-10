import { getCardDefinition } from "@/game/cards/sets/core";
import type { PlayerAction } from "@/game/actions/types";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * Génère des actions CANDIDATES pour `playerId` — délibérément
 * sur-inclusive plutôt que d'essayer de dupliquer les règles de validation
 * du moteur : chaque candidat est ensuite simplement soumis à `dispatch`
 * par `chooseAction.ts`, qui écarte silencieusement ceux qui sont refusés.
 * Ça garantit que le bot ne peut jamais proposer un coup illégal, sans
 * jamais avoir à réimplémenter `game/rules/validation.ts`.
 */
export function enumerateCandidateActions(state: GameState, playerId: PlayerId): PlayerAction[] {
  const player = state.players.find((p) => p.id === playerId);
  const actions: PlayerAction[] = [{ type: "endTurn", playerId }];
  if (!player) return actions;

  const opponent = state.players.find((p) => p.id !== playerId);
  const allBoardUnits = [...player.board, ...(opponent?.board ?? [])];

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

  for (const unit of player.board) {
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

  return actions;
}
