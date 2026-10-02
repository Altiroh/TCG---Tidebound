import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import { type GameState, type PendingChoice, type PlayerId, type PlayerState } from "@/game/state/types";

/**
 * Anomalies globales temporaires (`CardDefinition.type === "anomalie"`,
 * permanents à durée limitée via `durationTurns`, comme une Structure) :
 * règles SYMÉTRIQUES qui affectent N'IMPORTE QUEL joueur concerné par la
 * situation décrite, pas seulement le contrôleur de l'Anomalie — à la
 * différence des boucliers "1ère fois par tour" (`game/state/shields.ts`),
 * qui ne bénéficient qu'à leur propre contrôleur. Plusieurs copies de la
 * même Anomalie s'appliquent chacune indépendamment (cumulatif), d'où une
 * boucle sur TOUTES les instances éligibles plutôt qu'un seul "slot"
 * consommé comme dans `findAvailableShield`.
 */
function allAnomalyInstances(state: GameState): Array<{ owner: PlayerState; unit: CardInstance; def: CardDefinition }> {
  const result: Array<{ owner: PlayerState; unit: CardInstance; def: CardDefinition }> = [];
  for (const owner of state.players) {
    for (const unit of owner.board) {
      const def = getCardDefinition(unit.cardId);
      if (def.type === "anomalie") result.push({ owner, unit, def });
    }
  }
  return result;
}

/**
 * "Le Fond Vous Regarde" : au début de CHAQUE tour, force un choix pour le
 * joueur qui DEVIENT actif — cf. `CardDefinition.anomalyForceChoiceAtStartOfTurn`.
 * CHAQUE Anomalie éligible impose son propre choix (deux exemplaires, ou
 * Standard + Abyssale) : un choix par carte, dans l'ordre du plateau. Le
 * premier s'ouvre, les suivants attendent dans `pendingChoiceQueue`.
 */
export function findAnomalyForcedChoices(state: GameState, activePlayerId: PlayerId, turnNumber: number): PendingChoice[] {
  const choices: PendingChoice[] = [];
  for (const { unit, def } of allAnomalyInstances(state)) {
    const spec = def.anomalyForceChoiceAtStartOfTurn;
    if (!spec) continue;
    choices.push({
      kind: "reasonOrAnchor",
      playerId: activePlayerId,
      sourceInstanceId: unit.instanceId,
      reasonLossAmount: spec.reasonLossAmount,
      anchorDamageAmount: spec.anchorDamageAmount,
      turnNumber,
    });
  }
  return choices;
}
