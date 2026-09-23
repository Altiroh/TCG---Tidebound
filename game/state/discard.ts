import type { CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState, GraveyardArrival, PlayerId, PlayerState } from "@/game/state/types";

/**
 * VOIE UNIQUE de la défausse depuis la main.
 *
 * Il y avait trois endroits qui faisaient le geste à la main — l'effet
 * `discard`, la limite de taille de main en fin de tour, et les Anomalies de
 * Marée — chacun avec sa propre boucle, sa propre `graveyardCause` et un
 * `CARD_MOVED` sans identité de carte. Tant que rien ne réagissait à une
 * défausse, la triple écriture ne coûtait rien ; le Lot 13 la rend
 * intenable : « quand cette carte est défaussée » et « quand une carte
 * rejoint votre Cimetière depuis votre main » doivent voir les TROIS, sans
 * quoi P'tit Bout rendrait de la Raison en étant défaussé par un effet mais
 * pas par la Marée, ce que son texte ne dit nulle part.
 *
 * Ce module est donc le seul endroit qui déplace une carte de la main au
 * Cimetière. Il renseigne aussi `cardId` et `ownerId` sur l'événement —
 * l'exemplaire a quitté la main, et c'est l'événement qui porte désormais
 * son identité — et inscrit l'arrivée dans `graveyardArrivals`, que lisent
 * les conditions « … a rejoint votre Cimetière ce tour ».
 *
 * Il ne déclenche RIEN lui-même : `processDiscardedFromHandTriggers`
 * (`game/triggers/triggerBus.ts`) relit les événements produits. La
 * dépendance inverse serait circulaire, exactement comme pour les retours
 * en main et les invocations.
 */

/** Ce que la défausse retire de la main : les N premières cartes, ou des exemplaires désignés. */
export type DiscardSelection = { count: number } | { instanceIds: readonly string[] };

/**
 * Inscrit une arrivée au Cimetière. TOUTE voie qui y pose une carte
 * l'appelle — défausse, destruction, Objet brisé, Équipement consommé,
 * durée échue : « a rejoint votre Cimetière » ne distingue pas la façon.
 */
export function recordGraveyardArrival(player: PlayerState, arrival: GraveyardArrival): PlayerState {
  return { ...player, graveyardArrivals: [...(player.graveyardArrivals ?? []), arrival] };
}

/**
 * Élague le journal des arrivées au Cimetière : seules comptent celles des
 * trois derniers tours de table. « Depuis votre dernier tour » remonte au
 * tour précédent du contrôleur (N-2) — ce qui y est parti APRÈS ses
 * capacités de début de tour (un combat, une défausse de fin de tour) n'a
 * encore été vu par personne.
 */
export function pruneGraveyardArrivals(player: PlayerState, turnNumber: number): PlayerState {
  const arrivals = player.graveyardArrivals ?? [];
  if (arrivals.length === 0) return player;
  const kept = arrivals.filter((a) => a.turnNumber >= turnNumber - 2);
  return kept.length === arrivals.length ? player : { ...player, graveyardArrivals: kept };
}

/**
 * Juste avant les capacités de début de tour : les arrivées déjà inscrites
 * pour CE tour (effets de Marée de l'entame) sont vues maintenant par
 * « depuis votre dernier tour » ; on les marque pour que le tour suivant du
 * même joueur ne les recompte pas.
 */
export function markArrivalsBeforeTurnStart(player: PlayerState, turnNumber: number): PlayerState {
  const arrivals = player.graveyardArrivals ?? [];
  if (!arrivals.some((a) => a.turnNumber === turnNumber && !a.beforeOwnTurnStart)) return player;
  return {
    ...player,
    graveyardArrivals: arrivals.map((a) => (a.turnNumber === turnNumber ? { ...a, beforeOwnTurnStart: true } : a)),
  };
}

function replacePlayer(state: GameState, player: PlayerState): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? player : p)) as [PlayerState, PlayerState],
  };
}

/**
 * Le geste lui-même, sur un seul joueur : retire de la main, pose au
 * Cimetière avec sa cause, journalise l'arrivée et rend les `CARD_MOVED`
 * COMPLETS (avec `cardId` et `ownerId`, sans lesquels les déclencheurs de
 * défausse ne sauraient pas de quelle carte il s'agit).
 *
 * Défausser plus que ce qu'on a en main n'est pas une erreur : on défausse
 * ce qu'il y a.
 */
export function discardFromHandState(
  player: PlayerState,
  selection: DiscardSelection,
  base: { turnNumber: number; timestamp: number }
): { player: PlayerState; events: GameEvent[]; discarded: CardInstance[] } {
  const hand = [...player.hand];
  const taken: CardInstance[] = [];

  if ("instanceIds" in selection) {
    for (const instanceId of selection.instanceIds) {
      const index = hand.findIndex((c) => c.instanceId === instanceId);
      if (index < 0) continue;
      taken.push(hand.splice(index, 1)[0]!);
    }
  } else {
    for (let i = 0; i < selection.count && hand.length > 0; i += 1) taken.push(hand.shift()!);
  }
  if (taken.length === 0) return { player, events: [], discarded: [] };

  const events: GameEvent[] = taken.map((card) => ({
    ...base,
    type: "CARD_MOVED" as const,
    instanceId: card.instanceId,
    cardId: card.cardId,
    ownerId: player.id,
    fromZone: "hand",
    toZone: "graveyard",
  }));

  let next: PlayerState = {
    ...player,
    hand,
    graveyard: [...player.graveyard, ...taken.map((card) => ({ ...card, graveyardCause: "discarded" as const }))],
  };
  for (const card of taken) {
    next = recordGraveyardArrival(next, { cardId: card.cardId, turnNumber: base.turnNumber, fromZone: "hand" });
  }

  return { player: next, events, discarded: taken };
}

/** Même geste, à l'échelle de l'état complet. */
export function discardFromHand(
  state: GameState,
  playerId: PlayerId,
  selection: DiscardSelection,
  base: { turnNumber: number; timestamp: number }
): { state: GameState; events: GameEvent[]; discarded: CardInstance[] } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, events: [], discarded: [] };
  const result = discardFromHandState(player, selection, base);
  if (result.discarded.length === 0) return { state, events: [], discarded: [] };
  return { state: replacePlayer(state, result.player), events: result.events, discarded: result.discarded };
}
