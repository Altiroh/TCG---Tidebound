import type { CardInstance } from "@/game/cards/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { EffectAmount, EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import { nextInt } from "@/game/rng";
import {
  getOpponent,
  getPlayer,
  type GameState,
  type PlayerId,
  type PlayerState,
} from "@/game/state/types";

/** Contexte de résolution : qui a causé l'effet, et quelle cible a été
 * choisie par le joueur (résolue et validée avant d'appeler ce module). */
export interface EffectContext {
  controllerId: PlayerId;
  sourceInstanceId?: string;
  chosenTargetInstanceId?: string;
  turnNumber: number;
}

export interface EffectResolution {
  state: GameState;
  events: GameEvent[];
}

function amountValue(amount: EffectAmount | undefined): number {
  return amount?.value ?? 0;
}

function replacePlayer(state: GameState, updated: PlayerState): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === updated.id ? updated : p)) as [
      PlayerState,
      PlayerState
    ],
  };
}

function replaceUnit(
  state: GameState,
  ownerId: PlayerId,
  instanceId: string,
  updater: (unit: CardInstance) => CardInstance
): GameState {
  const owner = getPlayer(state, ownerId);
  const board = owner.board.map((u) => (u.instanceId === instanceId ? updater(u) : u));
  return replacePlayer(state, { ...owner, board });
}

function findUnitOwner(state: GameState, instanceId: string): PlayerState | undefined {
  return state.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
}

/** Résout les unités ciblées par un sélecteur, en tant que paires (unité, propriétaire). */
function resolveUnitTargets(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): Array<{ unit: CardInstance; ownerId: PlayerId }> {
  const controller = getPlayer(state, context.controllerId);
  const opponent = getOpponent(state, context.controllerId);

  switch (effect.target.kind) {
    case "self": {
      if (!context.sourceInstanceId) return [];
      const owner = findUnitOwner(state, context.sourceInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.sourceInstanceId);
      return unit && owner ? [{ unit, ownerId: owner.id }] : [];
    }
    case "chosenUnit": {
      if (!context.chosenTargetInstanceId) return [];
      const owner = findUnitOwner(state, context.chosenTargetInstanceId);
      const unit = owner?.board.find((u) => u.instanceId === context.chosenTargetInstanceId);
      return unit && owner ? [{ unit, ownerId: owner.id }] : [];
    }
    case "allAllyUnits":
      return controller.board.map((unit) => ({ unit, ownerId: controller.id }));
    case "allEnemyUnits":
      return opponent.board.map((unit) => ({ unit, ownerId: opponent.id }));
    case "allUnits":
      return [
        ...controller.board.map((unit) => ({ unit, ownerId: controller.id })),
        ...opponent.board.map((unit) => ({ unit, ownerId: opponent.id })),
      ];
    case "randomAllyUnit": {
      if (controller.board.length === 0) return [];
      const draw = nextInt(state.rngState, controller.board.length);
      const unit = controller.board[draw.value]!;
      return [{ unit, ownerId: controller.id }];
    }
    case "randomEnemyUnit": {
      if (opponent.board.length === 0) return [];
      const draw = nextInt(state.rngState, opponent.board.length);
      const unit = opponent.board[draw.value]!;
      return [{ unit, ownerId: opponent.id }];
    }
    default:
      return [];
  }
}

function resolvePlayerTargets(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): PlayerState[] {
  switch (effect.target.kind) {
    case "controllerPlayer":
      return [getPlayer(state, context.controllerId)];
    case "opponentPlayer":
      return [getOpponent(state, context.controllerId)];
    case "allPlayers":
      return [...state.players];
    default:
      return [];
  }
}

function resolveSinglePlayerTarget(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): PlayerState | undefined {
  return resolvePlayerTargets(state, effect, context)[0];
}

