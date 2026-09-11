/**
 * Types d'événements du jeu auxquels une carte peut réagir via
 * `abilities` (voir `game/cards/types.ts`). Séparé de `game/events/types.ts` :
 * les `GameEvent` sont le journal *passé* (pour replay/debug), les
 * `TriggerType` sont les points d'accroche que le moteur utilise pour
 * savoir quelles capacités déclencher.
 */
export type TriggerType =
  | "onPlay" // la carte elle-même est jouée
  | "onEnterPlay" // une unité arrive en jeu (soi-même ou une autre, voir condition)
  | "onDeath" // une unité meurt
  | "onSaborde" // une unité a été volontairement sabordée par son contrôleur (déclenché en plus de onDeath)
  | "onAttack" // une unité attaque
  | "onDamaged" // une unité subit des dégâts
  | "startOfTurn"
  | "endOfTurn"
  | "onCardPlayed" // n'importe quelle carte est jouée par n'importe qui
  | "onTideStateEntered" // la Marée vient d'entrer dans un nouvel état
  | "onBecomeVisible" // une Structure devient visible pour l'adversaire (entrée dans un de ses `visibleDuringTide`)
  | "onExpire" // une Structure/Objet à durée limitée quitte le board par expiration (ni mort, ni Sabordage)
  | "onCondition"; // condition arbitraire évaluée par un `ConditionExpression`

export interface TriggerEvent {
  trigger: TriggerType;
  /** instanceId de l'unité concernée par l'événement, si applicable. */
  sourceInstanceId?: string;
  /** cardId de la carte jouée, pour onPlay / onCardPlayed. */
  cardId?: string;
  playerId?: string;
  /** État de Marée qui vient d'être atteint, pour onTideStateEntered. */
  tideState?: import("@/game/environment/types").TideStateName;
}

/**
 * Une capacité `mode: "optional"` actuellement éligible pour un
 * `TriggerEvent` donné : son contrôleur peut l'activer via une fenêtre de
 * réaction (`game/reactions/`), ou passer. Recalculée à chaque étape
 * plutôt que mise en cache — l'éligibilité (coût payable, cible
 * disponible) peut changer entre deux étapes de la même fenêtre.
 */
export interface PendingReactionCandidate {
  controllerId: string;
  sourceInstanceId: string;
  cardId: string;
  /** Index de la capacité dans `CardDefinition.abilities` — identifie précisément laquelle activer. */
  abilityIndex: number;
  /** Coût en Raison à payer pour activer cette capacité (0 si aucun). */
  reasonCost: number;
  /** `true` si au moins un de ses effets cible `chosenUnit` : `activateReaction` doit alors recevoir `targetInstanceId`. */
  needsTarget: boolean;
}
