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
