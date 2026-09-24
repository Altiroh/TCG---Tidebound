import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import type { EffectContext } from "@/game/effects/resolveEffect";
import { resolveEffectSequence } from "@/game/effects/resolveSequence";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { GameEvent } from "@/game/events/types";
import {
  assertCardOnOwnBoard,
  assertGameActive,
  assertInMainPhase,
  assertIsActivePlayer,
  assertPlayerInGame,
  combine,
} from "@/game/rules/validation";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import { payReasonCost, reasonCostAfterShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerId, type PlayerState } from "@/game/state/types";
import { eligibleChosenUnits } from "@/game/effects/chosenTargets";
import type { ActivateAbilityAction, ActionResult } from "@/game/actions/types";

/** Clé de suivi "1ère fois par tour" partagée par toute capacité activable — chaque instance de carte suit la sienne (`CardInstance.oncePerTurnFlags`), donc aucun risque de collision entre deux cartes différentes. */
const ONCE_PER_TURN_KEY = "activatableAbility";

function validate(state: GameState, action: ActivateAbilityAction) {
  const generalChecks = combine(
    assertGameActive(state),
    assertPlayerInGame(state, action.playerId),
    assertIsActivePlayer(state, action.playerId),
    assertInMainPhase(state, action.playerId),
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

  // Le coût en Raison n'est jamais refusé : sans plancher de Déraison, il
  // se paie en creusant la dette (cf. `game/state/reason.ts`).
  const needsTarget = spec.effects.some((e) => e.target.kind === "chosenUnit");
  if (needsTarget && !action.targetInstanceId) {
    return { ok: false as const, error: "Cette capacité nécessite une cible." };
  }

  return { ok: true as const };
}

/**
 * La capacité activable de cette carte peut-elle être activée MAINTENANT ?
 * Mêmes vérifications que l'action, sans la cible — et, si elle en demande
 * une, au moins une cible légale doit exister (Coffret aux Cinq Pierres
 * sans Éclat en jeu : rien à Saborder, rien à proposer). C'est ce que lit
 * l'interface pour offrir le bouton « Activer ».
 */
export function canActivateAbility(state: GameState, playerId: PlayerId, sourceInstanceId: string): boolean {
  const unit = state.players.find((p) => p.id === playerId)?.board.find((u) => u.instanceId === sourceInstanceId);
  const spec = unit ? getCardDefinition(unit.cardId).activatableOncePerTurn : undefined;
  if (!spec) return false;
  const targeted = spec.effects.find((e) => e.target.kind === "chosenUnit");
  if (targeted && eligibleChosenUnits(state, targeted.target, playerId, sourceInstanceId).length === 0) return false;
  // Une cible factice passe la seule vérification qui l'exige : le reste est celui de l'action.
  return validate(state, { type: "activateAbility", playerId, sourceInstanceId, targetInstanceId: targeted ? "__cible__" : undefined }).ok;
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
    board: player.board.map((u) =>
      u.instanceId === unit.instanceId ? markOncePerTurnUsed(u, ONCE_PER_TURN_KEY, state.turnNumber) : u
    ),
  };
  let nextState: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? playerAfter : p)) as [PlayerState, PlayerState],
  };
  if (reasonCost > 0) {
    const payment = payReasonCost(nextState, player.id, reasonCost, state.turnNumber);
    nextState = payment.state;
    events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -payment.paid });
  }

  const context: EffectContext = {
    controllerId: player.id,
    sourceInstanceId: unit.instanceId,
    chosenTargetInstanceId: action.targetInstanceId,
    turnNumber: state.turnNumber,
  };

  const activated = resolveEffectSequence(nextState, spec.effects, context);
  nextState = activated.state;
  events.push(...activated.events);

  return { ok: true, state: nextState, events };
}
