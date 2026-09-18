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
 * Fait passer le joueur actif de la Phase principale à la Phase de combat
 * (cadrage "Structure de tour" : Phase principale → Phase de combat → Fin
 * de tour). Ne consomme pas l'action principale du tour — jouer une carte
 * (ou Saborder/Briser) reste possible avant de l'invoquer, mais plus
 * après : ces actions sont réservées à la Phase principale, les attaques à
 * la Phase de combat.
 */
export interface AdvancePhaseAction {
  type: "advancePhase";
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

/**
 * Brise un Objet que le joueur contrôle : résout `onBreakEffects` puis
 * l'envoie au cimetière. Consomme l'action principale du tour. Distinct du
 * Sabordage — ne déclenche ni `onDeath` ni `onSaborde` (cadrage : "Briser
 * ≠ Saborder sauf texte contraire").
 */
export interface BreakObjectAction {
  type: "breakObject";
  playerId: PlayerId;
  instanceId: string;
  /**
   * Brise l'Objet directement depuis la MAIN (Notion, règle prototype) : coût = moitié du coût imprimé arrondie
   * au supérieur, minimum 1 Raison (`handBreakCost`) ; ne prend aucun Slot, va directement en défausse.
   */
  fromHand?: boolean;
  /** Requis si l'effet de bris de cet Objet cible `chosenUnit`. */
  targetInstanceId?: string;
  /** Requis si l'effet de bris de cet Objet est `moveGraveyardCardToHand` ET qu'au moins une carte éligible existe dans la défausse (ex: Grappin de Récupération). */
  chosenGraveyardInstanceId?: string;
}

/**
 * Active une capacité `mode: "optional"` actuellement éligible pendant
 * une fenêtre de réaction (`GameState.pendingReaction`). `sourceInstanceId`
 * + `abilityIndex` identifient précisément la capacité (une carte peut en
 * porter plusieurs). Refusée si elle ne figure plus dans les candidats
 * éligibles au moment de la résolution (recalculés à chaque étape).
 */
export interface ActivateReactionAction {
  type: "activateReaction";
  playerId: PlayerId;
  sourceInstanceId: string;
  abilityIndex: number;
  /** Requis si l'effet de cette capacité cible `chosenUnit`. */
  targetInstanceId?: string;
}

/** Passe la priorité pendant une fenêtre de réaction — n'active rien. */
export interface PassReactionAction {
  type: "passReaction";
  playerId: PlayerId;
}

/**
 * Active la capacité `CardDefinition.activatableOncePerTurn` d'une carte du
 * plateau du joueur — discrétionnaire, jamais déclenchée par un événement
 * de jeu (contrairement à `ActivateReactionAction`, réservée aux fenêtres
 * de réaction). Consomme le coût indiqué par la carte, pas l'action
 * principale du tour (peut se combiner librement avec `playCard`/
 * `saborder`/`breakObject`, comme toutes les actions de Phase principale).
 */
export interface ActivateAbilityAction {
  type: "activateAbility";
  playerId: PlayerId;
  sourceInstanceId: string;
  /** Requis si un effet de cette capacité cible `chosenUnit`. */
  targetInstanceId?: string;
}

/**
 * Active la capacité activable du NAVIRE du joueur
 * (`ShipDefinition.activatableAbility`) : paie son coût et, selon la
 * capacité, résout ses effets immédiats ou arme son tir différé. Ne
 * consomme pas l'action principale du tour. Aucune cible ici — une capacité
 * en deux temps désigne la sienne au moment du tir (`FireShipAbilityAction`).
 */
export interface ActivateShipAbilityAction {
  type: "activateShipAbility";
  playerId: PlayerId;
}

/**
 * Tire avec la capacité de Navire précédemment ARMÉE (`ShipArmedShot`). La
 * cible suit les règles d'une attaque : `targetInstanceId` absent = le
 * Navire adverse, comme une attaque directe.
 */
export interface FireShipAbilityAction {
  type: "fireShipAbility";
  playerId: PlayerId;
  /** Permanent adverse visé. Absent = le Navire adverse (refusé si un permanent adverse porte Garde). */
  targetInstanceId?: string;
}

/**
 * Résout le choix binaire en attente (`GameState.pendingChoice`, ex: Le
 * Fond Vous Regarde) — seule action acceptée tant qu'un choix est ouvert,
 * exactement comme `ActivateReactionAction`/`PassReactionAction` pour une
 * fenêtre de réaction.
 */
export interface ResolveChoiceAction {
  type: "resolveChoice";
  playerId: PlayerId;
  /**
   * Choix binaire d'une Anomalie ("reasonLoss"/"anchorDamage"), option d'une
   * capacité (`{ abilityIndex }`, cf. `AbilityOptionChoice`), ou "pass" pour
   * ne rien appliquer — un joueur peut toujours refuser un effet qu'on lui
   * propose (décision du 17/09/2026). Une Anomalie qui IMPOSE un choix, elle,
   * refuse "pass" : son texte ne laisse pas sortir.
   */
  choice:
    | "reasonLoss"
    | "anchorDamage"
    | "pass"
    | { abilityIndex: number }
    /** Réponse à un choix de défausse : les exemplaires de SA MAIN que le joueur envoie au Cimetière. */
    | { discardInstanceIds: string[] };
}

/**
 * Abandon volontaire ("abandonner le navire") : l'adversaire gagne
 * immédiatement. Acceptée à tout moment, quel que soit le joueur actif, la
 * phase, ou une fenêtre de réaction ouverte (cf. `dispatch`).
 */
export interface ConcedeAction {
  type: "concede";
  playerId: PlayerId;
}

export type PlayerAction =
  | PlayCardAction
  | AttackAction
  | EndTurnAction
  | SaborderAction
  | BreakObjectAction
  | AdvancePhaseAction
  | ActivateReactionAction
  | PassReactionAction
  | ActivateAbilityAction
  | ActivateShipAbilityAction
  | FireShipAbilityAction
  | ResolveChoiceAction
  | ConcedeAction;

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
