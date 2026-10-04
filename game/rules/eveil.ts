import type { CardDefinition, CardInstance } from "@/game/cards/types";

/**
 * Lot 16 — ÉVEIL (Notion « Catalogue de cartes » § Lot 16, règle de
 * conception).
 *
 * « Éveil » désigne l'effet imprimé après le mot-clé « Éveil — ». Il se
 * résout quand la carte arrive en jeu, et chaque fois qu'un effet
 * « déclenche l'Éveil » de la carte — même si elle n'arrive pas. Plusieurs
 * Éveils d'une même carte peuvent avoir lieu dans le même tour.
 *
 * Données : une capacité `trigger: "onEveil"` SANS `triggeredBy` est
 * l'Éveil de sa carte. Avec `triggeredBy`, c'est un observateur (« quand un
 * autre Altéré s'Éveille »). La résolution vit dans `runEveil`
 * (`game/triggers/triggerBus.ts`).
 */

/** La carte a-t-elle un Éveil à résoudre ? Un observateur d'Éveil n'en est pas un. */
export function hasEveil(def: CardDefinition): boolean {
  return (def.abilities ?? []).some((ability) => ability.trigger === "onEveil" && !ability.triggeredBy);
}

/** Nombre d'Éveils de cette carte pendant le tour de table `turnNumber` (0 si aucun). */
export function eveilsThisTurn(unit: Pick<CardInstance, "eveils">, turnNumber: number): number {
  return unit.eveils && unit.eveils.turn === turnNumber ? unit.eveils.count : 0;
}
