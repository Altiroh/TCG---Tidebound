import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide, type CardDefinition, type CardInstance, type TriggeredAbility } from "@/game/cards/types";
import { markOncePerTurnUsed, oncePerTurnAvailable } from "@/game/state/oncePerTurn";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * Coût IMPRIMÉ du Bris depuis la main (Notion "Catalogue de cartes", règle
 * prototype "Briser un Objet depuis la main") : moitié du coût imprimé,
 * arrondie au supérieur, minimum 1 Raison. Une réduction temporaire de coût
 * ne le réduit pas ; le bouclier de perte de Raison s'applique au paiement,
 * comme pour tout coût.
 *
 * Ici plutôt que dans `breakObject.ts` : la fenêtre de réaction
 * (`triggerBus.ts`) en a besoin pour proposer un Objet réactif depuis la
 * main, et `breakObject.ts` importe déjà le bus.
 */
export function handBreakCost(def: Pick<CardDefinition, "cost">): number {
  return Math.max(1, Math.ceil(def.cost / 2));
}

/**
 * Capacité de BRIS EN RÉACTION d'un Objet : « Lorsque …, vous pouvez
 * Briser cet Objet : … ». Facultative, et l'Objet part en la payant (un
 * effet `saborde` sur lui-même, dernier de la liste).
 *
 * Règle du 29/09/2026 : une telle capacité se propose AUSSI depuis la main,
 * au coût d'un Bris depuis la main (`handBreakCost`) et sans prendre de
 * Slot — exactement comme un Objet ordinaire se Brise depuis la main.
 * Poser l'Objet d'abord reste possible ; ce n'est plus obligatoire.
 */
export function isBreakReaction(def: Pick<CardDefinition, "type">, ability: TriggeredAbility): boolean {
  return (
    def.type === "objet" &&
    ability.mode === "optional" &&
    ability.effects.some((effect) => effect.type === "saborde" && effect.target.kind === "self")
  );
}

/** Clé `oncePerTurnFlags` de la taxe de Bris adverse (Cloche d'Alerte). */
const OBJECT_BREAK_TAX_KEY = "objectBreakTax";

export interface ObjectBreakTax {
  amount: number;
  blocksIfUnpayable: boolean;
  holder?: { unit: CardInstance; ownerId: PlayerId };
}

/**
 * Taxe de Bris adverse (Cloche d'Alerte, `taxOpponentObjectBreakOncePerTurnWhileVisible`)
 * que `playerId` devrait payer en Brisant un Objet maintenant : montant et
 * carte qui la porte (montant 0 si aucune carte visible et encore armée).
 *
 * Elle vaut pour TOUT Bris : l'action `breakObject` (main ou plateau) comme
 * le Bris d'un Objet réactif dans une fenêtre de réaction (`isBreakReaction`,
 * depuis la main ou le plateau) — « la première fois à chaque tour que
 * l'adversaire Brise un Objet » ne distingue pas les deux.
 */
export function objectBreakTax(state: GameState, playerId: PlayerId, turnNumber: number): ObjectBreakTax {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) return { amount: 0, blocksIfUnpayable: false };
  for (const unit of opponent.board) {
    const def = getCardDefinition(unit.cardId);
    const tax = def.taxOpponentObjectBreakOncePerTurnWhileVisible;
    if (tax === undefined || !isVisibleDuringTide(def, state.environment.tideState)) continue;
    if (!oncePerTurnAvailable(unit, OBJECT_BREAK_TAX_KEY, turnNumber)) continue;
    return { amount: tax.amount, blocksIfUnpayable: tax.blocksIfUnpayable === true, holder: { unit, ownerId: opponent.id } };
  }
  return { amount: 0, blocksIfUnpayable: false };
}

/** Consomme pour le tour la taxe de Bris que porte `tax.holder` (rien si aucune). */
export function consumeObjectBreakTax(state: GameState, tax: ObjectBreakTax, turnNumber: number): GameState {
  if (!tax.holder) return state;
  const { unit: holder, ownerId } = tax.holder;
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === ownerId
        ? { ...p, board: p.board.map((u) => (u.instanceId === holder.instanceId ? markOncePerTurnUsed(u, OBJECT_BREAK_TAX_KEY, turnNumber) : u)) }
        : p
    ) as [PlayerState, PlayerState],
  };
}
