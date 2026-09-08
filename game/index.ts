/**
 * Point d'entrée public du moteur de jeu. Le reste de l'application
 * (API routes, composants React, etc.) ne doit importer que depuis ce
 * fichier plutôt que de piocher directement dans les sous-dossiers —
 * ça garde une frontière claire entre "moteur" et "reste du monde".
 */
export { dispatch } from "@/game/engine";
export { createGameState } from "@/game/state/createGameState";
export type { CreateGameStateInput } from "@/game/state/createGameState";

export type {
  GameState,
  PlayerState,
  PlayerId,
  GamePhase,
  Zone,
} from "@/game/state/types";
export { getPlayer, getOpponent, findCardInstance } from "@/game/state/types";

export type {
  PlayerAction,
  PlayCardAction,
  AttackAction,
  EndTurnAction,
  SaborderAction,
  ActionResult,
} from "@/game/actions/types";

export type { CardDefinition, CardInstance, CardType, TriggeredAbility } from "@/game/cards/types";
export { isPermanentCard, hasKeyword, UNIT_CARD_TYPES, PERMANENT_CARD_TYPES } from "@/game/cards/types";
export { CARD_DATABASE, CORE_SET, getCardDefinition } from "@/game/cards/sets/core";
export { computeEffectiveStats } from "@/game/cards/stats";
export type { EffectiveStats } from "@/game/cards/stats";
export { computeEffectiveCost } from "@/game/cards/cost";

export type { DeckList } from "@/game/cards/decks/preconstructed";
export { PRECONSTRUCTED_DECKS, DECK_MAREE_MONTANTE, DECK_ABYSSES_SILENCIEUSES } from "@/game/cards/decks/preconstructed";

export type { GameEvent, GameEventType } from "@/game/events/types";

export type { EffectDefinition, EffectType, TargetSelector } from "@/game/effects/types";
export type { TriggerType } from "@/game/triggers/types";

// --- Environnement : Marée, Eaux, Navires (cadrage sections 4-14) -------
export type {
  TideStateName,
  EnvironmentState,
  WaterDefinition,
  ShipDefinition,
  TideAffinity,
  PendingTideModifier,
} from "@/game/environment/types";
export { TIDE_STATES_ORDER, nextTideState } from "@/game/environment/types";
export { tickTide, consumeAmplify } from "@/game/environment/tide";
export { resolveTideTurnStep, grantIgnoreNextTideDamage } from "@/game/environment/resolveEnvironment";
export { WATER_DATABASE, WATER_SET, WATER_POOL, getWaterDefinition } from "@/game/environment/waterData";
export { SHIP_DATABASE, SHIP_SET, getShipDefinition } from "@/game/environment/shipData";

export { resolveOceanJudgment } from "@/game/rules/oceanJudgment";

export { RULES } from "@/game/rules/constants";
