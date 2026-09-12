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
}

export type GamePhase =
  | "waitingForPlayers"
  | "mainPhase"
  | "combatPhase"
  | "finished";

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

  status: "active" | "finished";
  winnerId?: PlayerId;
}

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
