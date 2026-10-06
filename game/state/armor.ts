import type { GameEvent } from "@/game/events/types";
import type { PlayerState } from "@/game/state/types";

/**
 * ARMURE (Lot 17, décision du 05/10/2026) — une RÉSERVE DU NAVIRE.
 *
 * - « Gagnez X Armure » ajoute X points au Navire du joueur ; ils restent
 *   d'un tour à l'autre tant qu'ils ne sont pas consommés.
 * - Les DÉGÂTS AU NAVIRE (effet, attaque directe, contrecoup, Marée)
 *   entament d'abord l'Armure, point par point, puis l'Ancrage.
 * - Ce qui n'est pas un dégât n'y touche pas : la Déraison qu'on paie en
 *   Ancrage, un coût en Ancrage, « infligez X dégâts d'Ancrage à votre
 *   propre Navire » d'un choix imposé — ce sont des prix, pas des coups.
 * - « Perdez X Armure » la retire ; si le joueur n'en a pas assez, le reste
 *   peut retomber sur une unité (Hubert, Paladin persuadé d'être l'Élu).
 */

export function armorOf(player: Pick<PlayerState, "armor">): number {
  return player.armor ?? 0;
}

/**
 * Un coup de `amount` dégâts au Navire : ce que l'Armure absorbe, ce qui
 * passe à l'Ancrage. Rend le joueur avec son Armure entamée (l'Ancrage, lui,
 * reste à retirer par l'appelant, qui connaît ses propres événements).
 */
export function absorbShipDamage(player: PlayerState, amount: number): { player: PlayerState; absorbed: number; rest: number } {
  const armor = armorOf(player);
  if (amount <= 0 || armor <= 0) return { player, absorbed: 0, rest: Math.max(0, amount) };
  const absorbed = Math.min(armor, amount);
  return { player: { ...player, armor: armor - absorbed }, absorbed, rest: amount - absorbed };
}

/** L'événement d'une Armure qui bouge — rien si elle ne bouge pas. */
export function armorEvents(playerId: string, delta: number, armorAfter: number, turnNumber: number): GameEvent[] {
  if (delta === 0) return [];
  return [{ type: "ARMOR_CHANGED", turnNumber, timestamp: Date.now(), playerId, delta, armorAfter }];
}

/**
 * Dégâts au Navire, Armure comprise : rend le joueur (Armure puis Ancrage
 * entamés), l'Ancrage réellement perdu et les événements d'Armure.
 */
export function damageShip(player: PlayerState, amount: number, turnNumber: number): { player: PlayerState; anchorLoss: number; events: GameEvent[] } {
  const { player: armored, absorbed, rest } = absorbShipDamage(player, amount);
  return {
    player: { ...armored, anchor: armored.anchor - rest },
    anchorLoss: rest,
    events: armorEvents(player.id, -absorbed, armorOf(armored), turnNumber),
  };
}
