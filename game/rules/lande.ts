import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardDefinition, type CardInstance, type LandeRules } from "@/game/cards/types";
import type { EnvironmentState } from "@/game/environment/types";
import type { GameEvent } from "@/game/events/types";
import { recordGraveyardArrival } from "@/game/state/discard";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * LANDES — emplacement PARTAGÉ au centre du plateau (décision du 05/10/2026).
 *
 * - Une seule Lande en jeu pour les deux joueurs : en jouer une remplace
 *   celle déjà en place, qui part au Cimetière de SON propriétaire.
 * - Elle n'occupe aucun Slot et n'est pas un permanent : rien ne l'attaque,
 *   rien ne la cible, aucun effet « détruisez un permanent » ne l'atteint.
 * - Elle reste `durationTableTurns` tours de table à compter de sa pose,
 *   puis part au Cimetière de son propriétaire (`tickLande`,
 *   `game/rules/landeTick.ts`).
 * - Ses règles (`LandeRules`) valent pour les deux camps.
 *
 * Ce module ne résout aucun effet : il est lu par `resolveEffect` (limite
 * d'arrivées) et ne peut donc pas l'importer. Les dégâts de fin de tour de
 * table vivent dans `landeTick.ts`.
 */

/** Règles de la Lande en jeu, ou `undefined` sans Lande. */
export function activeLandeRules(environment: EnvironmentState): LandeRules | undefined {
  const lande = environment.lande;
  return lande ? getCardDefinition(lande.cardId).lande : undefined;
}

/** Mots-clés que la Lande en jeu retire à tous les permanents (« les permanents perdent Garde »). */
export function landeRemovedKeywords(environment: EnvironmentState): readonly string[] {
  return activeLandeRules(environment)?.removesKeywords ?? [];
}

function isUnitDefinition(def: CardDefinition): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
}

/** Unités arrivées sous le contrôle de ce joueur pendant le tour `turnNumber`. */
export function unitArrivalsThisTurn(player: PlayerState, turnNumber: number): number {
  const arrivals = player.unitArrivalsThisTurn;
  return arrivals && arrivals.turnNumber === turnNumber ? arrivals.count : 0;
}

/**
 * Combien d'unités ce joueur peut encore faire arriver ce tour-ci
 * (`LandeRules.unitArrivalsPerTurn`). `Infinity` sans limite en jeu.
 */
export function unitArrivalsLeft(state: GameState, playerId: PlayerId, turnNumber: number): number {
  const limit = activeLandeRules(state.environment)?.unitArrivalsPerTurn;
  if (limit === undefined) return Infinity;
  const player = state.players.find((p) => p.id === playerId);
  return player ? Math.max(0, limit - unitArrivalsThisTurn(player, turnNumber)) : 0;
}

/**
 * Motif de refus quand jouer cette carte dépasserait la limite d'arrivées
 * de la Lande en jeu, `null` sinon.
 */
export function unitArrivalRefusal(state: GameState, playerId: PlayerId, def: CardDefinition): string | null {
  if (!isUnitDefinition(def)) return null;
  if (unitArrivalsLeft(state, playerId, state.turnNumber) > 0) return null;
  const lande = state.environment.lande ? getCardDefinition(state.environment.lande.cardId) : undefined;
  const limit = lande?.lande?.unitArrivalsPerTurn ?? 0;
  return `${lande?.name ?? "La Lande"} : ${limit === 1 ? "un seul Marin ou une seule Créature" : `${limit} Marins ou Créatures au plus`} par tour.`;
}

/**
 * Inscrit `count` arrivées d'unités pour ce joueur. Appelé par TOUTE voie
 * qui fait arriver une unité — pose depuis la main, invocation par effet —,
 * qu'une Lande limite les arrivées ou non : posée en cours de tour, elle
 * doit voir ce qui est déjà arrivé.
 */
