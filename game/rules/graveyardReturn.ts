import { withMarker, type MarkerId } from "@/game/cards/markers";
import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameEvent } from "@/game/events/types";
import { recordUnitArrivals, unitArrivalsLeft } from "@/game/rules/lande";
import { slotsUsed } from "@/game/rules/ongoing";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * RETOUR DU CIMETIÈRE SUR LE PLATEAU (Lot 18 — « ramenez une unité de votre
 * Cimetière sur le plateau, avec un marqueur Mort »).
 *
 * Une carte ramenée ARRIVE sur le plateau : c'est une invocation, pas une
 * pose depuis la main — elle a le mal d'invocation (« elle ne peut pas
 * attaquer ce tour »), réveille ses effets d'arrivée (`SUMMON`, relayé par
 * `processSummonEnterTriggers`) et compte dans les arrivées du tour (une
 * Lande qui les limite peut l'empêcher). Elle repart NEUVE : ni dégâts ni
 * modificateurs, seulement le marqueur que le texte nomme.
 *
 * Elle arrive sur le plateau de celui qui la ramène, qui en prend le
 * contrôle — « d'UN Cimetière » peut ramener une unité adverse (Encore une
 * histoire).
 */

/** Combien de cartes de ce type `playerId` peut encore faire arriver sur son plateau : Slots libres, et arrivées que la Lande permet. */
export function boardRoomFor(state: GameState, playerId: PlayerId, cardId: string, turnNumber: number): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  const libres = Math.max(0, getShipDefinition(player.shipId).slotCount - slotsUsed(player.board));
  const unite = UNIT_CARD_TYPES.includes(getCardDefinition(cardId).type);
  return Math.min(libres, unite ? unitArrivalsLeft(state, playerId, turnNumber) : Infinity);
}

/**
 * Place `card` (déjà SORTIE du Cimetière de `fromPlayerId` par l'appelant)
 * sur le plateau de `toPlayerId`. Pas de place : `placed: false`, l'appelant la rend à son
 * Cimetière. Émet `CARD_MOVED` (Cimetière → plateau) puis `SUMMON` ;
 * l'appelant réveille les arrivées (`processSummonEnterTriggers`).
 */
export function placeFromGraveyard(
  state: GameState,
  card: CardInstance,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  marker: MarkerId | undefined,
  turnNumber: number
): { state: GameState; events: GameEvent[]; placed: boolean } {
  if (boardRoomFor(state, toPlayerId, card.cardId, turnNumber) <= 0) return { state, events: [], placed: false };
  const def = getCardDefinition(card.cardId);
  const neuve: CardInstance = {
    instanceId: card.instanceId,
    cardId: card.cardId,
    ownerId: toPlayerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: UNIT_CARD_TYPES.includes(def.type),
    hasAttackedThisTurn: false,
    ...(def.durationTurns !== undefined ? { turnsRemaining: def.durationTurns } : {}),
    ...(card.illustrationVariant !== undefined ? { illustrationVariant: card.illustrationVariant } : {}),
  };
  const posee = marker ? withMarker(neuve, marker) : neuve;
  const withBoard: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === toPlayerId ? { ...p, board: [...p.board, posee] } : p)) as [PlayerState, PlayerState],
  };
  const base = { turnNumber, timestamp: Date.now() };
  return {
    state: recordUnitArrivals(withBoard, toPlayerId, [def], turnNumber),
    events: [
      // `ownerId` : le Cimetière QUITTÉ (« une carte quitte votre Cimetière », Orram).
      { ...base, type: "CARD_MOVED", instanceId: card.instanceId, cardId: card.cardId, ownerId: fromPlayerId, fromZone: "graveyard", toZone: "board" },
      { ...base, type: "SUMMON", playerId: toPlayerId, instanceId: card.instanceId, cardId: card.cardId },
    ],
    placed: true,
  };
}

/**
 * Fin de tour : les cartes marquées « revient à la fin du tour »
 * (`CardInstance.returnsToBoardAtEndOfTurn`, Coucou, c'est moi) quittent
 * leur Cimetière pour le plateau. La marque ne vaut que pour CE tour : sans
 * place, la carte reste au Cimetière et la marque tombe.
 */
export function returnScheduledFromGraveyards(state: GameState, turnNumber: number): { state: GameState; events: GameEvent[] } {
  let next = state;
  const events: GameEvent[] = [];
  for (const proprietaire of state.players) {
    for (const carte of proprietaire.graveyard) {
      const retour = carte.returnsToBoardAtEndOfTurn;
      if (!retour) continue;
      // Sortie du Cimetière, marque effacée — qu'elle trouve sa place ou non.
      const { returnsToBoardAtEndOfTurn: _marque, ...propre } = carte;
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === proprietaire.id ? { ...p, graveyard: p.graveyard.filter((c) => c.instanceId !== carte.instanceId) } : p
        ) as [PlayerState, PlayerState],
      };
      const place = retour.turnNumber === turnNumber ? placeFromGraveyard(next, propre, proprietaire.id, retour.playerId, retour.withMarker, turnNumber) : undefined;
      if (place?.placed) {
        next = place.state;
        events.push(...place.events);
        continue;
      }
      next = {
        ...next,
        players: next.players.map((p) => (p.id === proprietaire.id ? { ...p, graveyard: [...p.graveyard, propre] } : p)) as [PlayerState, PlayerState],
      };
    }
  }
  return { state: next, events };
}
