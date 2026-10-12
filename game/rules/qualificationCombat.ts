import { getCardDefinition } from "@/game/cards/sets/core";
import { effectiveQualifications, qualificationValue, type CardQualification, type QualificationId } from "@/game/cards/qualifications";
import type { CardInstance } from "@/game/cards/types";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * QUALIFICATIONS AU COMBAT — ce que le moteur en lit pour décider QUI peut
 * attaquer, COMBIEN de fois, et QUOI. Les effets du coup lui-même (Brèche,
 * Sangsue, Éclaboussure…) sont appliqués par `game/actions/attack.ts`, qui
 * lit les mêmes fonctions. Registre et règles en attente :
 * `game/cards/qualifications.ts`.
 *
 * Pas de bloqueurs : Tidebound attaque des cibles autorisées, la Garde
 * protège l'accès au Navire. Les qualifications ne font que changer le
 * nombre d'attaques et les cibles permises.
 */

/** Qualifications effectives d'une unité en jeu (définition + modificateurs). */
export function unitQualifications(unit: Pick<CardInstance, "cardId" | "modifiers">): CardQualification[] {
  return effectiveQualifications(unit, getCardDefinition(unit.cardId));
}

export function hasQualification(unit: Pick<CardInstance, "cardId" | "modifiers">, id: QualificationId): boolean {
  return unitQualifications(unit).some((q) => q.id === id);
}

/** Valeur X d'une qualification de l'unité, ou 0 si elle ne la porte pas. */
export function unitQualificationValue(unit: Pick<CardInstance, "cardId" | "modifiers">, id: QualificationId): number {
  return qualificationValue(unitQualifications(unit), id) ?? 0;
}

/** Attaques déjà résolues ce tour (`attacksThisTurn`, ou 1 pour un état d'avant les qualifications). */
export function attacksMade(unit: Pick<CardInstance, "attacksThisTurn" | "hasAttackedThisTurn">): number {
  return unit.attacksThisTurn ?? (unit.hasAttackedThisTurn ? 1 : 0);
}

/** Créatures et Marins de l'adversaire de `playerId` — ce que compte Déluge. */
export function opposingUnitCount(state: GameState, playerId: PlayerId): number {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent) return 0;
  return opponent.board.filter((u) => {
    const type = getCardDefinition(u.cardId).type;
    return type === "creature" || type === "marin";
  }).length;
}

/**
 * Attaques permises à cette unité pendant la phase de combat, en tout :
 *   - 1 par défaut ;
 *   - Rafale : 2 ;
 *   - Déluge : autant que de Créatures et Marins adverses, RECOMPTÉS au
 *     moment de la demande (0 s'il n'y en a pas) ;
 *   - Rafale + Déluge : le plus grand des deux (provisoire) ;
 *   - Carnage : +1 par cible détruite ce tour (`bonusAttacksThisTurn`).
 */
export function attacksAllowed(state: GameState, playerId: PlayerId, unit: CardInstance): number {
  const qualifications = unitQualifications(unit);
  const has = (id: QualificationId) => qualifications.some((q) => q.id === id);
  const rafale = has("rafale") ? 2 : 1;
  const base = has("deluge") ? (has("rafale") ? Math.max(rafale, opposingUnitCount(state, playerId)) : opposingUnitCount(state, playerId)) : rafale;
  return base + (unit.bonusAttacksThisTurn ?? 0);
}

/** Attaques qu'il lui reste ce tour (jamais négatif). */
export function attacksRemaining(state: GameState, playerId: PlayerId, unit: CardInstance): number {
  return Math.max(0, attacksAllowed(state, playerId, unit) - attacksMade(unit));
}

/** Peut-elle viser le Navire adverse ? Non avec Déluge : ses attaques ne ciblent jamais le Navire. */
export function canAttackShipDirectly(unit: Pick<CardInstance, "cardId" | "modifiers">): boolean {
  return !hasQualification(unit, "deluge");
}

/** Contournement : elle passe la Garde pour atteindre le Navire. */
export function bypassesGardeByQualification(unit: Pick<CardInstance, "cardId" | "modifiers">): boolean {
  return hasQualification(unit, "contournement");
}
