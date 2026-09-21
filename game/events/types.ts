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
  | "ENTER_EFFECTS_REPEATED"
  | "DESTROY"
  | "BUFF_APPLIED"
  | "DEBUFF_APPLIED"
  | "RESOURCE_CHANGED"
  | "REASON_CHANGED"
  | "CARD_MOVED"
  | "DURATION_CHANGED"
  | "ATTACK_INTERCEPTED"
  | "TURN_STARTED"
  | "END_TURN"
  | "TIDE_ADVANCED"
  | "TIDE_MODIFIED"
  | "TIDE_ORIENTATION_CHANGED"
  | "SABORDED"
  | "STRUCTURE_REVEALED"
  | "OBJECT_BROKEN"
  | "OCEAN_JUDGMENT"
  | "GAME_ENDED"
  | "PHASE_CHANGED"
  | "STATUS_CHANGED"
  | "REACTION_WINDOW_OPENED"
  | "REACTION_ACTIVATED"
  | "REACTION_PASSED"
  | "HAND_CARD_REVEALED"
  | "DERAISON_SETTLED"
  | "SHIP_ABILITY_ACTIVATED"
  | "SHIP_ABILITY_FIRED";

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
  /**
   * Ancrage du Navire APRÈS ce coup — renseigné uniquement pour les dégâts
   * à un joueur (`targetPlayerId`). L'Ancrage n'est jamais borné à 0 : une
   * valeur négative est un dépassement, et `0` signifie donc que le coup a
   * porté EXACTEMENT ce qu'il fallait.
   *
   * Sans lui, un observateur du journal sait qu'un Navire est tombé, pas
   * s'il est tombé au point exact — l'information n'existe nulle part
   * ailleurs, puisque l'Ancrage bouge aussi par soin et par Marée.
   */
  targetAnchorAfter?: number;
  /**
   * Rôle de ce coup dans une attaque : `"strike"` = les dégâts que
   * l'attaquant porte à sa cible (unité ou Navire), `"retaliation"` = la
   * riposte du défenseur. Absent pour tout le reste (Contrecoup renvoyé,
   * contrecoup d'attaque directe, dégâts d'une capacité) : l'animation
   * d'attaque ne lit QUE ces deux-là, sans deviner d'après l'ordre du lot.
   */
  combat?: "strike" | "retaliation";
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

/**
 * L'effet d'arrivée d'un permanent EN JEU est rejoué (Colombina aux Cent
 * Visages, « répétez son effet d'arrivée »). La carte ne bouge pas : c'est
 * son déclencheur `onEnterPlay` qui se rallume — capacités automatiques
 * comme facultatives, exactement comme à sa vraie arrivée.
 */
