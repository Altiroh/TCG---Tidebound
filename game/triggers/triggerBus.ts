import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerState } from "@/game/state/types";
import type { TriggerEvent } from "@/game/triggers/types";

interface TriggeredWork {
  effects: EffectDefinition[];
  context: EffectContext;
}

/** Une unité rendue inactive par la Marée ne peut pas utiliser ses capacités (sauf onDeath : mourir n'est pas "utiliser une capacité"). */
function isInactive(state: GameState, unit: CardInstance): boolean {
  return computeEffectiveStats(unit, state.environment.tideState).inactive;
}

/**
 * Ordre de résolution des déclenchements automatiques simultanés (cadrage
 * "Mécaniques verrouillées", règle verrouillée) : les effets automatiques
 * du joueur actif se résolvent avant ceux de l'adversaire, puis par ordre
 * d'arrivée sur le plateau au sein d'un même joueur (ordre naturel du
 * tableau `board`, jamais réordonné).
 */
function playersActiveFirst(state: GameState): PlayerState[] {
  const active = state.players.find((p) => p.id === state.activePlayerId);
  const others = state.players.filter((p) => p.id !== state.activePlayerId);
  return active ? [active, ...others] : [...state.players];
}

/** Rassemble les capacités déclenchées concernées par un `TriggerEvent` donné. */
function collectTriggeredWork(state: GameState, event: TriggerEvent, turnNumber: number): TriggeredWork[] {
  const work: TriggeredWork[] = [];

  if (event.trigger === "onDeath" || event.trigger === "onSaborde") {
    // L'unité est déjà retirée du plateau au moment où cet événement est
    // émis : on résout ses capacités à partir des infos portées par
    // l'événement lui-même.
    if (!event.cardId || !event.playerId || !event.sourceInstanceId) return work;
    const def = getCardDefinition(event.cardId);
    for (const ability of def.abilities ?? []) {
      if (ability.trigger !== event.trigger) continue;
      work.push({
        effects: ability.effects,
        context: {
          controllerId: event.playerId,
          sourceInstanceId: event.sourceInstanceId,
          turnNumber,
        },
      });
    }
    return work;
  }

  if (event.trigger === "startOfTurn" || event.trigger === "endOfTurn") {
    if (!event.playerId) return work;
    const player = state.players.find((p) => p.id === event.playerId);
    if (!player) return work;

    for (const unit of player.board) {
      if (isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      for (const ability of def.abilities ?? []) {
        if (ability.trigger !== event.trigger) continue;
        work.push({
          effects: ability.effects,
          context: { controllerId: player.id, sourceInstanceId: unit.instanceId, turnNumber },
        });
      }
    }
    return work;
  }

  if (event.trigger === "onCardPlayed") {
    for (const player of playersActiveFirst(state)) {
      for (const unit of player.board) {
        if (isInactive(state, unit)) continue;
        const def = getCardDefinition(unit.cardId);
        for (const ability of def.abilities ?? []) {
          if (ability.trigger !== "onCardPlayed") continue;
          work.push({
            effects: ability.effects,
            context: { controllerId: player.id, sourceInstanceId: unit.instanceId, turnNumber },
          });
        }
      }
    }
    return work;
  }

  if (event.trigger === "onTideStateEntered") {
    for (const player of playersActiveFirst(state)) {
      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        for (const ability of def.abilities ?? []) {
          if (ability.trigger !== "onTideStateEntered") continue;
          if (ability.condition?.tideState && ability.condition.tideState !== event.tideState) continue;
          work.push({
            effects: ability.effects,
            context: { controllerId: player.id, sourceInstanceId: unit.instanceId, turnNumber },
          });
        }
      }
    }
    return work;
  }

  // onAttack / onDamaged / onEnterPlay : déclenchement "personnel", limité
  // à l'unité concernée par l'événement.
  if (event.sourceInstanceId) {
    for (const player of state.players) {
      const unit = player.board.find((u) => u.instanceId === event.sourceInstanceId);
      if (!unit || isInactive(state, unit)) continue;
      const def = getCardDefinition(unit.cardId);
      for (const ability of def.abilities ?? []) {
        if (ability.trigger !== event.trigger) continue;
        work.push({
          effects: ability.effects,
          context: { controllerId: player.id, sourceInstanceId: unit.instanceId, turnNumber },
        });
      }
    }
  }

  return work;
}

/**
 * Traite un `TriggerEvent` : résout dans l'ordre toutes les capacités
 * déclenchées concernées et retourne le nouvel état + les événements
 * produits (à ajouter au journal par l'appelant).
 */
export function processTrigger(
  state: GameState,
  event: TriggerEvent,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const work = collectTriggeredWork(state, event, turnNumber);
  let nextState = state;
  const events: GameEvent[] = [];

  for (const item of work) {
    for (const effect of item.effects) {
      const result = resolveEffect(nextState, effect, item.context);
      nextState = result.state;
      events.push(...result.events);
    }
  }

  return { state: nextState, events };
}
