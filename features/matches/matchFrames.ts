import { hiddenZoneCards, type CardInstance, type GameState, type PlayerState } from "@/game";
import { HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";

/**
 * Transport des vues d'une partie du serveur vers le navigateur : les vues
 * successives d'un coup (le coup du joueur, puis chaque action du bot), ou
 * la vue unique d'une relecture.
 *
 * Deux redondances y pesaient plus lourd que la partie elle-même (mesuré
 * sur une partie simulée : ~21 Ko par vue, jusqu'à 274 Ko par réponse) :
 *
 *   1. le JOURNAL d'événements complet, répété dans chaque vue. Or le moteur
 *      ne fait qu'y AJOUTER (`game/engine.ts`) : le journal d'une étape
 *      intermédiaire est un préfixe de celui de la dernière. Seule la vue
 *      finale le transporte ; chaque étape ne dit que sa longueur ;
 *   2. les DECKS masqués — une carte factice par carte restante, soit près
 *      de la moitié d'une vue — que `toPlayerView` fabrique de façon
 *      déterministe à partir de leur seule longueur (`hiddenZoneCards`). Le
 *      client les regénère à l'identique.
 *
 * Aucune information supplémentaire ne sort : tout ce qui est reconstruit
 * vient de la vue finale, projetée pour le même destinataire. Seul effet
 * visible : pendant le rejeu, un événement ancien apparaît projeté comme à
 * la FIN du coup (ex. une Structure devenue visible entre-temps est nommée
 * un peu plus tôt).
 */
export interface PackedView {
  view: GameState;
  /** Longueur du journal de cette vue, repris de la vue finale. `null` : journal transporté tel quel. */
  eventCount: number | null;
  /** Longueur du deck masqué de chaque joueur, regénéré côté client. `null` : deck transporté tel quel. */
  deckCounts: [number | null, number | null];
}

export interface PackedFrames {
  /** Vues dans l'ordre ; la dernière porte le journal complet. */
  views: PackedView[];
}

/** Le deck est-il exactement celui que `hiddenZoneCards` fabriquerait ? Sinon, on le transporte tel quel. */
function isRegeneratedDeck(deck: readonly CardInstance[], ownerId: string): boolean {
  const expected = hiddenZoneCards(deck.length, ownerId, "deck");
  return deck.every((card, index) => {
    const model = expected[index]!;
    const keys = Object.keys(card);
    return (
      card.cardId === HIDDEN_CARD_ID &&
      card.instanceId === model.instanceId &&
      keys.length === Object.keys(model).length &&
      keys.every((key) => JSON.stringify(card[key as keyof CardInstance]) === JSON.stringify(model[key as keyof CardInstance]))
    );
  });
}

function packView(view: GameState, keepLog: boolean): PackedView {
  const deckCounts = view.players.map((player) => (isRegeneratedDeck(player.deck, player.id) ? player.deck.length : null)) as [
    number | null,
    number | null,
  ];
  return {
    view: {
      ...view,
      eventLog: keepLog ? view.eventLog : [],
      players: view.players.map((player, index) => (deckCounts[index] === null ? player : { ...player, deck: [] })) as [
        PlayerState,
        PlayerState,
      ],
    },
    eventCount: keepLog ? null : view.eventLog.length,
    deckCounts,
  };
}

/** Côté serveur : `views` déjà projetées pour leur destinataire (`toPlayerView`), dans l'ordre. Au moins une. */
export function packFrames(views: readonly GameState[]): PackedFrames {
  if (views.length === 0) throw new Error("packFrames : aucune vue à transmettre.");
  return { views: views.map((view, index) => packView(view, index === views.length - 1)) };
}

/** Côté client : les vues complètes, dans l'ordre. */
export function unpackFrames(packed: PackedFrames): GameState[] {
  const finalLog = packed.views[packed.views.length - 1]!.view.eventLog;
  return packed.views.map(({ view, eventCount, deckCounts }) => ({
    ...view,
    eventLog: eventCount === null ? view.eventLog : finalLog.slice(0, eventCount),
    players: view.players.map((player, index) => {
      const count = deckCounts[index];
      return count === null || count === undefined ? player : { ...player, deck: hiddenZoneCards(count, player.id, "deck") };
    }) as [PlayerState, PlayerState],
  }));
}
