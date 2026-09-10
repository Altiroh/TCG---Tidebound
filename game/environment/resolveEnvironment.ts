import { consumeAmplify, tickTide } from "@/game/environment/tide";
import { getShipDefinition } from "@/game/environment/shipData";
import type { TideStateName } from "@/game/environment/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide } from "@/game/cards/types";
import { RULES } from "@/game/rules/constants";
import type { GameEvent } from "@/game/events/types";
import { processTrigger } from "@/game/triggers/triggerBus";
import type { GameState, PlayerState } from "@/game/state/types";

const IGNORE_FLAG_PREFIX = "ignoreNextTideDamage";

function ignoreFlagFor(tideState: TideStateName): string {
  return `${IGNORE_FLAG_PREFIX}:${tideState}`;
}

interface TideDamageForPlayer {
  anchor: number;
  reason: number;
}

/**
 * Calcule les pertes d'Ancrage et de Raison qu'un joueur subit pour l'état
 * de Marée courant, à l'Intensité donnée : dégâts de base × Intensité,
 * modulés par le Navire (résistance/faiblesse). Jamais négatif.
 */
function computeTideDamageForPlayer(
  player: PlayerState,
  tideState: TideStateName,
  intensity: number
): TideDamageForPlayer {
  const baseAnchor = RULES.TIDE_ANCHOR_DAMAGE[tideState] ?? 0;
  const baseReason = RULES.TIDE_REASON_DAMAGE[tideState] ?? 0;

  const ship = getShipDefinition(player.shipId);
  const resistance = ship.resistanceByState?.[tideState] ?? 0;
  const weakness = ship.weaknessByState?.[tideState] ?? 0;
  const reasonWeakness = ship.reasonWeaknessByState?.[tideState] ?? 0;

  const anchor = Math.max(0, (baseAnchor + weakness - resistance) * intensity);
  const reason = Math.max(0, (baseReason + reasonWeakness) * intensity);

  return { anchor, reason };
}

/**
 * Applique une étape complète de progression de Marée pour le début d'un
 * tour (étapes 4-7 de la structure de tour verrouillée) : décompte la
 * durée restante, avance éventuellement vers l'état suivant, puis
 * applique les effets environnementaux du tour (dégâts d'Ancrage/Raison
 * aux deux joueurs à CHAQUE tour tant qu'on est en Tempête/Abysses — pas
 * seulement à l'entrée), avec réactions de Navire et déclenchement des
 * capacités `onTideStateEntered` en cas de changement d'état.
 */
