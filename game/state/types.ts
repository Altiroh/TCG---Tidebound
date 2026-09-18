import type { CardInstance } from "@/game/cards/types";
import type { EnvironmentState } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import type { RngState } from "@/game/rng";
import type { TriggerEvent } from "@/game/triggers/types";

export type PlayerId = string;

export type Zone = "deck" | "hand" | "board" | "graveyard";

/**
 * Drapeau `PlayerState.statusFlags` : ce joueur ne peut récupérer aucune
 * Raison (régénération de début de tour incluse) tant qu'il reste posé (ex:
 * La Gueule Sous la Mer, "jusqu'au début de votre prochain tour, vous ne
 * pouvez pas récupérer de Raison") — retiré automatiquement à la toute
 * PROCHAINE régénération de son porteur (`game/actions/endTurn.ts`), qui
 * est donc celle bloquée, jamais les suivantes.
 */
export const STATUS_NO_REASON_GAIN = "noReasonGainUntilNextTurn";

export interface PlayerState {
  id: PlayerId;
  /** Navire principal choisi pour ce deck : fixe, jamais dans une zone de cartes. */
  shipId: string;
  /** Remplace la notion classique de points de vie (cadrage section 4). */
  anchor: number;
  /**
   * Raison : LA ressource unique du jeu (pas de mana séparé) — paie le coût
   * des cartes, et sa perte totale draine l'Ancrage tant qu'elle reste à 0
   * (cadrage "Navires, Slots et Raison"). Plafonnée par `reasonMax`, propre
   * au Navire choisi.
   */
  reason: number;
  /**
   * Plafond courant de la Raison. Propre au Navire choisi, mais peut être
   * temporairement réduit par un malus continu (ex: -2 pendant les
   * Abysses — Notion "Moteur de partie", section "Malus globaux des
   * Marées") ; restauré dès que le malus se termine.
   */
  reasonMax: number;
  /**
   * Plafond de DÉBUT DE PARTIE (Notion "Gameplay — Raison, Déraison…",
   * courbe 25 % → 50 % → 100 %) : la Raison ne peut pas dépasser
   * `min(reasonMax, reasonCap)`. Relevé au début de chacun des premiers
   * tours du joueur (`RULES.STARTING_REASON_CURVE`). Absent = aucun plafond
   * (parties créées avant cette règle, ou courbe terminée).
   */
  reasonCap?: number;
  deck: CardInstance[];
  hand: CardInstance[];
  board: CardInstance[];
  graveyard: CardInstance[];
  /**
   * Petits drapeaux ponctuels posés par des effets et consommés plus tard
   * (ex: "ignoreNext:abysses" pour "Bouchons de Cire"). Volontairement une
   * simple liste de chaînes plutôt qu'un système dédié : suffisant tant
   * que ces effets restent rares et ponctuels.
   */
  statusFlags: string[];
  /**
   * Réductions de coût en attente, posées par un effet et consommées par
   * la prochaine carte jouée qui correspond (Lot 11 — « la prochaine
   * Marionnette que vous jouez ce tour coûte 1 de moins »).
   *
   * Portées par le JOUEUR et non par la carte : le texte parle de la
   * prochaine carte jouée, laquelle est encore en main — et peut très bien
   * ne jamais être jouée. Nettoyées à la fin du tour où elles ont été
   * posées, comme leur texte l'exige.
   */
  costDiscounts?: CostDiscount[];
  /**
   * Où en est la capacité activable du Navire
   * (`ShipDefinition.activatableAbility`) pour ce joueur. Absent : jamais
   * activée. Porté par le JOUEUR et non par une carte — le Navire n'est pas
   * sur le plateau, il n'a pas d'`oncePerTurnFlags` où s'inscrire.
   */
  shipAbility?: ShipAbilityState;
}

/**
 * Suivi de la capacité de Navire. Tout est HORODATÉ plutôt que remis à zéro
 * en fin de tour : un compteur qui porte son numéro de tour périme tout
 * seul, là où un drapeau booléen dépend d'un nettoyage qu'on finit toujours
 * par oublier quelque part.
 */
