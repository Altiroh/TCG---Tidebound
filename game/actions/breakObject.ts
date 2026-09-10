import { getCardDefinition } from "@/game/cards/sets/core";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import {
  assertGameActive,
  assertHasNotUsedMainActionThisTurn,
  assertInPhase,
  assertIsActivePlayer,
  assertIsObjectCard,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, BreakObjectAction } from "@/game/actions/types";

function validate(state: GameState, action: BreakObjectAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    assertHasNotUsedMainActionThisTurn(state, action.playerId),
    assertIsObjectCard(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const needsTarget = (def.onBreakEffects ?? []).some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Briser cet Objet nécessite une cible." };
  }

  return { ok: true as const };
}

/**
 * Brise un Objet contrôlé par le joueur : résout `onBreakEffects` puis
 * l'envoie au cimetière. Consomme l'action principale du tour, comme jouer
 * une carte ou Saborder.
 *
 * IMPORTANT — "Briser ≠ Saborder" (règle verrouillée) : contrairement à
 * `saborder.ts`, cette action ne déclenche NI `onDeath` NI `onSaborde`. Un
 * texte de carte qui voudrait réagir spécifiquement à un bris devra un
 * jour s'accrocher à un trigger dédié (pas encore nécessaire pour le pool
 * actuel).
 */
export function breakObject(state: GameState, action: BreakObjectAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.instanceId)!;
  const def = getCardDefinition(unit.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const board = player.board.filter((u) => u.instanceId !== unit.instanceId);
  const graveyard = [...player.graveyard, { ...unit, damageMarked: 0, modifiers: [] }];

  const playerAfter: PlayerState = {
    ...player,
    board,
    graveyard,
    hasUsedMainActionThisTurn: true,
  };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone: "board", toZone: "graveyard" });

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: unit.instanceId,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
  };

  for (const effect of def.onBreakEffects ?? []) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

  return { ok: true, state: nextState, events };
}