export function resolveTideTurnStep(
  state: GameState,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const base = { turnNumber, timestamp: Date.now() };
  const previousTideState = state.environment.tideState;

  const tick = tickTide(state.environment);
  const { amplified, modifiers: modifiersAfterAmplify } = consumeAmplify(tick.pendingTideModifiers);
  const intensity = amplified ? tick.tideIntensity * 2 : tick.tideIntensity;

  let nextState: GameState = {
    ...state,
    environment: {
      ...state.environment,
      tideState: tick.tideState,
      tideRemainingTurns: tick.tideRemainingTurns,
      tideOrientation: tick.tideOrientation,
      tideIntensity: tick.tideIntensity,
      pendingTideModifiers: modifiersAfterAmplify,
    },
  };

  events.push({
    type: "TIDE_ADVANCED",
    turnNumber,
    timestamp: Date.now(),
    remainingTurns: tick.tideRemainingTurns,
    tideState: tick.tideState,
    tideOrientation: tick.tideOrientation,
    stateChanged: tick.stateChanged,
  });

  let players = nextState.players.map((p) => ({ ...p })) as [PlayerState, PlayerState];

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const damage = computeTideDamageForPlayer(player, tick.tideState, intensity);

    const flag = ignoreFlagFor(tick.tideState);
    const statusFlags = [...player.statusFlags];
    const ignored = (damage.anchor > 0 || damage.reason > 0) && statusFlags.includes(flag);
    if (ignored) statusFlags.splice(statusFlags.indexOf(flag), 1);

    const anchorLoss = ignored ? 0 : damage.anchor;
    const reasonLoss = ignored ? 0 : damage.reason;

    let hand = player.hand;
    let graveyard = player.graveyard;
    if (anchorLoss > 0) {
      const ship = getShipDefinition(player.shipId);
      const discardCount = ship.onTideDamageTakenByState?.[tick.tideState]?.discardCount ?? 0;
      for (let d = 0; d < discardCount && hand.length > 0; d++) {
        const [discarded, ...rest] = hand;
        hand = rest;
        graveyard = [...graveyard, discarded!];
        events.push({ ...base, type: "CARD_MOVED", instanceId: discarded!.instanceId, fromZone: "hand", toZone: "graveyard" });
      }
    }

    players[i] = {
      ...player,
      anchor: player.anchor - anchorLoss,
      reason: Math.max(0, player.reason - reasonLoss),
      statusFlags,
      hand,
      graveyard,
    };

    if (anchorLoss > 0) events.push({ ...base, type: "DAMAGE", targetPlayerId: player.id, amount: anchorLoss });
    if (reasonLoss > 0) events.push({ ...base, type: "REASON_CHANGED", playerId: player.id, delta: -reasonLoss });
  }

  nextState = { ...nextState, players };

  if (tick.stateChanged) {
    const trigger = processTrigger(nextState, { trigger: "onTideStateEntered", tideState: tick.tideState }, turnNumber);
    nextState = trigger.state;
    events.push(...trigger.events);
  }

  // --- Expiration des permanents à durée limitée (Structures/Objets) -----
  // Décompte une fois par tour joué, tous joueurs confondus (même
  // convention que la durée des états de Marée). Ni mort ni Sabordage.
  for (const player of nextState.players) {
    const expiring = player.board.filter((u) => u.turnsRemaining !== undefined && u.turnsRemaining <= 1);
    const board = player.board
      .filter((u) => !expiring.some((e) => e.instanceId === u.instanceId))
      .map((u) => (u.turnsRemaining !== undefined ? { ...u, turnsRemaining: u.turnsRemaining - 1 } : u));
    if (expiring.length === 0) continue;

    const graveyard = [...player.graveyard, ...expiring.map((u) => ({ ...u, damageMarked: 0, modifiers: [] }))];
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === player.id ? { ...p, board, graveyard } : p)) as [
        PlayerState,
        PlayerState
      ],
    };

    for (const unit of expiring) {
      events.push({ ...base, type: "CARD_MOVED", instanceId: unit.instanceId, fromZone: "board", toZone: "graveyard" });
      const expireTrigger = processTrigger(
        nextState,
        { trigger: "onExpire", playerId: player.id, cardId: unit.cardId, sourceInstanceId: unit.instanceId },
        turnNumber
      );
      nextState = expireTrigger.state;
      events.push(...expireTrigger.events);
    }
  }

  // --- "Devient visible" : Structures passant d'invisible à visible ------
  // Ne dépend que d'une transition d'état de Marée (`visibleDuringTide`).
  if (tick.stateChanged) {
    for (const playerId of nextState.players.map((p) => p.id)) {
      const player = nextState.players.find((p) => p.id === playerId)!;
      for (const unit of player.board) {
        const def = getCardDefinition(unit.cardId);
        if (!def.visibleDuringTide) continue;
        const wasVisible = isVisibleDuringTide(def, previousTideState);
        const isVisible = isVisibleDuringTide(def, tick.tideState);
        if (wasVisible || !isVisible) continue;
        const becomeVisibleTrigger = processTrigger(
          nextState,
          { trigger: "onBecomeVisible", playerId, cardId: unit.cardId, sourceInstanceId: unit.instanceId },
          turnNumber
        );
        nextState = becomeVisibleTrigger.state;
        events.push(...becomeVisibleTrigger.events);
      }
    }
  }

  return { state: nextState, events };
}

export function grantIgnoreNextTideDamage(player: PlayerState, tideState: TideStateName): PlayerState {
  const flag = ignoreFlagFor(tideState);
  if (player.statusFlags.includes(flag)) return player;
  return { ...player, statusFlags: [...player.statusFlags, flag] };
}
