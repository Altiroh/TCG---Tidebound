import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId } from "@/game/state/types";

export interface PlayCardAction {
  type: "playCard";
  playerId: PlayerId;
  instanceId: string;
  /** Requis si la carte a un effet ciblant `chosenUnit`. */
  targetInstanceId?: string;
}

export interface AttackAction {
  type: "attack";
  playerId: PlayerId;
  attackerInstanceId: string;
  /** Absent = attaque directe du joueur adverse. */
  defenderInstanceId?: string;
}

export interface EndTurnAction {
  type: "endTurn";
  playerId: PlayerId;
}

/**
 * Sabordage : destruction volontaire d'un de ses propres permanents.
 * Consomme par défaut l'action principale du tour (cadrage section 29/37).
 */
export interface SaborderAction {
  type: "saborder";
  playerId: PlayerId;
  instanceId: string;
}

export type PlayerAction = PlayCardAction | AttackAction | EndTurnAction | SaborderAction;

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