export function recordUnitArrivals(state: GameState, playerId: PlayerId, cards: readonly CardDefinition[], turnNumber: number): GameState {
  const count = cards.filter(isUnitDefinition).length;
  if (count === 0) return state;
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, unitArrivalsThisTurn: { turnNumber, count: unitArrivalsThisTurn(p, turnNumber) + count } } : p
    ) as GameState["players"],
  };
}

/**
 * Renvoie la Lande en jeu au Cimetière de son propriétaire, avec la cause
 * donnée (`replaced` quand une autre la chasse, `expired` à la fin de sa
 * durée, `destroyed` quand un effet la détruit — Lever l'Ancre). Sans
 * Lande : état inchangé.
 */
export function sendLandeToGraveyard(
  state: GameState,
  cause: "replaced" | "expired" | "destroyed",
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const lande = state.environment.lande;
  if (!lande) return { state, events: [] };
  const card: CardInstance = {
    instanceId: lande.instanceId,
    cardId: lande.cardId,
    ownerId: lande.ownerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    graveyardCause: cause,
  };
  const environment = { ...state.environment };
  delete environment.lande;
  return {
    state: {
      ...state,
      environment,
      players: state.players.map((p) =>
        p.id === lande.ownerId
          ? recordGraveyardArrival(
              { ...p, graveyard: [...p.graveyard, card] },
              { cardId: card.cardId, instanceId: card.instanceId, turnNumber, fromZone: "board" }
            )
          : p
      ) as GameState["players"],
    },
    events: [
      {
        type: "CARD_MOVED",
        turnNumber,
        timestamp: Date.now(),
        instanceId: card.instanceId,
        cardId: card.cardId,
        ownerId: lande.ownerId,
        fromZone: "lande",
        toZone: "graveyard",
      },
    ],
  };
}

/**
 * Pose une Lande jouée depuis la main dans l'emplacement partagé. Celle
 * déjà en place, quel que soit son propriétaire, part d'abord au Cimetière.
 */
export function placeLande(
  state: GameState,
  playerId: PlayerId,
  instance: CardInstance,
  turnNumber: number
): { state: GameState; events: GameEvent[] } {
  const rules = getCardDefinition(instance.cardId).lande;
  if (!rules) return { state, events: [] };
  const replaced = sendLandeToGraveyard(state, "replaced", turnNumber);
  return {
    state: {
      ...replaced.state,
      environment: {
        ...replaced.state.environment,
        lande: {
          instanceId: instance.instanceId,
          cardId: instance.cardId,
          ownerId: playerId,
          remainingPlayerTurns: 2 * rules.durationTableTurns,
        },
      },
    },
    // L'arrivée de la Lande (Lot 17 — `onLandePlaced`).
    events: [
      ...replaced.events,
      {
        type: "CARD_MOVED",
        turnNumber,
        timestamp: Date.now(),
        instanceId: instance.instanceId,
        cardId: instance.cardId,
        ownerId: playerId,
        fromZone: "hand",
        toZone: "lande",
      },
    ],
  };
}

/**
 * La fin du tour de joueur qui commence va-t-elle faire frapper la Lande
 * (« à la fin de chaque tour de table, … subissent N dégâts ») ? Lu par
 * `finirTour` pour ouvrir la fenêtre `onLandeStrike` AVANT le coup.
 */
export function landeStrikesAtEndOfTurn(environment: EnvironmentState): boolean {
  const lande = environment.lande;
  if (!lande || !activeLandeRules(environment)?.damageAllPermanentsEachTableTurn) return false;
  return (lande.remainingPlayerTurns - 1) % 2 === 0;
}

/** Tours de table restants à la Lande en jeu, arrondis au tour entamé (ce qu'affiche le plateau). */
export function landeRemainingTableTurns(environment: EnvironmentState): number {
  return environment.lande ? Math.ceil(environment.lande.remainingPlayerTurns / 2) : 0;
}
