"use client";

import { useReducer } from "react";
import {
  canBeEquipTarget,
  computeEffectiveStats,
  getCardDefinition,
  UNIT_CARD_TYPES,
  type CardInstance,
  type TideStateName,
} from "@/game";
import { BOARD_CAPACITY, PREVIEW_FIXTURES, type PreviewCardModel } from "@/features/board-preview/previewFixtures";

/**
 * État de table du laboratoire : pioche, main, plateaux, défausses, coques,
 * dégâts, liens d'équipement et journal.
 *
 * Purement local, et volontairement SIMPLIFIÉ — ce n'est pas le moteur :
 * aucun coût, aucune Phase, aucun effet de carte. Le combat se résume à
 * « l'attaquant inflige sa Puissance, la cible unité riposte avec la
 * sienne », juste assez pour voir les vraies conséquences visuelles d'une
 * attaque (dégâts, destruction, carte qui part à la défausse). Le vrai board
 * branchera ces mêmes gestes et animations sur `dispatch`.
 */

/** Cible d'un ciblage : une carte adverse, ou le Navire adverse. */
export type PreviewTargetId = { kind: "unit"; id: string } | { kind: "ship" };

export type Side = "player" | "opponent";

export interface PreviewTableState {
  playerDeck: PreviewCardModel[];
  hand: PreviewCardModel[];
  playerBoard: PreviewCardModel[];
  playerGraveyard: number;
  opponentDeck: number;
  opponentHand: number;
  opponentBoard: PreviewCardModel[];
  opponentGraveyard: number;
  hull: Record<Side, number>;
  /** Dégâts marqués par carte (`CardInstance.damageMarked`). */
  damage: Record<string, number>;
  /** Équipement posé → permanent qu'il équipe (`CardInstance.attachedToInstanceId`). */
  attachments: Record<string, string>;
  journal: string[];
}

type Action =
  | { type: "draw"; side: Side }
  | { type: "place"; cardId: string; attachTo?: string }
  | { type: "strike"; sourceId: string; target: PreviewTargetId; amount: number; retaliation: number }
  | { type: "destroy"; cardIds: string[] }
  | { type: "sabotage"; cardId: string }
  | { type: "reset" };

const JOURNAL_MAX = 12;
/** Taille maximale de main (au-delà, la pioche ne fait rien). */
export const HAND_LIMIT = 10;

/** Table au départ d'une partie : mains VIDES, elles sont distribuées carte par carte (`BoardPreviewPage`). */
function initialState(): PreviewTableState {
  return {
    playerDeck: [...PREVIEW_FIXTURES.playerHand, ...PREVIEW_FIXTURES.playerDeck],
    hand: [],
    playerBoard: PREVIEW_FIXTURES.playerBoard,
    playerGraveyard: PREVIEW_FIXTURES.player.graveyard,
    opponentDeck: PREVIEW_FIXTURES.opponent.deck,
    opponentHand: 0,
    opponentBoard: PREVIEW_FIXTURES.opponentBoard,
    opponentGraveyard: PREVIEW_FIXTURES.opponent.graveyard,
    hull: { player: PREVIEW_FIXTURES.player.hull, opponent: PREVIEW_FIXTURES.opponent.hull },
    damage: {},
    attachments: { ...PREVIEW_FIXTURES.playerAttachments },
    journal: PREVIEW_FIXTURES.journal,
  };
}

function cardName(card: PreviewCardModel | undefined): string {
  return card ? getCardDefinition(card.cardId).name : "?";
}

function withJournal(state: PreviewTableState, line: string): string[] {
  return [line, ...state.journal].slice(0, JOURNAL_MAX);
}

function withoutLinksTo(attachments: Record<string, string>, ids: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.entries(attachments).filter(([equip, host]) => !ids.has(equip) && !ids.has(host)));
}

