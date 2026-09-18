import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertInAnyPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  assertValidDefender,
  combine,
} from "@/game/rules/validation";
import { isShipArmed, shipAbilityOf, withArmingConsumed } from "@/game/state/shipAbility";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, FireShipAbilityAction } from "@/game/actions/types";

function validate(state: GameState, action: FireShipAbilityAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player);
  const shot = ability?.armedShot;
  if (!ability || !shot) return { ok: false as const, error: "Ce Navire n'a pas de tir à déclencher." };

  if (!isShipArmed(player, state.turnNumber)) {
    return { ok: false as const, error: `${ability.name} n'est pas armé.` };
  }

  const phaseCheck = assertInAnyPhase(state, action.playerId, shot.phases);
  if (!phaseCheck.ok) return phaseCheck;

  // Le tir vise comme une attaque : Garde d'abord, Navire adverse à défaut,
  // permanent sans Résistance (un Objet) exclu. Aucun attaquant à passer —
  // un Navire ne contourne jamais Garde.
  return assertValidDefender(state, action.playerId, undefined, action.targetInstanceId);
}

/**
 * Tire avec la capacité armée du Navire (`ShipArmedShot`) : consomme
 * l'armement, puis résout les effets du tir sur ce que le joueur a désigné
 * — un permanent adverse, ou le Navire adverse si `targetInstanceId` est
 * absent, exactement comme une attaque directe.
 *
 * Ce sont des effets de CAPACITÉ : ils passent par `resolveEffect` et non
 * par le pipeline de combat. Donc aucune riposte, aucune faiblesse d'attaque
 * directe (« Coque légère » du Courlis ne s'applique pas), aucun bouclier
 * anti-attaque, et l'attaque d'aucune unité n'est consommée.
 */
export function fireShipAbility(state: GameState, action: FireShipAbilityAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const ability = shipAbilityOf(player)!;
  const shot = ability.armedShot!;
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? withArmingConsumed(p) : p)) as [PlayerState, PlayerState],
  };

  events.push({
    ...base,
    type: "SHIP_ABILITY_FIRED",
    playerId: player.id,
    shipId: player.shipId,
    abilityName: ability.name,
    targetInstanceId: action.targetInstanceId,
  });

  const context: EffectContext = {
    controllerId: player.id,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
  };
  for (const effect of shot.effects) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

  return { ok: true, state: nextState, events };
}
