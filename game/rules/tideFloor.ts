import { getCardDefinition } from "@/game/cards/sets/core";
import { TIDE_STATES_ORDER, type EnvironmentState, type TideStateName } from "@/game/environment/types";
import { tideDurationFor, type TickTideResult } from "@/game/environment/tide";
import type { GameState } from "@/game/state/types";

/**
 * PLANCHER DE MARÉE (L'Ancre des Marées, Lot 20 : « tant que cette Structure
 * est en jeu, la mer ne peut pas redescendre sous Houle »).
 *
 * Le plus haut `tideFloorWhileInPlay` des cartes en jeu, des deux camps — une
 * Structure masquée par la Marée tient encore la mer. `undefined` : aucun.
 */
export function tideFloorOf(state: Pick<GameState, "players">): TideStateName | undefined {
  let floor: TideStateName | undefined;
  for (const player of state.players) {
    for (const card of player.board) {
      const plancher = getCardDefinition(card.cardId).tideFloorWhileInPlay;
      if (plancher && (floor === undefined || rank(plancher) > rank(floor))) floor = plancher;
    }
  }
  return floor;
}

function rank(state: TideStateName): number {
  return TIDE_STATES_ORDER.indexOf(state);
}

/**
 * Une transition calculée (`tickTide`, `forceTideTransition`…) qui ferait
 * passer la mer SOUS le plancher la laisse SUR le plancher : si elle y était
 * déjà, rien ne change (ni état, ni durée) ; sinon elle y entre, avec sa
 * durée d'entrée, et son orientation devient montante — elle ne peut plus
 * redescendre. Pure : retourne le résultat, éventuellement retouché.
 */
export function applyTideFloor(
  tick: TickTideResult,
  env: Pick<EnvironmentState, "tideState" | "tideRemainingTurns" | "tideDurations">,
  floor: TideStateName | undefined
): TickTideResult {
  if (!floor || rank(tick.tideState) >= rank(floor)) return tick;
  if (env.tideState === floor) {
    return { ...tick, tideState: floor, tideRemainingTurns: Math.max(1, env.tideRemainingTurns), tideOrientation: "montante", stateChanged: false, renverse: false };
  }
  return { ...tick, tideState: floor, tideRemainingTurns: tideDurationFor(env, floor), tideOrientation: "montante", stateChanged: floor !== env.tideState };
}
