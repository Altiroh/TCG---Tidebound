import { getCardDefinition } from "@/game/cards/sets/core";
import { isPermanentCard, UNIT_CARD_TYPES } from "@/game/cards/types";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import {
  assertBoardNotFull,
  assertCanPayCost,
  assertCardInHand,
  assertGameActive,
  assertHasNotUsedMainActionThisTurn,
  assertInPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, PlayCardAction } from "@/game/actions/types";

function isUnitCard(type: string): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(type);
}

function validate(state: GameState, action: PlayCardAction) {
  const player = state.players.find((p) => p.id === action.playerId);
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    assertHasNotUsedMainActionThisTurn(state, action.playerId),
    assertCardInHand(state, action.playerId, action.instanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const instance = player!.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);

  if (def.requiresTideState && !def.requiresTideState.includes(state.environment.tideState)) {
    return { ok: false as const, error: "Cette carte ne peut pas être jouée dans l'état de Marée actuel." };
  }

  const costCheck = assertCanPayCost(state, action.playerId, def.cost);
  if (!costCheck.ok) return costCheck;

  if (isPermanentCard(def)) {
    // Slots universels : tout permanent (unité, Structure, Objet, Équipement,
    // Anomalie) occupe un Slot, pas seulement les unités.
    const boardCheck = assertBoardNotFull(state, action.playerId);
    if (!boardCheck.ok) return boardCheck;
  }

  const needsTarget = (def.onPlayEffects ?? []).some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Cette carte nécessite une cible." };
  }

  return { ok: true as const };
}

/**
 * Joue une carte de la main : paie le coût en Raison, la retire de la
 * main, la place (plateau pour un permanent, cimetière pour une carte non
 * permanente après résolution — cf. `isPermanentCard`), résout ses
 * `onPlayEffects`, déclenche les triggers `onCardPlayed`/`onEnterPlay`, et
 * consomme l'action principale du tour (une seule par tour, partagée
 * avec le Sabordage).
 */
export function playCard(state: GameState, action: PlayCardAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const instance = player.hand.find((c) => c.instanceId === action.instanceId)!;
  const def = getCardDefinition(instance.cardId);
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const handAfterRemoval = player.hand.filter((c) => c.instanceId !== instance.instanceId);
  const playerAfterCost: PlayerState = {
    ...player,
    hand: handAfterRemoval,
    reason: player.reason - def.cost,
    hasUsedMainActionThisTurn: true,
  };

  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfterCost : p)) as [
      PlayerState,
      PlayerState
    ],
  };

  events.push({ ...base, type: "PLAY_CARD", playerId: player.id, instanceId: instance.instanceId, cardId: def.id });
  events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -def.cost });

  const asPermanent = isPermanentCard(def);

  if (isUnitCard(def.type) || asPermanent) {
    const boardUnit = {
      ...instance,
      summoningSick: isUnitCard(def.type),
      hasAttackedThisTurn: false,
      damageMarked: 0,
      modifiers: [],
      turnsRemaining: def.durationTurns,
    };
    const owner = getPlayer(nextState, player.id);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === owner.id ? { ...owner, board: [...owner.board, boardUnit] } : p
      ) as [PlayerState, PlayerState],
    };
    events.push({ ...base, type: "SUMMON", playerId: player.id, instanceId: boardUnit.instanceId, cardId: def.id });
  } else {
    // Équipement consommable (`permanent: false`) : part directement au
    // cimetière après résolution. Aucune autre carte ne prend cette voie —
    // Action et Réaction n'existent plus comme types de carte.
    const owner = getPlayer(nextState, player.id);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === owner.id ? { ...owner, graveyard: [...owner.graveyard, instance] } : p
      ) as [PlayerState, PlayerState],
    };
  }

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: isUnitCard(def.type) || asPermanent ? instance.instanceId : undefined,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
  };

  for (const effect of def.onPlayEffects ?? []) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

  const cardPlayedTrigger = processTrigger(
    nextState,
    { trigger: "onCardPlayed", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
    state.turnNumber
  );
  nextState = cardPlayedTrigger.state;
  events.push(...cardPlayedTrigger.events);

  if (isUnitCard(def.type)) {
    const enterPlayTrigger = processTrigger(
      nextState,
      { trigger: "onEnterPlay", playerId: player.id, cardId: def.id, sourceInstanceId: instance.instanceId },
      state.turnNumber
    );
    nextState = enterPlayTrigger.state;
    events.push(...enterPlayTrigger.events);
  }

  return { ok: true, state: nextState, events };
}
