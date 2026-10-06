import { getCardDefinition } from "@/game/cards/sets/core";
import { isTextIgnored, type CardDefinition } from "@/game/cards/types";
import { getShipDefinition } from "@/game/environment/shipData";
import { activeLandeRules } from "@/game/rules/lande";
import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * RÉDUCTIONS « LA PREMIÈRE … À CHACUN DE VOS TOURS » (Lot 17) — lues sur ce
 * qui est en jeu, pas posées par un effet :
 *  - Campement provisoire (Structure) et Terres inconnues (Lande) : « la
 *    première carte que vous rejouez depuis votre main après qu'elle y soit
 *    revenue » — une carte RENVOYÉE du plateau vers la main (son exemplaire
 *    en main porte `:hand:`, `recalledInstanceId`) ;
 *  - Île-Tortue Opaline (Navire) : « la première carte Opaline coûtant 5 ou
 *    plus que vous jouez ».
 * Chaque source ne vaut qu'une fois par tour du joueur : la clé prise est
 * notée sur le joueur (`turnDiscountsUsed`) au paiement.
 */
export interface TurnDiscount {
  key: string;
  amount: number;
}

function used(player: PlayerState, turnNumber: number): string[] {
  return player.turnDiscountsUsed?.turnNumber === turnNumber ? player.turnDiscountsUsed.keys : [];
}

/** Une carte de la main revenue du plateau (et non piochée). */
export function isReturnedToHand(instanceId: string | undefined): boolean {
  return instanceId !== undefined && instanceId.includes(":hand:");
}

export function turnDiscounts(state: GameState, playerId: PlayerId, def: CardDefinition, instanceId: string | undefined): TurnDiscount[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.activePlayerId !== playerId) return [];
  const deja = used(player, state.turnNumber);
  const result: TurnDiscount[] = [];

  if (isReturnedToHand(instanceId)) {
    for (const unit of player.board) {
      const montant = getCardDefinition(unit.cardId).replayedCardDiscount;
      const key = `replay:${unit.instanceId}`;
      if (montant && !isTextIgnored(unit) && !deja.includes(key)) result.push({ key, amount: montant });
    }
    const lande = activeLandeRules(state.environment)?.replayedCardDiscount;
    if (lande && !deja.includes("replay:lande")) result.push({ key: "replay:lande", amount: lande });
  }

  const navire = getShipDefinition(player.shipId).firstArchetypeCardDiscountEachTurn;
  if (navire && def.archetype === navire.archetype && def.cost >= navire.minCost && !deja.includes("ship")) {
    result.push({ key: "ship", amount: navire.amount });
  }
  return result;
}

/** Note les réductions prises par la carte qu'on vient de payer. */
export function markTurnDiscountsUsed(state: GameState, playerId: PlayerId, keys: readonly string[]): GameState {
  if (keys.length === 0) return state;
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, turnDiscountsUsed: { turnNumber: state.turnNumber, keys: [...used(p, state.turnNumber), ...keys] } } : p
    ) as GameState["players"],
  };
}
