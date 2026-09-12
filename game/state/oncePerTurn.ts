import type { CardInstance } from "@/game/cards/types";

/** La capacité "1x par tour" identifiée par `key` est-elle encore disponible sur cette instance CE tour-ci ? */
export function oncePerTurnAvailable(unit: CardInstance, key: string, turnNumber: number): boolean {
  return (unit.oncePerTurnFlags ?? {})[key] !== turnNumber;
}

/** Marque la capacité `key` comme utilisée POUR CE TOUR sur cette instance. */
export function markOncePerTurnUsed(unit: CardInstance, key: string, turnNumber: number): CardInstance {
  return { ...unit, oncePerTurnFlags: { ...(unit.oncePerTurnFlags ?? {}), [key]: turnNumber } };
}
