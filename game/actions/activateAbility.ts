import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import {
  assertCardOnOwnBoard,
  assertGameActive,
  assertInPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActivateAbilityAction, ActionResult } from "@/game/actions/types";

/** Clé de suivi "1ère fois par tour" partagée par toute capacité activable — chaque instance de carte suit la sienne (`CardInstance.oncePerTurnFlags`), donc aucun risque de collision entre deux cartes différentes. */
const ONCE_PER_TURN_KEY = "activatableAbility";

function validate(state: GameState, action: ActivateAbilityAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInPhase(state, action.playerId, "mainPhase"),
    assertCardOnOwnBoard(state, action.playerId, action.sourceInstanceId)
  );
  if (!generalChecks.ok) return generalChecks;

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.sourceInstanceId)!;
  const def = getCardDefinition(unit.cardId);
  const spec = def.activatableOncePerTurn;
  if (!spec) return { ok: false as const, error: "Cette carte n'a pas de capacité activable." };

  if (computeEffectiveStats(unit, state.environment.tideState).inactive) {
    return { ok: false as const, error: "Cette carte est rendue inactive par la Marée actuelle." };
  }
  if (!oncePerTurnAvailable(unit, ONCE_PER_TURN_KEY, state.turnNumber)) {
    return { ok: false as const, error: "Cette capacité a déjà été activée ce tour-ci." };
  }

  const reasonCost = spec.cost.reason ?? 0;
  if (player.reason < reasonCost) {
    return { ok: false as const, error: "Raison insuffisante pour activer cette capacité." };
  }

  const needsTarget = spec.effects.some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Cette capacité nécessite une cible." };
  }

  return { ok: true as const };
}

/**
 * Active la capacité `activatableOncePerTurn` d'une carte du plateau (ex:
 * Sondeur des Mauvaises Eaux) : paie son coût, marque le "1ère fois par
 * tour" comme consommé, puis résout ses effets — exactement comme
 * `onPlayEffects`/`onBreakEffects`, mais sans retirer la carte du plateau
 * ni consommer l'action principale du tour.
 */
export function activateAbility(state: GameState, action: ActivateAbilityAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const player = getPlayer(state, action.playerId);
  const unit = player.board.find((u) => u.instanceId === action.sourceInstanceId)!;
  const def = getCardDefinition(unit.cardId);
  const spec = def.activatableOncePerTurn!;
  const events: GameEvent[] = [];
  const base = { turnNumber: state.turnNumber, timestamp: Date.now() };

  const reasonCost = spec.cost.reason ?? 0;
  const playerAfter: PlayerState = {
    ...player,
    reason: player.reason - reasonCost,
    board: player.board.map((u) =>
      u.instanceId === unit.instanceId ? markOncePerTurnUsed(u, ONCE_PER_TURN_KEY, state.turnNumber) : u
    ),
  };
  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [PlayerState, PlayerState],
  };
  if (reasonCost > 0) {
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -reasonCost });
  }

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: unit.instanceId,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
  };

  for (const effect of spec.effects) {
    const result = resolveEffect(nextState, effect, context);
    nextState = result.state;
    events.push(...result.events);
  }

  return { ok: true, state: nextState, events };
}
