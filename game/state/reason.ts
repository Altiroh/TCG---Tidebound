import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import type { PlayerState } from "@/game/state/types";

/**
 * Déraison — Raison négative (Notion "Gameplay — Raison, Déraison, healing
 * & passifs de Navires", piste à prototyper du 2026-09-12). La Raison peut
 * passer sous 0 jusqu'à un plancher de -`DERAISON_FLOOR_RATIO` × Raison max
 * (Raison max COURANTE : le malus des Abysses resserre donc aussi le
 * plancher). La dette est réglée en Ancrage à la fin du tour du joueur
 * (`game/actions/endTurn.ts`).
 */
export function reasonFloor(player: Pick<PlayerState, "reasonMax">): number {
  return -Math.floor(Math.max(0, player.reasonMax) * RULES.DERAISON_FLOOR_RATIO);
}

/** Raison maximale ATTEIGNABLE en ce moment : `reasonMax`, restreint par le plafond de début de partie s'il existe encore. */
export function reasonCeiling(player: Pick<PlayerState, "reasonMax" | "reasonCap">): number {
  return player.reasonCap === undefined ? player.reasonMax : Math.min(player.reasonMax, player.reasonCap);
}

/**
 * Plafond de début de partie pour le `ownTurnIndex`-ième tour du joueur
 * (1 = son premier tour), `undefined` une fois la courbe terminée.
 */
export function startingReasonCap(shipReasonMax: number, ownTurnIndex: number): number | undefined {
  const ratio = RULES.STARTING_REASON_CURVE[Math.max(1, ownTurnIndex) - 1];
  return ratio === undefined ? undefined : Math.ceil(shipReasonMax * ratio);
}

/** Dette de Déraison (points sous 0), 0 si la Raison est positive ou nulle. */
export function deraisonDebt(reason: number): number {
  return Math.max(0, -reason);
}

/**
 * Raison après une perte de `amount`, bornée par le plancher de Déraison.
 * Une perte ne fait jamais REMONTER la Raison : un joueur déjà sous le
 * plancher (plancher resserré par les Abysses après coup) y reste.
 */
export function reasonAfterLoss(player: Pick<PlayerState, "reason" | "reasonMax">, amount: number): number {
  if (amount <= 0) return player.reason;
  return Math.min(player.reason, Math.max(reasonFloor(player), player.reason - amount));
}

/**
 * Dégâts d'Ancrage que coûtera la dette de Déraison de `reason` à la fin du
 * tour de ce joueur, après réduction éventuelle de son Navire
 * (Pénitence). 0 hors Déraison. Utilisé par le règlement réel ET par l'UI
 * pour annoncer la conséquence avant qu'elle ne tombe.
 */
export function deraisonAnchorDamage(player: Pick<PlayerState, "shipId">, reason: number): number {
  const debt = deraisonDebt(reason);
  if (debt === 0) return 0;
  const reduction = getShipDefinition(player.shipId).deraisonDamageReduction ?? 0;
  return Math.max(0, debt * RULES.DERAISON_ANCHOR_DAMAGE_PER_POINT - reduction);
}

/** Le joueur peut-il payer `cost` sans descendre sous son plancher de Déraison ? */
export function canPayReason(player: Pick<PlayerState, "reason" | "reasonMax">, cost: number): boolean {
  return cost <= 0 || player.reason - cost >= reasonFloor(player);
}
