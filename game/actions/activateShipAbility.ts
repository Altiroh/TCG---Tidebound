import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertInAnyPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { payReasonCost } from "@/game/state/shields";
import {
  activationsPerTurn,
  activationsUsedThisTurn,
  shipAbilityOf,
  withActivationRecorded,
} from "@/game/state/shipAbility";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActivateShipAbilityAction, ActionResult } from "@/game/actions/types";

function validate(state: GameState, action: ActivateShipAbilityAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player);
  if (!ability) return { ok: false as const, error: "Ce Navire n'a pas de capacité activable." };

  const phaseCheck = assertInAnyPhase(state, action.playerId, ability.activationPhases);
  if (!phaseCheck.ok) return phaseCheck;

  if (activationsUsedThisTurn(player, state.turnNumber) >= activationsPerTurn(ability)) {
    return { ok: false as const, error: `${ability.name} a déjà été utilisée ce tour-ci.` };
  }

  // Le coût en Raison n'est jamais refusé, ici comme pour une capacité de
  // carte : sans plancher de Déraison, il se paie en creusant la dette
  // (`game/state/reason.ts`). Le Goliath peut donc tirer à crédit — c'est
  // exactement son intention de design.

  return { ok: true as const };
}

/**
 * Active la capacité du NAVIRE de ce joueur
 * (`ShipDefinition.activatableAbility`) : paie son coût, inscrit
 * l'activation au compteur du tour, puis — selon la capacité — résout ses
 * effets immédiats, arme son tir différé, ou les deux.
 *
 * Ne consomme pas l'action principale du tour : la capacité appartient au
 * Navire, pas à une carte posée, et ne prive donc le joueur d'aucun autre
 * geste. Une capacité en deux temps se tire ensuite avec `fireShipAbility`.
 */
export function activateShipAbility(state: GameState, action: ActivateShipAbilityAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player)!;
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };
  const arms = Boolean(ability.armedShot);

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id ? withActivationRecorded(p, state.turnNumber, arms) : p
    ) as [PlayerState, PlayerState],
  };

  const reasonCost = ability.cost.reason ?? 0;
  if (reasonCost > 0) {
    const payment = payReasonCost(nextState, player.id, reasonCost, state.turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });
  }

  events.push({
    ...base,
    type: "SHIP_ABILITY_ACTIVATED",
    playerId: player.id,
    shipId: player.shipId,
    abilityName: ability.name,
    armed: arms,
  });

  if (ability.onActivateEffects) {
    const context: EffectContext = { controllerId: player.id, turnNumber: state.turnNumber };
    for (const effect of ability.onActivateEffects) {
      const result = resolveEffect(nextState, effect, context);
      nextState = result.state;
      events.push(...result.events);
    }
  }

  return { ok: true, state: nextState, events };
}

/** Le Navire de ce joueur porte-t-il une capacité activable câblée ? Utile aux appelants qui n'ont que l'identifiant. */
export function shipHasActivatableAbility(shipId: string): boolean {
  return getShipDefinition(shipId).activatableAbility !== undefined;
}
