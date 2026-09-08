import type { CardInstance } from "@/game/cards/types";
import type { EnvironmentState } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import type { RngState } from "@/game/rng";

export type PlayerId = string;

export type Zone = "deck" | "hand" | "board" | "graveyard";

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
  reasonMax: number;
  /**
   * Une seule action principale par tour (jouer une carte OU Saborder OU
   * passer) — cadrage "Mécaniques verrouillées" sections 28-29 et 37.
   * Remis à `false` au début de chaque tour de ce joueur.
   */
  hasUsedMainActionThisTurn: boolean;
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

  status: "active" | "finished";
  winnerId?: PlayerId;
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
