/**
 * Cibles légales d'un effet `chosenUnit` — le point de vérité PARTAGÉ
 * entre le moteur (qui refuse un choix illégal), le recensement des
 * réactions éligibles (qui ne doit pas proposer une capacité dont la
 * cible n'existe pas) et l'UI (qui ne doit pas inviter à cliquer sur une
 * carte que le moteur rejettera).
 *
 * Séparé de `resolveEffect.ts` pour que `triggerBus.ts` puisse s'en
 * servir sans dépendre de la résolution d'effets elle-même.
 */
import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES, type CardInstance } from "@/game/cards/types";
import { chromaticColorsOf, isOtherColorSentinel } from "@/game/rules/chromatic";
import type { ChosenUnitFilter, EffectDefinition, TargetSelector } from "@/game/effects/types";
import type { GameState, PlayerId } from "@/game/state/types";

export interface ChosenUnitCandidate {
  unit: CardInstance;
  ownerId: PlayerId;
}

/** Le filtre porté par cette cible, s'il s'agit bien d'une cible `chosenUnit` — `undefined` sinon. */
function filterOf(target: TargetSelector): ChosenUnitFilter | undefined {
  return target.kind === "chosenUnit" ? target.among : undefined;
}

/**
 * Permanents que `controllerId` peut désigner pour cet effet, dans l'ordre
 * du plateau. Sans filtre : tout permanent des deux plateaux (comportement
 * historique de `chosenUnit`, dont dépendent les Équipements et les effets
 * de dégâts ciblés).
 *
 * `sourceInstanceId` sert à l'exclusion "un AUTRE ..." : on écarte la
 * source, et le permanent qu'elle équipe si la source est un Équipement.
 */
export function eligibleChosenUnits(
  state: GameState,
  target: TargetSelector,
  controllerId: PlayerId,
  sourceInstanceId?: string,
  /** Carte qui a déclenché la capacité — écartée par `excludeTriggerSource` (« une AUTRE unité »). */
  triggerSourceInstanceId?: string
): ChosenUnitCandidate[] {
  if (target.kind !== "chosenUnit") return [];

  const all: ChosenUnitCandidate[] = state.players.flatMap((player) =>
    player.board.map((unit) => ({ unit, ownerId: player.id }))
  );

  const filter = target.among;
  if (!filter) return all;

  const excluded = new Set<string>();
  if (filter.excludeSource && sourceInstanceId) {
    excluded.add(sourceInstanceId);
    const source = all.find((c) => c.unit.instanceId === sourceInstanceId)?.unit;
    if (source?.attachedToInstanceId) excluded.add(source.attachedToInstanceId);
  }
  if (filter.excludeTriggerSource && triggerSourceInstanceId) excluded.add(triggerSourceInstanceId);

  // « une Sentinelle d'une autre couleur » que la SOURCE : ses couleurs
  // sont lues une fois, sur son propre plateau.
  const sourceEntry = sourceInstanceId ? all.find((c) => c.unit.instanceId === sourceInstanceId) : undefined;
  const sourceColors = sourceEntry
    ? chromaticColorsOf(sourceEntry.unit, state.players.find((p) => p.id === sourceEntry.ownerId)?.board ?? [])
    : [];

  return all.filter(({ unit, ownerId }) => {
    if (excluded.has(unit.instanceId)) return false;
    if (filter.opponentOnly) {
      if (ownerId === controllerId) return false;
    } else if ((filter.sameController ?? true) && ownerId !== controllerId) {
      return false;
    }
    if (filter.unitsOnly && !UNIT_CARD_TYPES.includes(getCardDefinition(unit.cardId).type)) return false;
    if (filter.cardTypes && !filter.cardTypes.includes(getCardDefinition(unit.cardId).type)) return false;
    if (filter.archetype) {
      const def = getCardDefinition(unit.cardId);
      if (def.archetype !== filter.archetype) return false;
      if (!UNIT_CARD_TYPES.includes(def.type)) return false;
    }
    // Le sous-type, lui, ne restreint PAS aux unités : la troupe du Théâtre
    // compte des Structures et des Objets, et « renvoyez une Marionnette
    // alliée » doit pouvoir les viser.
    if (filter.subtype && getCardDefinition(unit.cardId).subtype !== filter.subtype) return false;
    if (filter.maxCost !== undefined && getCardDefinition(unit.cardId).cost > filter.maxCost) return false;
    if (filter.damaged && unit.damageMarked <= 0) return false;
    if (filter.damagedThisTurn && (unit.damageMarked <= 0 || unit.lastDamageTurn !== state.turnNumber)) return false;
    if (filter.otherChromaticColorThanSource) {
      const board = state.players.find((p) => p.id === ownerId)?.board ?? [];
      if (!isOtherColorSentinel(unit, sourceColors, board)) return false;
    }
    return true;
  });
}

/** Ce choix précis est-il légal pour cet effet ? Utilisé par le moteur juste avant de résoudre. */
export function isEligibleChosenUnit(
  state: GameState,
  target: TargetSelector,
  controllerId: PlayerId,
  chosenInstanceId: string,
  sourceInstanceId?: string,
  triggerSourceInstanceId?: string
): boolean {
  return eligibleChosenUnits(state, target, controllerId, sourceInstanceId, triggerSourceInstanceId).some(
    (c) => c.unit.instanceId === chosenInstanceId
  );
}

/**
 * Cette liste d'effets réclame-t-elle une cible désignée, et existe-t-il
 * au moins un choix légal pour CHAQUE effet qui en demande une ? Répond
 * `needsTarget: false` quand aucun effet ne cible `chosenUnit`, et
 * `hasEligibleTarget: false` quand un effet en demande une qui n'existe
 * pas sur le plateau — la capacité ne doit alors pas être proposée.
 */
export function chosenTargetRequirement(
  state: GameState,
  effects: readonly EffectDefinition[],
  controllerId: PlayerId,
  sourceInstanceId?: string,
  triggerSourceInstanceId?: string
): { needsTarget: boolean; hasEligibleTarget: boolean } {
  const targeting = effects.filter((e) => e.target.kind === "chosenUnit");
  if (targeting.length === 0) return { needsTarget: false, hasEligibleTarget: true };
  return {
    needsTarget: true,
    hasEligibleTarget: targeting.every(
      (e) => eligibleChosenUnits(state, e.target, controllerId, sourceInstanceId, triggerSourceInstanceId).length > 0
    ),
  };
}

/** Filtre commun aux effets ciblés d'une capacité — pour l'UI, qui n'affiche qu'une consigne. `undefined` si aucun effet n'est filtré. */
export function chosenTargetFilter(effects: readonly EffectDefinition[]): ChosenUnitFilter | undefined {
  for (const effect of effects) {
    const filter = filterOf(effect.target);
    if (filter) return filter;
  }
  return undefined;
}
