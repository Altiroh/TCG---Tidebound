import type { PlayerId } from "@/game/state/types";

/**
 * Journal d'événements : chaque action légale du moteur émet un ou
 * plusieurs `GameEvent`. Ce journal doit suffire, à terme, à reconstruire
 * un état de partie, générer des replays et calculer des statistiques.
 * Il ne doit contenir que des faits déjà résolus (pas d'intention).
 */
export type GameEventType =
  | "GAME_STARTED"
  | "DRAW_CARD"
  | "PLAY_CARD"
  | "ATTACK"
  | "DAMAGE"
  | "HEAL"
  | "SUMMON"
  | "DESTROY"
  | "BUFF_APPLIED"
  | "DEBUFF_APPLIED"
  | "RESOURCE_CHANGED"
  | "REASON_CHANGED"
  | "CARD_MOVED"
  | "TURN_STARTED"
  | "END_TURN"
  | "TIDE_ADVANCED"
  | "WATER_CHANGED"
  | "SABORDED"
  | "OCEAN_JUDGMENT"
  | "GAME_ENDED";

export interface BaseGameEvent {
  type: GameEventType;
  turnNumber: number;
  timestamp: number;
  playerId?: PlayerId;
}

export interface DrawCardEvent extends BaseGameEvent {
  type: "DRAW_CARD";
  playerId: PlayerId;
  instanceId: string;
}

export interface PlayCardEvent extends BaseGameEvent {
  type: "PLAY_CARD";
  playerId: PlayerId;
  instanceId: string;
  cardId: string;
}

export interface AttackEvent extends BaseGameEvent {
  type: "ATTACK";
  playerId: PlayerId;
  attackerInstanceId: string;
  defenderInstanceId?: string; // absent = attaque le joueur adverse directement
}

export interface DamageEvent extends BaseGameEvent {
  type: "DAMAGE";
  targetInstanceId?: string;
  targetPlayerId?: PlayerId;
  amount: number;
}

export interface HealEvent extends BaseGameEvent {
  type: "HEAL";
  targetInstanceId?: string;
  targetPlayerId?: PlayerId;
  amount: number;
}

export interface SummonEvent extends BaseGameEvent {
  type: "SUMMON";
  playerId: PlayerId;
  instanceId: string;
  cardId: string;
}

export interface DestroyEvent extends BaseGameEvent {
  type: "DESTROY";
  instanceId: string;
  reason: "combat" | "effect" | "lethal";
}

export interface BuffAppliedEvent extends BaseGameEvent {
  type: "BUFF_APPLIED";
  targetInstanceId: string;
  attack: number;
  health: number;
}

export interface DebuffAppliedEvent extends BaseGameEvent {
  type: "DEBUFF_APPLIED";
  targetInstanceId: string;
  attack: number;
  health: number;
}

export interface ResourceChangedEvent extends BaseGameEvent {
  type: "RESOURCE_CHANGED";
  playerId: PlayerId;
  delta: number;
}

/** Variation de Raison (LA ressource du jeu — pas une piste de mana séparée). */
export interface ReasonChangedEvent extends BaseGameEvent {
  type: "REASON_CHANGED";
  playerId: PlayerId;
  delta: number;
}

export interface CardMovedEvent extends BaseGameEvent {
  type: "CARD_MOVED";
  instanceId: string;
  fromZone: string;
  toZone: string;
}

export interface TurnStartedEvent extends BaseGameEvent {
  type: "TURN_STARTED";
  playerId: PlayerId;
}

export interface EndTurnEvent extends BaseGameEvent {
  type: "END_TURN";
  playerId: PlayerId;
}

export interface GameStartedEvent extends BaseGameEvent {
  type: "GAME_STARTED";
}

export interface GameEndedEvent extends BaseGameEvent {
  type: "GAME_ENDED";
  winnerId?: PlayerId;
  reason?: "anchorZero" | "oceanJudgment" | "concede" | "other";
}

export interface TideAdvancedEvent extends BaseGameEvent {
  type: "TIDE_ADVANCED";
  /** Tours restants avant la prochaine progression, après ce tick. */
  remainingTurns: number;
  tideState: "calme" | "houle" | "tempete" | "abysses";
  stateChanged: boolean;
}

export interface WaterChangedEvent extends BaseGameEvent {
  type: "WATER_CHANGED";
  waterId: string;
}

/** Un joueur sabordé volontairement un de ses permanents (consomme l'action principale). */
export interface SabordedEvent extends BaseGameEvent {
  type: "SABORDED";
  playerId: PlayerId;
  instanceId: string;
}

/**
 * "Jugement de l'Océan" : un joueur a tenté de piocher dans un deck vide.
 * Comparaison de Résilience (Ancrage + Raison) avec départage documenté
 * (Ancrage, puis nombre de permanents en jeu, puis pioche).
 */
export interface OceanJudgmentEvent extends BaseGameEvent {
  type: "OCEAN_JUDGMENT";
  triggeredByPlayerId: PlayerId;
  resilienceByPlayer: Record<PlayerId, number>;
  winnerId?: PlayerId;
}

export type GameEvent =
  | DrawCardEvent
  | PlayCardEvent
  | AttackEvent
  | DamageEvent
  | HealEvent
  | SummonEvent
  | DestroyEvent
  | BuffAppliedEvent
  | DebuffAppliedEvent
  | ResourceChangedEvent
  | ReasonChangedEvent
  | CardMovedEvent
  | TurnStartedEvent
  | EndTurnEvent
  | GameStartedEvent
  | GameEndedEvent
  | TideAdvancedEvent
  | WaterChangedEvent
  | SabordedEvent
  | OceanJudgmentEvent;
