import { getShipDefinition } from "@/game/environment/shipData";
import { RULES } from "@/game/rules/constants";
import type { PlayerState } from "@/game/state/types";

/*
 * Déraison — Raison négative (Notion "Gameplay — Raison, Déraison, healing
 * & passifs de Navires", piste à prototyper du 2026-09-12). La Raison peut
 * passer sous 0 SANS PLANCHER (décision de design du 2026-09-16 : « il n'y
 * a pas de Déraison max »). Ce qui retient le joueur n'est pas un refus du
 * moteur mais la dette : chaque point sous 0 est réglé en Ancrage à la fin
 * de son tour (`game/actions/endTurn.ts`), et l'écran l'annonce avant
 * qu'il ne s'engage (`useDeraisonWarning`). Un plancher à -50 % de la
 * Raison max avait été prototypé ; il rendait certains coups impossibles
 * là où la règle veut qu'ils soient seulement coûteux.
 */

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
 * Raison après une perte de `amount`. Aucune borne basse : la Déraison peut
 * se creuser autant que le joueur l'accepte — c'est la dette de fin de tour
 * qui le rappelle à l'ordre, pas le moteur. Une perte nulle ou négative ne
 * touche à rien.
 */
export function reasonAfterLoss(player: Pick<PlayerState, "reason">, amount: number): number {
  if (amount <= 0) return player.reason;
  return player.reason - amount;
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
