import { consumeAmplify, tickTide } from "@/game/environment/tide";
import { getShipDefinition } from "@/game/environment/shipData";
import { getWaterDefinition } from "@/game/environment/waterData";
import type { TideStateName } from "@/game/environment/types";
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
 * modulés par les Eaux actuelles et le Navire (résistance/faiblesse).
 * Jamais négatif.
 */
function computeTideDamageForPlayer(
  state: GameState,
  player: PlayerState,
  tideState: TideStateName,
  intensity: number
): TideDamageForPlayer {
  const baseAnchor = RULES.TIDE_ANCHOR_DAMAGE[tideState] ?? 0;
  const baseReason = RULES.TIDE_REASON_DAMAGE[tideState] ?? 0;

  const water = getWaterDefinition(state.environment.currentWaterId);
  const waterModifier = water.tideDamageModifierByState?.[tideState] ?? 0;

  const ship = getShipDefinition(player.shipId);
  const resistance = ship.resistanceByState?.[tideState] ?? 0;
  const weakness = ship.weaknessByState?.[tideState] ?? 0;
  const reasonWeakness = ship.reasonWeaknessByState?.[tideState] ?? 0;

  const anchor = Math.max(0, (baseAnchor + waterModifier + weakness - resistance) * intensity);
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

  const tick = tickTide(state.environment);
  const { amplified, modifiers: modifiersAfterAmplify } = consumeAmplify(tick.pendingTideModifiers);
  const intensity = amplified ? tick.tideIntensity * 2 : tick.tideIntensity;

  let nextState: GameState = {
    ...state,
    environment: {
      ...state.environment,
      tideState: tick.tideState,
      tideRemainingTurns: tick.tideRemainingTurns,
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
    stateChanged: tick.stateChanged,
  });

  let players = nextState.players.map((p) => ({ ...p })) as [PlayerState, PlayerState];

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const damage = computeTideDamageForPlayer(nextState, player, tick.tideState, intensity);

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

  return { state: nextState, events };
}

export function grantIgnoreNextTideDamage(player: PlayerState, tideState: TideStateName): PlayerState {
  const flag = ignoreFlagFor(tideState);
  if (player.statusFlags.includes(flag)) return player;
  return { ...player, statusFlags: [...player.statusFlags, flag] };
}
