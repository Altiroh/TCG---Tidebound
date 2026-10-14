import { getCardDefinition } from "@/game/cards/sets/core";
import { isTextIgnored, type CardDefinition, type CardInstance } from "@/game/cards/types";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Règles des Objets JOUÉS (refonte du 13/10/2026, Notion « Règles &
 * conventions ») :
 * - Objet classique : joué depuis la main, en Phase principale, au coût
 *   imprimé ; il exige au moins un Slot libre mais n'y est jamais posé. Son
 *   effet se résout aussitôt (via la pile de Chaîne, où l'adversaire peut
 *   lui répondre) ; il est « Brisé » si l'effet aboutit, puis part au
 *   Cimetière.
 * - Objet Chaîne (`CardDefinition.chaine`) : joué depuis la main sans Slot,
 *   dans une fenêtre de réaction qui correspond à son texte, ou pendant un
 *   jet de dé de son contrôleur (Chaîne de dé).
 */

/** Chaîne de dé : un Objet Chaîne sans capacité, qui agit sur le jet en cours. */
export function isDieChainObject(def: Pick<CardDefinition, "type" | "chaine" | "abilities">): boolean {
  return def.type === "objet" && def.chaine === true && !(def.abilities?.length);
}

/** Chaîne de réaction : un Objet Chaîne joué dans la fenêtre que décrit sa capacité. */
export function isReactionChainObject(def: Pick<CardDefinition, "type" | "chaine" | "abilities">): boolean {
  return def.type === "objet" && def.chaine === true && (def.abilities?.length ?? 0) > 0;
}

/** Clé `oncePerTurnFlags` de la taxe sur le premier Objet adverse joué (Cloche d'Alerte, Seren…). */
const OBJECT_PLAY_TAX_KEY = "objectPlayTax";

export interface ObjectPlayTax {
  amount: number;
  blocksIfUnpayable: boolean;
  holders: { unit: CardInstance; ownerId: PlayerId }[];
}

/**
 * Taxe que `playerId` paierait en jouant un Objet maintenant : la somme des
 * cartes adverses en jeu qui portent `taxOpponentObjectPlayOncePerTurn` et
 * dont l'occasion du tour n'est pas consommée. Une Structure masquée par la
 * Marée taxe aussi (effet unique, « actif même masqué »). Bloquante si l'une
 * d'elles l'est.
 */
export function objectPlayTax(state: GameState, playerId: PlayerId, turnNumber: number): ObjectPlayTax {
  const tax: ObjectPlayTax = { amount: 0, blocksIfUnpayable: false, holders: [] };
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) return tax;
  for (const unit of opponent.board) {
    const def = getCardDefinition(unit.cardId);
    const carried = def.taxOpponentObjectPlayOncePerTurn;
    if (!carried || isTextIgnored(unit)) continue;
    if (!oncePerTurnAvailable(unit, OBJECT_PLAY_TAX_KEY, turnNumber)) continue;
    tax.amount += carried.amount;
    tax.blocksIfUnpayable ||= carried.blocksIfUnpayable === true;
    tax.holders.push({ unit, ownerId: opponent.id });
  }
  return tax;
}

/** Consomme pour le tour les taxes de `tax.holders` (l'Objet vient d'être joué). */
export function consumeObjectPlayTax(state: GameState, tax: ObjectPlayTax, turnNumber: number): GameState {
  if (tax.holders.length === 0) return state;
  const ids = new Set(tax.holders.map((h) => h.unit.instanceId));
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      board: p.board.map((u) => (ids.has(u.instanceId) ? markOncePerTurnUsed(u, OBJECT_PLAY_TAX_KEY, turnNumber) : u)),
    })) as [PlayerState, PlayerState],
  };
}

/** Noms des Objets joués par ce joueur pendant le tour `turnNumber`. */
export function objectsPlayedThisTurn(player: PlayerState, turnNumber: number): string[] {
  return player.objectsPlayedThisTurn?.turnNumber === turnNumber ? player.objectsPlayedThisTurn.names : [];
}

/** Enregistre un Objet joué (« une seule utilisation de … par tour »). */
export function recordObjectPlayed(state: GameState, playerId: PlayerId, name: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? { ...p, objectsPlayedThisTurn: { turnNumber: state.turnNumber, names: [...objectsPlayedThisTurn(p, state.turnNumber), name] } }
        : p
    ) as [PlayerState, PlayerState],
  };
}
