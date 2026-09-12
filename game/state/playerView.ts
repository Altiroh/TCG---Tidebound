import { HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide, type CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Projection d'une partie pour UN destinataire — la seule forme de
 * `GameState` qui ait le droit de quitter le serveur.
 *
 * Le moteur a besoin de l'état complet (mains, ordre des decks, graine du
 * générateur aléatoire) ; un client, non. Lui envoyer l'état complet, c'est
 * lui laisser lire la main adverse dans les outils de développement, et
 * surtout PRÉDIRE : avec `rngState` et l'ordre des decks, un client peut
 * simuler toutes les pioches et tous les tirages aléatoires à venir.
 *
 * Ce qui est masqué :
 *   - la main de l'adversaire (le nombre de cartes reste visible) ;
 *   - l'ordre ET le contenu des deux decks, y compris celui du destinataire
 *     (seul le nombre de cartes reste visible) ;
 *   - la graine du générateur aléatoire ;
 *   - une Structure adverse invisible pendant la Marée courante
 *     (`visibleDuringTide`) : son Slot et son `instanceId` restent visibles
 *     — on peut la cibler — mais pas son identité ni ses compteurs ;
 *   - les traces de ces informations dans le journal d'événements et dans la
 *     fenêtre de réaction en cours.
 *
 * Ce qui reste public : plateau visible, cimetières, Ancrage, Raison, Marée,
 * choix et réactions en attente. Une carte révélée par un effet
 * (`HAND_CARD_REVEALED`) garde son identité dans le journal : c'est
 * précisément l'information que l'effet donne au joueur.
 *
 * La forme de l'état est conservée (mêmes tableaux, mêmes longueurs, même
 * nombre d'événements) pour que l'UI existante n'ait rien à changer : les
 * cartes masquées portent `HIDDEN_CARD_ID`, que `getCardDefinition` sait
 * résoudre. Une vue ne doit JAMAIS être repassée au moteur.
 */
export function toPlayerView(state: GameState, viewerId: PlayerId): GameState {
  const hiddenBoardIds = new Set<string>();
  for (const player of state.players) {
    if (player.id === viewerId) continue;
    for (const unit of player.board) {
      if (!isVisibleDuringTide(getCardDefinition(unit.cardId), state.environment.tideState)) {
        hiddenBoardIds.add(unit.instanceId);
      }
    }
  }

  const players = state.players.map((player) => projectPlayer(player, viewerId, hiddenBoardIds)) as [
    PlayerState,
    PlayerState,
  ];

  return {
    ...state,
    players,
    rngState: 0,
    eventLog: state.eventLog.map((event) => projectEvent(event, viewerId, hiddenBoardIds)),
    pendingReaction: state.pendingReaction && {
      ...state.pendingReaction,
      events: state.pendingReaction.events.map((event) =>
        event.sourceInstanceId && hiddenBoardIds.has(event.sourceInstanceId) && event.cardId
          ? { ...event, cardId: HIDDEN_CARD_ID }
          : event
      ),
    },
  };
}

/** Instances de substitution : identifiants positionnels, pour qu'aucune carte masquée ne puisse être suivie d'une zone à l'autre. */
function hiddenCards(cards: CardInstance[], ownerId: PlayerId, zone: "hand" | "deck"): CardInstance[] {
  return cards.map((_, index) => ({
    instanceId: `hidden_${ownerId}_${zone}_${index}`,
    cardId: HIDDEN_CARD_ID,
    ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  }));
}

function projectPlayer(player: PlayerState, viewerId: PlayerId, hiddenBoardIds: Set<string>): PlayerState {
  const isViewer = player.id === viewerId;
  return {
    ...player,
    deck: hiddenCards(player.deck, player.id, "deck"),
    hand: isViewer ? player.hand : hiddenCards(player.hand, player.id, "hand"),
    board: player.board.map((unit) =>
      hiddenBoardIds.has(unit.instanceId)
        ? {
            // L'emplacement, les dégâts subis, les statuts et un éventuel
            // Équipement attaché se voient sur le plateau ; la durée restante,
            // les modificateurs et les compteurs "une fois par tour"
            // suffiraient à reconnaître la carte.
            instanceId: unit.instanceId,
            cardId: HIDDEN_CARD_ID,
            ownerId: unit.ownerId,
            damageMarked: unit.damageMarked,
            modifiers: [],
            summoningSick: unit.summoningSick,
            hasAttackedThisTurn: unit.hasAttackedThisTurn,
            statuses: unit.statuses,
            attachedToInstanceId: unit.attachedToInstanceId,
          }
        : unit
    ),
  };
}

function projectEvent(event: GameEvent, viewerId: PlayerId, hiddenBoardIds: Set<string>): GameEvent {
  switch (event.type) {
    case "DRAW_CARD":
      // L'instance piochée par l'adversaire est dans sa main, donc masquée :
      // son identifiant permettrait de la suivre jusqu'à sa pose.
      return event.playerId === viewerId ? event : { ...event, instanceId: "hidden" };
    case "PLAY_CARD":
    case "SUMMON":
      return hiddenBoardIds.has(event.instanceId) ? { ...event, cardId: HIDDEN_CARD_ID } : event;
    default:
      return event;
  }
}