/** Résout un effet unique et retourne le nouvel état + les événements produits. */
export function resolveEffect(
  state: GameState,
  effect: EffectDefinition,
  context: EffectContext
): EffectResolution {
  const events: GameEvent[] = [];
  const base = { turnNumber: context.turnNumber, timestamp: Date.now() };

  switch (effect.type) {
    case "damage": {
      const amount = amountValue(effect.amount);
      let nextState = state;

      for (const { unit, ownerId } of resolveUnitTargets(state, effect, context)) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          damageMarked: u.damageMarked + amount,
        }));
        events.push({ ...base, type: "DAMAGE", targetInstanceId: unit.instanceId, amount });
      }

      for (const player of resolvePlayerTargets(state, effect, context)) {
        const current = getPlayer(nextState, player.id);
        nextState = replacePlayer(nextState, { ...current, anchor: current.anchor - amount });
        events.push({ ...base, type: "DAMAGE", targetPlayerId: player.id, amount });
      }

      return { state: nextState, events };
    }

    case "heal": {
      const amount = amountValue(effect.amount);
      let nextState = state;

      for (const { unit, ownerId } of resolveUnitTargets(state, effect, context)) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          damageMarked: Math.max(0, u.damageMarked - amount),
        }));
        events.push({ ...base, type: "HEAL", targetInstanceId: unit.instanceId, amount });
      }

      for (const player of resolvePlayerTargets(state, effect, context)) {
        const current = getPlayer(nextState, player.id);
        nextState = replacePlayer(nextState, { ...current, anchor: current.anchor + amount });
        events.push({ ...base, type: "HEAL", targetPlayerId: player.id, amount });
      }

      return { state: nextState, events };
    }

    case "draw": {
      const amount = amountValue(effect.amount);
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      let deck = [...player.deck];
      const hand = [...player.hand];
      let pendingOceanJudgment = state.pendingOceanJudgment;

      for (let i = 0; i < amount; i++) {
        const card = deck.shift();
        if (!card) {
          // Deck vide : pas de perte instantanée — déclenche le "Jugement de
          // l'Océan" (résolu en fin d'action par le moteur, voir game/engine.ts).
          pendingOceanJudgment = pendingOceanJudgment ?? { playerId: player.id };
          break;
        }
        hand.push(card);
        events.push({ ...base, type: "DRAW_CARD", playerId: player.id, instanceId: card.instanceId });
      }

      return {
        state: { ...replacePlayer(state, { ...player, deck, hand }), pendingOceanJudgment },
        events,
      };
    }

    case "discard": {
      const amount = amountValue(effect.amount);
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      const hand = [...player.hand];
      const graveyard = [...player.graveyard];

      for (let i = 0; i < amount && hand.length > 0; i++) {
        const card = hand.shift()!;
        graveyard.push(card);
        events.push({ ...base, type: "CARD_MOVED", instanceId: card.instanceId, fromZone: "hand", toZone: "graveyard" });
      }

      return { state: replacePlayer(state, { ...player, hand, graveyard }), events };
    }

    case "destroy": {
      let nextState = state;
      for (const { unit, ownerId } of resolveUnitTargets(state, effect, context)) {
        const owner = getPlayer(nextState, ownerId);
        const board = owner.board.filter((u) => u.instanceId !== unit.instanceId);
        const graveyard = [...owner.graveyard, unit];
        nextState = replacePlayer(nextState, { ...owner, board, graveyard });
        events.push({ ...base, type: "DESTROY", instanceId: unit.instanceId, reason: "effect" });
      }
      return { state: nextState, events };
    }

    case "summon": {
      if (!effect.cardId) return { state, events };
      const player = resolveSinglePlayerTarget(state, effect, context) ?? getPlayer(state, context.controllerId);
      getCardDefinition(effect.cardId); // valide l'existence de la carte à invoquer

      const token: CardInstance = {
        instanceId: `inst_summon_${Math.random().toString(36).slice(2, 10)}`,
        cardId: effect.cardId,
        ownerId: player.id,
        damageMarked: 0,
        modifiers: [],
        summoningSick: true,
        hasAttackedThisTurn: false,
      };

      const board = [...player.board, token];
      events.push({ ...base, type: "SUMMON", playerId: player.id, instanceId: token.instanceId, cardId: token.cardId });
      return { state: replacePlayer(state, { ...player, board }), events };
    }

    case "buff": {
      const fallback = amountValue(effect.amount);
      const attackDelta = effect.attackAmount ? amountValue(effect.attackAmount) : fallback;
      const healthDelta = effect.healthAmount ? amountValue(effect.healthAmount) : fallback;
      const duration = effect.permanent ? "permanent" : "temporary";
      let nextState = state;
      for (const { unit, ownerId } of resolveUnitTargets(state, effect, context)) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          modifiers: [
            ...u.modifiers,
            {
              id: `mod_${Math.random().toString(36).slice(2, 8)}`,
              source: effect.cardId ?? "unknown",
              attack: attackDelta,
              health: healthDelta,
              duration,
            },
          ],
        }));
        events.push({ ...base, type: "BUFF_APPLIED", targetInstanceId: unit.instanceId, attack: attackDelta, health: healthDelta });
      }
      return { state: nextState, events };
    }

    case "debuff": {
      const fallback = amountValue(effect.amount);
      const attackDelta = effect.attackAmount ? amountValue(effect.attackAmount) : fallback;
      const healthDelta = effect.healthAmount ? amountValue(effect.healthAmount) : 0;
      const duration = effect.permanent ? "permanent" : "temporary";
      let nextState = state;
      for (const { unit, ownerId } of resolveUnitTargets(state, effect, context)) {
        nextState = replaceUnit(nextState, ownerId, unit.instanceId, (u) => ({
          ...u,
          modifiers: [
            ...u.modifiers,
            {
              id: `mod_${Math.random().toString(36).slice(2, 8)}`,
              source: effect.cardId ?? "unknown",
              attack: -attackDelta,
              health: -healthDelta,
              duration,
            },
          ],
        }));
        events.push({ ...base, type: "DEBUFF_APPLIED", targetInstanceId: unit.instanceId, attack: -attackDelta, health: -healthDelta });
      }
      return { state: nextState, events };
    }

    case "reasonGain": {
      const amount = amountValue(effect.amount);
      const targets = resolvePlayerTargets(state, effect, context);
      const players = targets.length > 0 ? targets : [getPlayer(state, context.controllerId)];
      let nextState = state;
      for (const target of players) {
        const player = getPlayer(nextState, target.id);
        events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: amount });
        nextState = replacePlayer(nextState, { ...player, reason: Math.min(player.reasonMax, player.reason + amount) });
      }
      return { state: nextState, events };
    }

    case "reasonLoss": {
      const amount = amountValue(effect.amount);
      const targets = resolvePlayerTargets(state, effect, context);
      const players = targets.length > 0 ? targets : [getPlayer(state, context.controllerId)];
      let nextState = state;
      for (const target of players) {
        const player = getPlayer(nextState, target.id);
        events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -amount });
        nextState = replacePlayer(nextState, { ...player, reason: Math.max(0, player.reason - amount) });
      }
      return { state: nextState, events };
    }

    case "tideReduceDuration":
    case "tideExtendDuration": {
      const amount = amountValue(effect.amount) || 1;
      const delta = effect.type === "tideReduceDuration" ? -amount : amount;
      // Un état ne peut jamais progresser "immédiatement" via cet effet : la
      // durée reste au minimum à 1, l'avancée réelle se fait via le tick de
      // début de tour (`resolveTideTurnStep`), pas ici.
      const tideRemainingTurns = Math.max(1, state.environment.tideRemainingTurns + delta);
      return {
        state: { ...state, environment: { ...state.environment, tideRemainingTurns } },
        events,
      };
    }

    case "tideSetIntensity": {
      const value = Math.max(1, amountValue(effect.amount));
      return {
        state: { ...state, environment: { ...state.environment, tideIntensity: value } },
        events,
      };
    }

    case "tideModifyIntensity": {
      const delta = amountValue(effect.amount);
      const tideIntensity = Math.max(1, state.environment.tideIntensity + delta);
      return {
        state: { ...state, environment: { ...state.environment, tideIntensity } },
        events,
      };
    }

    case "tideMaintain":
    case "tideAmplifyNext": {
      const kind = effect.type === "tideMaintain" ? "maintain" : "amplify";
      const remainingTriggers = amountValue(effect.amount) || 1;
      return {
        state: {
          ...state,
          environment: {
            ...state.environment,
            pendingTideModifiers: [...state.environment.pendingTideModifiers, { kind, remainingTriggers }],
          },
        },
        events,
      };
    }

    case "tideInvertOrientation": {
      const tideOrientation = state.environment.tideOrientation === "montante" ? "descendante" : "montante";
      events.push({ ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: tideOrientation });
      return {
        state: { ...state, environment: { ...state.environment, tideOrientation } },
        events,
      };
    }

    case "ignoreNextTideDamage": {
      if (!effect.tideState) return { state, events };
      const targets = resolvePlayerTargets(state, effect, context);
      const targetIds = targets.length > 0 ? targets.map((p) => p.id) : [context.controllerId];
      const flag = `ignoreNextTideDamage:${effect.tideState}`;
      const players = state.players.map((p) =>
        targetIds.includes(p.id) && !p.statusFlags.includes(flag)
          ? { ...p, statusFlags: [...p.statusFlags, flag] }
          : p
      ) as [PlayerState, PlayerState];
      return { state: { ...state, players }, events };
    }

    case "moveZone":
    case "transform":
    case "searchDeck":
      // Prévus par le modèle de données pour de futures extensions ;
      // pas encore nécessaires pour les 30 cartes du MVP.
      return { state, events };

    default:
      return { state, events };
  }
}
