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
export { getPlayer, getOpponent, findCardInstance, isMainPhase, MAIN_PHASES } from "@/game/state/types";
export { hiddenZoneCards, toPlayerView } from "@/game/state/playerView";
export { shipAbilityView, isShipArmed } from "@/game/state/shipAbility";
export type { ShipAbilityView } from "@/game/state/shipAbility";
export { HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";

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
  ActivateShipAbilityAction,
  FireShipAbilityAction,
  ConcedeAction,
  ActionResult,
} from "@/game/actions/types";

export type {
  CardDefinition,
  CardInstance,
  CardType,
  TriggeredAbility,
  GraveyardCause,
  StatModifier,
  StatModifierDuration,
} from "@/game/cards/types";
export {
  isPermanentCard,
  isVisibleDuringTide,
  hasResistance,
  hasKeyword,
  getMaxCopies,
  DEFAULT_MAX_COPIES,
  UNIT_CARD_TYPES,
  PERMANENT_CARD_TYPES,
  EQUIPPABLE_CARD_TYPES,
  STATUS_MALADE,
  STATUS_IMMOBILISE,
  STATUS_SILENCE,
} from "@/game/cards/types";
export { CARD_DATABASE, CORE_SET, getCardDefinition, canBeEquipTarget, hasAnyValidEquipTarget } from "@/game/cards/sets/core";
export { isAbyssalVariant } from "@/game/cards/types";
export { hasKeywordInContext, type KeywordContext } from "@/game/rules/validation";
export { collectAuraContributions } from "@/game/cards/stats";
export type { AuraContext, AuraContribution } from "@/game/cards/stats";
export { computeEffectiveStats, computeStatModifierDelta } from "@/game/cards/stats";
export type { EffectiveStats } from "@/game/cards/stats";

export type { DeckList } from "@/game/cards/decks/preconstructed";
export {
  PRECONSTRUCTED_DECKS,
  DECK_LE_COURLIS,
  DECK_LERRANT,
  DECK_LE_BRISE_LAMES,
} from "@/game/cards/decks/preconstructed";
export { ARCHETYPE_DECKS, CRA_POISCAIL_TEST_DECKS, THEATRE_TEST_DECKS, PLAYABLE_DECKS } from "@/game/cards/decks/testDecks";
export { validateDeckList } from "@/game/rules/deckValidation";

// --- Catalogue de decks fournis par le jeu (Notion « Progression joueur »
// §3 et §4) : decks d'emprunt gratuits et préconstruits à Jeton, plus le
// calcul « possédé / prêté » qui les accompagne partout dans l'interface.
export {
  BORROWED_DECKS,
  CATALOG_DECKS,
  PRECON_DECKS,
  catalogDeckById,
  isBorrowedDeckId,
  isPreconDeckId,
} from "@/game/cards/decks/catalog";
export type { CatalogDeck, DeckDifficulty } from "@/game/cards/decks/catalog";
export { deckOwnership, ownershipLabel } from "@/game/cards/decks/ownership";
export type { DeckCardOwnership, DeckOwnership } from "@/game/cards/decks/ownership";

// --- Économie (Notion « Progression joueur » §5) ------------------------
export { BOOSTER_STANDARD_PRICE, CURRENCY_NAME, STANDARD_BOOSTER_ID, TIDE_REWARD } from "@/game/economy";
export type { TideRewardTier } from "@/game/economy";

// --- Tutoriel (Notion « Progression joueur » §2) ------------------------
export { TUTORIAL_OPENING_TYPES, TUTORIAL_STEPS, tutorialProgress } from "@/game/tutorial";
export type { TutorialProgress, TutorialStep } from "@/game/tutorial";

// --- Exploits (Notion « Progression joueur » §10) -----------------------
export { ACHIEVEMENT_CATALOG, achievementByCode, unlockedAchievements } from "@/game/achievements";
export type { AchievementDefinition, AchievementStats } from "@/game/achievements";

export type { GameEvent, GameEventType } from "@/game/events/types";

export type { ChosenUnitFilter, EffectDefinition, EffectType, TargetSelector } from "@/game/effects/types";
export { chosenTargetFilter, eligibleChosenUnits } from "@/game/effects/chosenTargets";
export { ARCHETYPE_LABELS } from "@/game/cards/archetypes";
export type { ArchetypeId } from "@/game/cards/archetypes";
export type { PendingReactionCandidate, TriggerEvent, TriggerType } from "@/game/triggers/types";
export type { PendingReactionState, PendingChoice, HandDiscardChoice } from "@/game/state/types";
export type { ResolveChoiceAction } from "@/game/actions/types";
export { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";

// --- Environnement : Marée, Navires (cadrage sections 4-14, orientation
// de Marée et éviction des Eaux : 2026-09-10) ---------------------------
export type {
  TideStateName,
  TideOrientation,
  EnvironmentState,
  ShipDefinition,
  ShipActivatableAbility,
  ShipArmedShot,
  TideAffinity,
  PendingTideModifier,
} from "@/game/environment/types";
export { TIDE_STATES_ORDER, advanceTideState, naturalOrientationFor } from "@/game/environment/types";
export { tickTide, consumeAmplify } from "@/game/environment/tide";
export { resolveTideTurnStep, grantIgnoreNextTideDamage } from "@/game/environment/resolveEnvironment";
export { SHIP_DATABASE, SHIP_SET, getShipDefinition } from "@/game/environment/shipData";

export { resolveOceanJudgment } from "@/game/rules/oceanJudgment";

export { RULES } from "@/game/rules/constants";

// --- Déraison (Raison négative, piste à prototyper du 2026-09-12) --------
export { reasonCeiling, deraisonDebt, deraisonAnchorDamage } from "@/game/state/reason";
export { previewPlayCardReason } from "@/game/actions/playCard";
export { handBreakCost, previewBreakReason, previewHandBreakReason } from "@/game/actions/breakObject";
export {
  graveyardChoicesForAbility,
  graveyardChoicesForBreak,
  graveyardChoicesForPlay,
} from "@/game/effects/graveyardChoices";

export { botHasSomethingToDo, runBotTurn, runBotUntilIdle, stepBotTurn, type BotTurnStep } from "@/game/bot/runBotTurn";
export type { BotDifficulty } from "@/game/bot/types";

// --- Cosmétiques -------------------------------------------------------
export {
  isCosmeticUnlocked,
  isFree,
  unlockLabel,
  unlockProgress,
  type CosmeticSkin,
  type CosmeticUnlock,
} from "@/game/cosmetics/unlock";
export {
  CARD_BACKS,
  CARD_BACK_COSMETIC_KIND,
  DEFAULT_CARD_BACK_ID,
  PENDING_CARD_BACK_IDS,
  UNLOCKABLE_CARD_BACK_IDS,
  cardBackById,
  cardBackSrc,
  type CardBackSkin,
} from "@/game/cosmetics/cardBacks";
export {
  DEFAULT_SHIP_FRAME_ID,
  SHIP_FRAMES,
  SHIP_FRAME_COSMETIC_KIND,
  UNLOCKABLE_SHIP_FRAME_IDS,
  shipFrameById,
  type ShipFrameSkin,
} from "@/game/cosmetics/shipFrames";
export {
  COLLECTABLE_FAMILIES,
  collectablePrice,
  purchasableCollectables,
  unlockedCollectables,
  type CollectableFamily,
  type CollectableGrant,
} from "@/game/cosmetics/collectables";
