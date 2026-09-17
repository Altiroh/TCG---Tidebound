import type { CardInstance } from "@/game/cards/types";

/**
 * Valeur sentinelle d'un drapeau consommé POUR TOUJOURS ("la première fois
 * que...", `TriggeredAbility.onceEver`) : aucun numéro de tour ne vaut -1,
 * la capacité ne se réarme donc jamais.
 */
export const ONCE_EVER_USED = -1;

/** La capacité "1x par tour" identifiée par `key` est-elle encore disponible sur cette instance CE tour-ci ? Un drapeau `ONCE_EVER_USED` ne se réarme jamais. */
export function oncePerTurnAvailable(unit: CardInstance, key: string, turnNumber: number): boolean {
  const flag = (unit.oncePerTurnFlags ?? {})[key];
  return flag !== turnNumber && flag !== ONCE_EVER_USED;
}

/** Marque la capacité `key` comme utilisée POUR CE TOUR sur cette instance — ou pour toute la partie si `onceEver`. */
export function markOncePerTurnUsed(unit: CardInstance, key: string, turnNumber: number, onceEver = false): CardInstance {
  return { ...unit, oncePerTurnFlags: { ...(unit.oncePerTurnFlags ?? {}), [key]: onceEver ? ONCE_EVER_USED : turnNumber } };
}