export interface ShipAbilityState {
  /** Tour de la dernière activation, et nombre d'activations faites CE tour-là. */
  activations: { turnNumber: number; count: number };
  /**
   * Tour où le Navire a été ARMÉ sans avoir encore tiré (capacité en deux
   * temps). Le tir l'efface ; un tour qui passe le périme — un canon armé
   * et non tiré ne reste pas chargé jusqu'au tour suivant.
   */
  armedOnTurn?: number;
}

/**
 * Une réduction de coût en attente. Aucune ne peut faire descendre un coût
 * sous `MIN_DISCOUNTED_COST` : c'est une règle générale du Lot 11 (« Aucun
 * effet de réduction ne peut faire descendre un coût sous 1 »), appliquée
 * au calcul et non carte par carte.
 */
export interface CostDiscount {
  /** Raison retirée au coût imprimé. */
  amount: number;
  /** Ne s'applique qu'aux cartes de ce sous-type (ex: "marionnette"). */
  subtype?: string;
  /** Ne s'applique qu'aux cartes de ces types. */
  cardTypes?: string[];
  /** Nombre de cartes encore concernées. Décrémenté à chaque usage. */
  uses: number;
  /** Tour au-delà duquel la réduction est perdue (« ce tour »). */
  expiresAfterTurn: number;
}

/** Plancher absolu d'un coût après réduction (Lot 11, règle générale). */
export const MIN_DISCOUNTED_COST = 1;

export type GamePhase =
  | "waitingForPlayers"
  | "mainPhase"
  | "combatPhase"
  /** Seconde Phase principale, après le combat : reposer, Saborder, Briser une fois l'attaque résolue. */
  | "mainPhase2"
  | "finished";

/**
 * Les deux Phases principales du tour. Tout ce qui est "réservé à la Phase
 * principale" (poser une carte, Saborder, Briser un Objet, activer une
 * capacité) vaut pour l'une comme pour l'autre : seul le COMBAT est
 * enfermé dans sa propre phase.
 */
export const MAIN_PHASES = ["mainPhase", "mainPhase2"] as const;

export function isMainPhase(phase: GamePhase): boolean {
  return (MAIN_PHASES as readonly GamePhase[]).includes(phase);
}

export interface GameState {
  id: string;
  createdAt: number;

  players: [PlayerState, PlayerState];

  turnNumber: number;
  activePlayerId: PlayerId;
  /** Le joueur qui a la priorité pour agir (utile plus tard pour les réponses). */
  priorityPlayerId: PlayerId;
  phase: GamePhase;

  rngState: RngState;

  /** État partagé de la Marée et des Eaux (cadrage sections 6-14). */
  environment: EnvironmentState;

  /** Journal complet et ordonné des événements de la partie. */
  eventLog: GameEvent[];

  /**
   * Posé quand un joueur tente de piocher dans un deck vide : au lieu
   * d'une défaite instantanée, la fin de la résolution en cours déclenche
   * le "Jugement de l'Océan" (comparaison de Résilience) — voir
   * `game/rules/oceanJudgment.ts`.
   */
  pendingOceanJudgment?: { playerId: PlayerId };

  /**
   * Fenêtre de réaction ouverte (Notion "Moteur de partie — déroulement,
   * Raison & chaînes d'effets", pipeline étapes 6-9) : au moins un joueur
   * a une capacité `mode: "optional"` actuellement éligible en réponse
   * aux `events` qui viennent de se produire. Tant que ce champ est posé,
   * `awaitingPlayerId` est le SEUL joueur autorisé à agir — uniquement
   * via `activateReaction` ou `passReaction` (`game/reactions/`) ; aucune
   * action normale n'est acceptée (cadrage : "tant qu'un effet, une
   * réaction ou une conséquence est en cours de résolution, aucune
   * nouvelle action normale ne peut être commencée").
   */
  pendingReaction?: PendingReactionState;

