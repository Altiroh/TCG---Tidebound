import type { GameState, PlayerId, PlayerState } from "@/game/state/types";

/**
 * « La prochaine fois qu'une de vos unités inflige des dégâts ce tour,
 * augmentez ces dégâts de N » (Lot 17 — Dhar, Opalin du Premier Coup).
 *
 * Porté par le JOUEUR (`PlayerState.nextUnitDamageBonus`), valable le seul
 * tour où il a été posé, et CONSOMMÉ par le premier coup qu'une unité de ce
 * joueur porte — attaque, riposte ou effet d'une unité en jeu.
 */
export function pendingUnitDamageBonus(player: Pick<PlayerState, "nextUnitDamageBonus">, turnNumber: number): number {
  const bonus = player.nextUnitDamageBonus;
  return bonus && bonus.turnNumber === turnNumber ? bonus.amount : 0;
}

/** Le bonus en attente de ce joueur, et l'état où il a été consommé (inchangé sans bonus). */
export function consumeUnitDamageBonus(state: GameState, playerId: PlayerId, turnNumber: number): { state: GameState; bonus: number } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { state, bonus: 0 };
  const bonus = pendingUnitDamageBonus(player, turnNumber);
  if (bonus <= 0 && !player.nextUnitDamageBonus) return { state, bonus: 0 };
  const { nextUnitDamageBonus: _consomme, ...reste } = player;
  return {
    state: { ...state, players: state.players.map((p) => (p.id === playerId ? reste : p)) as GameState["players"] },
    bonus,
  };
}
