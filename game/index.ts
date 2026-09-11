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
  BreakObjectAction,
  AdvancePhaseAction,
  ActivateReactionAction,
  PassReactionAction,
  ActionResult,
} from "@/game/actions/types";

export type { CardDefinition, CardInstance, CardType, TriggeredAbility, GraveyardCause } from "@/game/cards/types";
export {
  isPermanentCard,
  isVisibleDuringTide,
  hasKeyword,
  getMaxCopies,
  DEFAULT_MAX_COPIES,
  UNIT_CARD_TYPES,
  PERMANENT_CARD_TYPES,
  STATUS_MALADE,
  STATUS_IMMOBILISE,
  STATUS_SILENCE,
} from "@/game/cards/types";
export { CARD_DATABASE, CORE_SET, getCardDefinition } from "@/game/cards/sets/core";
export { computeEffectiveStats, computeStatModifierDelta } from "@/game/cards/stats";
export type { EffectiveStats } from "@/game/cards/stats";

export type { DeckList } from "@/game/cards/decks/preconstructed";
export {
  PRECONSTRUCTED_DECKS,
  DECK_LE_COURLIS,
  DECK_LERRANT,
  DECK_LE_BRISE_LAMES,
} from "@/game/cards/decks/preconstructed";
export { validateDeckList } from "@/game/rules/deckValidation";

export type { GameEvent, GameEventType } from "@/game/events/types";

export type { EffectDefinition, EffectType, TargetSelector } from "@/game/effects/types";
export type { PendingReactionCandidate, TriggerEvent, TriggerType } from "@/game/triggers/types";
export type { PendingReactionState } from "@/game/state/types";
export { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";

// --- Environnement : Marée, Navires (cadrage sections 4-14, orientation
// de Marée et éviction des Eaux : 2026-09-10) ---------------------------
export type {
  TideStateName,
  TideOrientation,
  EnvironmentState,
  ShipDefinition,
  TideAffinity,
  PendingTideModifier,
} from "@/game/environment/types";
export { TIDE_STATES_ORDER, advanceTideState, naturalOrientationFor } from "@/game/environment/types";
export { tickTide, consumeAmplify } from "@/game/environment/tide";
export { resolveTideTurnStep, grantIgnoreNextTideDamage } from "@/game/environment/resolveEnvironment";
export { SHIP_DATABASE, SHIP_SET, getShipDefinition } from "@/game/environment/shipData";

export { resolveOceanJudgment } from "@/game/rules/oceanJudgment";

export { RULES } from "@/game/rules/constants";

export { runBotTurn } from "@/game/bot/runBotTurn";
export type { BotDifficulty } from "@/game/bot/types";
