import { hasMarker, markerCount, type MarkerId } from "@/game/cards/markers";
import { getCardDefinition } from "@/game/cards/sets/core";
import { STATUS_BENIE, STATUS_VOILE, UNIT_CARD_TYPES, type CardInstance, type CardType } from "@/game/cards/types";
import type { TideStateName } from "@/game/environment/types";

/**
 * ÉTATS D'UNE UNITÉ que les textes interrogent (Lot 20 — Les Bienfaits du
 * Fond, Lot 21 — L'Équipage Félin) : « une Créature bénie », « souillée »,
 * « qui bénéficie de Voile », « tant que la mer est en Houle »…
 *
 * Une seule grammaire, lue partout où un texte pose la question : filtre
 * de cible désignée (`ChosenUnitFilter.unitCondition`), filtre de masse
 * (`EffectDefinition.filter.unitCondition`), condition d'effet
 * (`conditionChosenTarget`, `conditionTriggerSource`), bonus conditionnel
 * sur soi (`selfBuffWhenConditions`) et aura (`targetCondition`,
 * `whileSelf`). Tous les champs fournis doivent être vrais (ET logique).
 */
export interface UnitCondition {
  /** `true` : l'unité est bénie (`STATUS_BENIE`) ; `false` : elle ne l'est pas. */
  blessed?: boolean;
  /**
   * `true` : l'unité bénéficie de Voile — intrinsèque (`STATUS_VOILE`) ou
   * conféré par un Équipement attaché ; `false` : d'aucun des deux.
   */
  hasVeil?: boolean;
  /** Porte au moins un marqueur de ce genre (« souillée » = un marqueur Souillure). */
  withMarker?: MarkerId;
  /** Ne porte aucun marqueur de ce genre. */
  withoutMarker?: MarkerId;
  /** La Marée courante est l'un de ces états (« pendant Houle ou Tempête »). */
  tideStateIn?: TideStateName[];
  /** Est de l'un de ces types de carte (« une Créature adverse attaque », Gros Bisou !). */
  cardTypes?: CardType[];
  /** Son contrôleur contrôle au moins N AUTRES unités (« tant que vous contrôlez une autre Créature »). */
  controllerOtherUnitsAtLeast?: number;
}

/** Ce qu'il faut savoir du plateau pour trancher une `UnitCondition`. */
export interface UnitConditionContext {
  /** Plateau du contrôleur de l'unité (elle y figure si elle est en jeu). */
  controllerBoard: readonly CardInstance[];
  tideState: TideStateName;
}

/** L'unité est-elle bénie ? Lu aussi au Cimetière : le statut y reste (« si elle était bénie »). */
export function isBlessed(unit: Pick<CardInstance, "statuses">): boolean {
  return unit.statuses?.includes(STATUS_BENIE) ?? false;
}

/** Porte-t-elle un Voile INTRINSÈQUE (gagné par un effet, pas par un Équipement) ? */
export function hasIntrinsicVeil(unit: Pick<CardInstance, "statuses">): boolean {
  return unit.statuses?.includes(STATUS_VOILE) ?? false;
}

/**
 * Bénéficie-t-elle de Voile, d'où qu'il vienne ? Intrinsèque, ou conféré
 * par un Équipement attaché (`equipGrantsKeywords: ["voile"]`) qui n'est
 * pas en partance. Voile ne se cumule pas : c'est un oui ou un non.
 */
export function unitHasVeil(unit: CardInstance, controllerBoard: readonly CardInstance[]): boolean {
  if (hasIntrinsicVeil(unit)) return true;
  return controllerBoard.some(
    (equip) =>
      equip.attachedToInstanceId === unit.instanceId &&
      !equip.pendingRemoval &&
      (getCardDefinition(equip.cardId).equipGrantsKeywords ?? []).includes("voile")
  );
}

/** La condition est-elle remplie par cette unité, dans ce contexte ? Sans condition, oui. */
export function unitMeetsCondition(unit: CardInstance, condition: UnitCondition | undefined, context: UnitConditionContext): boolean {
  if (!condition) return true;
  if (condition.cardTypes && !condition.cardTypes.includes(getCardDefinition(unit.cardId).type)) return false;
  if (condition.blessed !== undefined && isBlessed(unit) !== condition.blessed) return false;
  if (condition.hasVeil !== undefined && unitHasVeil(unit, context.controllerBoard) !== condition.hasVeil) return false;
  if (condition.withMarker && !hasMarker(unit, condition.withMarker)) return false;
  if (condition.withoutMarker && hasMarker(unit, condition.withoutMarker)) return false;
  if (condition.tideStateIn && !condition.tideStateIn.includes(context.tideState)) return false;
  if (condition.controllerOtherUnitsAtLeast !== undefined) {
    const autres = context.controllerBoard.filter(
      (other) => other.instanceId !== unit.instanceId && UNIT_CARD_TYPES.includes(getCardDefinition(other.cardId).type)
    ).length;
    if (autres < condition.controllerOtherUnitsAtLeast) return false;
  }
  return true;
}

/** Nombre de marqueurs `marker` sur un ensemble de cartes (« pour chaque marqueur Souillure présent sur le plateau »). */
export function countMarkers(cards: readonly CardInstance[], marker: MarkerId): number {
  return cards.reduce((sum, card) => sum + markerCount(card, marker), 0);
}