  /**
   * Choix forcé en attente pour `playerId` (Notion "Choix de joueur en
   * cours de résolution", ex: Le Fond Vous Regarde — "au début de chaque
   * tour, le joueur actif choisit : perdre X Raison, ou infliger X dégâts
   * d'Ancrage à son propre Navire"). Tant que ce champ est posé, `playerId`
   * est le SEUL joueur autorisé à agir, uniquement via `resolveChoice`
   * (`game/actions/resolveChoice.ts`) — même principe de blocage que
   * `pendingReaction`, mais pour un choix entre deux effets fixes plutôt
   * qu'une capacité facultative.
   */
  pendingChoice?: PendingChoice;

  status: "active" | "finished";
  winnerId?: PlayerId;
}

/**
 * Choix binaire forcé, toujours entre "perdre de la Raison" et "infliger
 * des dégâts d'Ancrage à son propre Navire" — les deux seules branches que
 * le catalogue actuel requiert (Le Fond Vous Regarde). Une carte future aux
 * branches différentes élargirait ce type plutôt que de le généraliser
 * prématurément à des effets arbitraires.
 */
/** Choix binaire forcé d'une Anomalie (ex: Le Fond Vous Regarde) : perdre de la Raison, ou subir des dégâts d'Ancrage. */
export interface ReasonOrAnchorChoice {
  kind: "reasonOrAnchor";
  playerId: PlayerId;
  /** Carte-source de la capacité ayant ouvert ce choix (traçabilité/debug). */
  sourceInstanceId: string;
  reasonLossAmount: number;
  anchorDamageAmount: number;
  turnNumber: number;
}

/**
 * « Choisissez : A ou B » d'une capacité AUTOMATIQUE (`TriggeredAbility.choiceGroup`
 * en mode "auto", ex: Horloge de Marée au Sabordage) : le contrôleur désigne
 * laquelle des capacités du groupe se résout (`resolveChoice`). La carte
 * source peut déjà avoir quitté le board (Sabordage) : `cardId` porte
 * l'identité nécessaire.
 */
export interface AbilityOptionChoice {
  kind: "abilityOption";
  playerId: PlayerId;
  sourceInstanceId: string;
  cardId: string;
  abilityIndexes: number[];
  turnNumber: number;
}

export type PendingChoice = ReasonOrAnchorChoice | AbilityOptionChoice;

export interface PendingReactionState {
  /** Événements déclencheurs ayant ouvert cette fenêtre (contexte pour l'UI/le recalcul d'éligibilité). */
  events: TriggerEvent[];
  /** Joueur actuellement invité à Activer une réaction éligible ou Passer. */
  awaitingPlayerId: PlayerId;
  /** Joueurs restants à consulter après celui-ci, dans l'ordre (file de priorité). */
  priorityQueue: PlayerId[];
  /**
   * Clés `"sourceInstanceId:abilityIndex"` déjà activées PENDANT cette
   * fenêtre : une capacité facultative ne se propose qu'une fois par
   * fenêtre de réaction, même si elle resterait techniquement éligible
   * (coût payable, cible disponible) — évite qu'un joueur la déclenche en
   * boucle tant qu'il peut se le permettre.
   */
  usedCandidateKeys: string[];
  turnNumber: number;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Joueur inconnu dans cette partie: ${playerId}`);
  }
  return player;
}

export function getOpponent(state: GameState, playerId: PlayerId): PlayerState {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) {
    throw new Error(`Adversaire introuvable pour le joueur: ${playerId}`);
  }
  return opponent;
}

export function findCardInstance(
  state: GameState,
  instanceId: string
): { card: CardInstance; owner: PlayerState; zone: Zone } | undefined {
  for (const player of state.players) {
    const zones: [Zone, CardInstance[]][] = [
      ["deck", player.deck],
      ["hand", player.hand],
      ["board", player.board],
      ["graveyard", player.graveyard],
    ];
    for (const [zone, cards] of zones) {
      const card = cards.find((c) => c.instanceId === instanceId);
      if (card) return { card, owner: player, zone };
    }
  }
  return undefined;
}