export interface EnterEffectsRepeatedEvent extends BaseGameEvent {
  type: "ENTER_EFFECTS_REPEATED";
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

/**
 * La durée restante d'un permanent a changé (`durationLoss`). Émis pour que
 * le journal et l'interface puissent montrer qu'une carte vient de perdre du
 * temps — sans quoi la Structure semblait expirer sans raison au tour
 * suivant.
 */
/** Un piège a annulé les dégâts directs d'une attaque (`cancelIncomingAttack`). */
export interface AttackInterceptedEvent extends BaseGameEvent {
  type: "ATTACK_INTERCEPTED";
  attackerInstanceId: string;
}

export interface DurationChangedEvent extends BaseGameEvent {
  type: "DURATION_CHANGED";
  instanceId: string;
  /** Négatif quand la durée est retirée. */
  delta: number;
  /** Tours restants APRÈS l'effet. 0 = expirera au prochain début de tour de son contrôleur. */
  turnsRemaining: number;
}

export interface CardMovedEvent extends BaseGameEvent {
  type: "CARD_MOVED";
  instanceId: string;
  fromZone: string;
  toZone: string;
  /**
   * Identité de la carte déplacée, et exemplaire d'ARRIVÉE quand le
   * déplacement en crée un neuf (un retour en main repart d'une carte
   * vierge, donc d'un nouvel `instanceId`).
   *
   * Sans eux, un observateur du journal devrait retrouver la carte dans la
   * zone de destination pour savoir de laquelle il s'agit — impossible dès
   * que l'`instanceId` change. Renseignés par les déplacements qui les
   * connaissent, absents des plus anciens.
   */
  cardId?: string;
  toInstanceId?: string;
  /** Propriétaire de la carte déplacée. */
  ownerId?: PlayerId;
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
  /** Sens de la prochaine transition après ce tick (cadrage 2026-09-10). */
  tideOrientation: "montante" | "descendante";
  stateChanged: boolean;
}

/**
 * Un effet de carte a manipulé la Marée SANS la faire changer d'état :
 * durée raccourcie/prolongée, Intensité fixée ou modifiée, modificateur
 * « maintenez cet état » / « doublez les prochains dégâts » posé.
 *
 * Ces effets ne modifiaient rien d'observable dans le journal, alors qu'ils
 * sont bel et bien des manipulations de Marée : sans cet événement, la
 * quête « Modifier la Marée N fois » (Notion Progression §9) ne pourrait
 * les compter, et le joueur ne verrait jamais dans le journal ce que sa
 * carte vient de faire.
 */
export interface TideModifiedEvent extends BaseGameEvent {
  type: "TIDE_MODIFIED";
  /** Quelle facette de la Marée a bougé. */
  change: "duration" | "intensity" | "maintain" | "amplify";
  /** Valeur résultante (tours restants, Intensité) ou nombre de déclenchements posés. */
  value: number;
}

/** Un effet de carte a inversé l'orientation de la Marée (hors tick naturel de début/fin de tour). */
export interface TideOrientationChangedEvent extends BaseGameEvent {
  type: "TIDE_ORIENTATION_CHANGED";
  orientation: "montante" | "descendante";
}

/** Un joueur sabordé volontairement un de ses permanents (consomme l'action principale). */
export interface SabordedEvent extends BaseGameEvent {
  type: "SABORDED";
  playerId: PlayerId;
  instanceId: string;
  /** Identité de la carte sabordée — portée par un Sabordage FORCÉ (effet `saborde`), dont les déclencheurs se réveillent après coup (`processSabordedTriggers`). */
  cardId?: string;
}

/**
 * Une Structure vient de DEVENIR visible (transition de Marée vers l'un de
 * ses `visibleDuringTide`). Porte le même contenu que le déclencheur
 * `onBecomeVisible`, pour que les réactions facultatives à cette
 * transition (ex: Épave à Fleur d'Eau) puissent être proposées dans la
 * fenêtre de réaction qui suit la fin de tour.
 */
export interface StructureRevealedEvent extends BaseGameEvent {
  type: "STRUCTURE_REVEALED";
  playerId: PlayerId;
  instanceId: string;
  cardId: string;
}

/**
 * Un joueur vient de Briser un de ses Objets — depuis le plateau ou
 * depuis sa main (`fromHand`). Émis EN PLUS du `CARD_MOVED` vers le
 * cimetière, parce que "Briser" est un fait de jeu distinct auquel des
 * cartes réagissent ("la première fois à chaque tour que vous Brisez un
 * Objet") : le seul déplacement de zone ne le distingue pas d'un
 * Sabordage ou d'une destruction.
 */
export interface ObjectBrokenEvent extends BaseGameEvent {
  type: "OBJECT_BROKEN";
  playerId: PlayerId;
  instanceId: string;
  cardId: string;
  fromHand: boolean;
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

/** Le joueur actif a avancé d'une phase : Principale → Combat → Principale 2 (`game/actions/advancePhase.ts`). */
export interface PhaseChangedEvent extends BaseGameEvent {
  type: "PHASE_CHANGED";
  playerId: PlayerId;
  /** Phase ATTEINTE par ce changement. */
  phase: "mainPhase" | "combatPhase" | "mainPhase2";
}

/**
 * Un statut ponctuel (ex: `STATUS_MALADE`, posé par la Houle — voir
 * `game/environment/resolveEnvironment.ts`) est appliqué ou retiré d'une
 * carte du plateau.
 */
export interface StatusChangedEvent extends BaseGameEvent {
  type: "STATUS_CHANGED";
  targetInstanceId: string;
  status: string;
  applied: boolean;
}

/**
 * Une fenêtre de réaction vient de s'ouvrir : au moins un joueur a une
 * capacité `mode: "optional"` actuellement éligible en réponse à
 * l'action qui vient de se résoudre (`game/reactions/`).
 */
export interface ReactionWindowOpenedEvent extends BaseGameEvent {
  type: "REACTION_WINDOW_OPENED";
  /** Joueur à qui la priorité est offerte en premier. */
  playerId: PlayerId;
}

/** Un joueur a activé une capacité facultative éligible pendant une fenêtre de réaction. */
export interface ReactionActivatedEvent extends BaseGameEvent {
  type: "REACTION_ACTIVATED";
  playerId: PlayerId;
  sourceInstanceId: string;
}

/** Un joueur a passé sa priorité pendant une fenêtre de réaction (rien à activer, ou choix délibéré). */
export interface ReactionPassedEvent extends BaseGameEvent {
  type: "REACTION_PASSED";
  playerId: PlayerId;
}

/**
 * Une carte de la main de `ownerId` a été révélée (ex: Guetteur de Brume,
 * La Bouée qui Regardait, Cloche Immergée) — purement informatif : ne
 * déplace ni ne modifie la carte elle-même, jamais suffisant à lui seul
 * pour reconstituer l'état (l'UI décide qui a le droit de voir `cardId`).
 */
export interface HandCardRevealedEvent extends BaseGameEvent {
  type: "HAND_CARD_REVEALED";
  ownerId: PlayerId;
  instanceId: string;
  cardId: string;
}

/**
 * Règlement de la Déraison à la fin du tour de `playerId` (après tous les
 * effets de fin de tour) : `debt` points sous 0 convertis en `anchorDamage`
 * dégâts d'Ancrage (après réduction éventuelle du Navire), puis Raison
 * remise à 0. Émis en plus du `DAMAGE` correspondant, pour que les cartes
 * puissent plus tard réagir spécifiquement aux "dégâts de Déraison".
 */
export interface DeraisonSettledEvent extends BaseGameEvent {
  type: "DERAISON_SETTLED";
  playerId: PlayerId;
  debt: number;
  anchorDamage: number;
}

/**
 * Capacité activable du Navire déclenchée par son contrôleur. `armed` dit
 * si l'activation a ARMÉ le Navire (capacité en deux temps) plutôt que de
 * tout résoudre sur-le-champ — c'est ce que l'interface traduit par « les
 * planches s'écartent ».
 */
export interface ShipAbilityActivatedEvent extends BaseGameEvent {
  type: "SHIP_ABILITY_ACTIVATED";
  playerId: PlayerId;
  shipId: string;
  abilityName: string;
  armed: boolean;
}

/**
 * Tir de la capacité armée. `targetInstanceId` absent = le tir visait le
 * Navire adverse, comme une attaque directe. Les DÉGÂTS eux-mêmes sont
 * journalisés séparément par les `DAMAGE` que les effets produisent : cet
 * événement dit le geste, pas son résultat.
 */
export interface ShipAbilityFiredEvent extends BaseGameEvent {
  type: "SHIP_ABILITY_FIRED";
  playerId: PlayerId;
  shipId: string;
  abilityName: string;
  targetInstanceId?: string;
}

export type GameEvent =
  | AttackInterceptedEvent
  | DurationChangedEvent
  | DrawCardEvent
  | PlayCardEvent
  | AttackEvent
  | DamageEvent
  | HealEvent
  | SummonEvent
  | EnterEffectsRepeatedEvent
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
  | TideModifiedEvent
  | TideOrientationChangedEvent
  | SabordedEvent
  | StructureRevealedEvent
  | ObjectBrokenEvent
  | OceanJudgmentEvent
  | PhaseChangedEvent
  | StatusChangedEvent
  | ReactionWindowOpenedEvent
  | ReactionActivatedEvent
  | ReactionPassedEvent
  | HandCardRevealedEvent
  | DeraisonSettledEvent
  | ShipAbilityActivatedEvent
  | ShipAbilityFiredEvent;