function reducer(state: PreviewTableState, action: Action): PreviewTableState {
  switch (action.type) {
    case "draw": {
      if (action.side === "opponent") {
        if (state.opponentDeck <= 0 || state.opponentHand >= HAND_LIMIT) return state;
        return { ...state, opponentDeck: state.opponentDeck - 1, opponentHand: state.opponentHand + 1 };
      }
      const [card, ...rest] = state.playerDeck;
      if (!card || state.hand.length >= HAND_LIMIT) return state;
      return { ...state, playerDeck: rest, hand: [...state.hand, card] };
    }
    case "place": {
      const card = state.hand.find((c) => c.id === action.cardId);
      if (!card || state.playerBoard.length >= BOARD_CAPACITY) return state;
      const host = action.attachTo ? state.playerBoard.find((c) => c.id === action.attachTo) : undefined;
      return {
        ...state,
        hand: state.hand.filter((c) => c.id !== card.id),
        // Comme le moteur : la carte prend le premier emplacement libre — un
        // Équipement aussi, il occupe un emplacement ET se lie à son porteur.
        playerBoard: [...state.playerBoard, card],
        attachments: host ? { ...state.attachments, [card.id]: host.id } : state.attachments,
        journal: withJournal(state, host ? `Vous équipez ${cardName(host)} de ${cardName(card)}.` : `Vous posez ${cardName(card)}.`),
      };
    }
    case "strike": {
      const source = state.playerBoard.find((c) => c.id === action.sourceId);
      if (!source) return state;
      const { target, amount, retaliation } = action;
      if (target.kind === "ship") {
        return {
          ...state,
          hull: { ...state.hull, opponent: Math.max(0, state.hull.opponent - amount) },
          journal: withJournal(state, `${cardName(source)} frappe le Navire adverse (−${amount}).`),
        };
      }
      const defender = state.opponentBoard.find((c) => c.id === target.id);
      if (!defender) return state;
      return {
        ...state,
        damage: {
          ...state.damage,
          [defender.id]: (state.damage[defender.id] ?? 0) + amount,
          [source.id]: (state.damage[source.id] ?? 0) + retaliation,
        },
        journal: withJournal(state, `${cardName(source)} attaque ${cardName(defender)} (−${amount}).`),
      };
    }
    case "destroy": {
      const ids = new Set(action.cardIds);
      const fromPlayer = state.playerBoard.filter((c) => ids.has(c.id));
      const fromOpponent = state.opponentBoard.filter((c) => ids.has(c.id));
      if (fromPlayer.length + fromOpponent.length === 0) return state;
      const names = [...fromOpponent, ...fromPlayer].map(cardName).join(", ");
      return {
        ...state,
        playerBoard: state.playerBoard.filter((c) => !ids.has(c.id)),
        opponentBoard: state.opponentBoard.filter((c) => !ids.has(c.id)),
        playerGraveyard: state.playerGraveyard + fromPlayer.length,
        opponentGraveyard: state.opponentGraveyard + fromOpponent.length,
        attachments: withoutLinksTo(state.attachments, ids),
        journal: withJournal(state, `Détruit : ${names}.`),
      };
    }
    case "sabotage": {
      const card = state.playerBoard.find((c) => c.id === action.cardId);
      if (!card) return state;
      return {
        ...state,
        playerBoard: state.playerBoard.filter((c) => c.id !== card.id),
        playerGraveyard: state.playerGraveyard + 1,
        // Les liens qui partaient de la carte, ou y menaient, deviennent caducs.
        attachments: withoutLinksTo(state.attachments, new Set([card.id])),
        journal: withJournal(state, `Vous sabordez ${cardName(card)}.`),
      };
    }
    case "reset":
      return initialState();
  }
}

/** Seuls les Marins et Créatures attaquent (lecture du catalogue, `UNIT_CARD_TYPES`). */
export function canAttack(card: PreviewCardModel): boolean {
  return (UNIT_CARD_TYPES as readonly string[]).includes(getCardDefinition(card.cardId).type);
}

function toInstance(card: PreviewCardModel, state: PreviewTableState): CardInstance {
  return {
    instanceId: card.id,
    cardId: card.cardId,
    ownerId: "preview",
    damageMarked: state.damage[card.id] ?? 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
    attachedToInstanceId: state.attachments[card.id],
  };
}

/** Puissance et Résistance restante affichées par la carte (même calcul que `CardTile`, sans auras). */
export function unitStats(card: PreviewCardModel, state: PreviewTableState, tideState: TideStateName) {
  const stats = computeEffectiveStats(toInstance(card, state), tideState);
  const hasHealth = stats.health > 0 || getCardDefinition(card.cardId).health !== undefined;
  return { attack: stats.attack, remaining: stats.health - (state.damage[card.id] ?? 0), hasHealth };
}

/**
 * Cibles d'une carte jouée depuis la main, ou `null` si elle se pose sans
 * cible. Seul cas branché : l'Équipement (`attachEquipment`), avec la même
 * règle que `needsPlayTarget` / le moteur — cible "si possible" : sans
 * permanent équipable, il se pose librement plutôt que de rester bloqué.
 */
export function playTargetsFor(card: PreviewCardModel, state: PreviewTableState): string[] | null {
  const def = getCardDefinition(card.cardId);
  const attaches = (def.onPlayEffects ?? []).some((e) => e.type === "attachEquipment" && e.target.kind === "chosenUnit");
  if (!attaches) return null;
  const board = state.playerBoard.map((c) => toInstance(c, state));
  const hosts = board.filter((candidate) => canBeEquipTarget(def, board, candidate)).map((u) => u.instanceId);
  return hosts.length > 0 ? hosts : null;
}

export function usePreviewTable() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return {
    state,
    draw: (side: Side) => dispatch({ type: "draw", side }),
    place: (cardId: string, attachTo?: string) => dispatch({ type: "place", cardId, attachTo }),
    strike: (sourceId: string, target: PreviewTargetId, amount: number, retaliation: number) =>
      dispatch({ type: "strike", sourceId, target, amount, retaliation }),
    destroy: (cardIds: string[]) => dispatch({ type: "destroy", cardIds }),
    sabotage: (cardId: string) => dispatch({ type: "sabotage", cardId }),
    reset: () => dispatch({ type: "reset" }),
  };
}
