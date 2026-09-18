import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";
import { getPlayer, type GameState, type PlayerId } from "@/game/state/types";

/**
 * « Choisissez une carte dans votre Cimetière » — qui est éligible, et pour
 * quelles cartes la question se pose.
 *
 * Ce choix n'existait que sur le BRIS d'un Objet : `graveyardChoicesForBreak`
 * vivait dans `breakObject.ts`, avec son filtre, sa validation et son écran.
 * Le Lot 13 le demande ailleurs — « Tu viens jouer ? » le pose à son
 * ARRIVÉE, « Tu m'avais promis » depuis une RÉACTION — et recopier la
 * mécanique à chaque entrée aurait fini par la faire diverger : trois
 * filtres, trois validations, et un moteur qui finit par choisir à la place
 * du joueur là où l'un des trois a été oublié.
 *
 * Le filtre vit donc ici, une fois, et chaque entrée (`playCard`,
 * `breakObject`, `activateReaction`) s'y branche.
 */

/** Cartes du Cimetière de `playerId` éligibles à cet effet `moveGraveyardCardToHand` (type, sous-type, coût max — cf. `EffectDefinition.filter`). */
export function eligibleGraveyardCards(state: GameState, playerId: PlayerId, effect: EffectDefinition): CardInstance[] {
  const player = getPlayer(state, playerId);
  const allowedTypes = effect.filter?.cardTypes ?? (effect.filter?.cardType ? [effect.filter.cardType] : undefined);
  return player.graveyard.filter((card) => {
    const cardDef = getCardDefinition(card.cardId);
    if (allowedTypes && !(allowedTypes as readonly string[]).includes(cardDef.type)) return false;
    // « récupérez une Marionnette » (Rappel du Public), « une unité Un Dead »
    // (La Petite Chanson) : le sous-type restreint le choix comme le type.
    if (effect.filter?.subtype && cardDef.subtype !== effect.filter.subtype) return false;
    if (effect.filter?.maxCost !== undefined && cardDef.cost > effect.filter.maxCost) return false;
    return true;
  });
}

/** Le premier effet d'une liste qui repêche au Cimetière — `undefined` si aucun ne le fait. */
export function graveyardEffectIn(effects: readonly EffectDefinition[] | undefined): EffectDefinition | undefined {
  return (effects ?? []).find((e) => e.type === "moveGraveyardCardToHand");
}

/** Choix à poser pour une liste d'effets donnée — vide si elle ne repêche pas, ou si rien n'est éligible. */
export function graveyardChoicesFor(
  state: GameState,
  playerId: PlayerId,
  effects: readonly EffectDefinition[] | undefined
): CardInstance[] {
  const effect = graveyardEffectIn(effects);
  return effect ? eligibleGraveyardCards(state, playerId, effect) : [];
}

/** Choix à poser en BRISANT cet Objet (ex: Grappin de Récupération). */
export function graveyardChoicesForBreak(state: GameState, playerId: PlayerId, def: CardDefinition): CardInstance[] {
  return graveyardChoicesFor(state, playerId, def.onBreakEffects);
}

/** Choix à poser en POSANT cette carte (ex: Tu viens jouer ?, Lot 13). */
export function graveyardChoicesForPlay(state: GameState, playerId: PlayerId, def: CardDefinition): CardInstance[] {
  return graveyardChoicesFor(state, playerId, def.onPlayEffects);
}

/** Choix à poser en ACTIVANT cette capacité facultative (ex: Tu m'avais promis, Lot 13). */
export function graveyardChoicesForAbility(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  abilityIndex: number
): CardInstance[] {
  return graveyardChoicesFor(state, playerId, getCardDefinition(cardId).abilities?.[abilityIndex]?.effects);
}

/**
 * Le choix annoncé est-il recevable ?
 *
 * Trois réponses, et elles ne veulent pas dire la même chose :
 *   - `ok` : rien à demander (la liste ne repêche pas, ou le Cimetière n'a
 *     rien d'éligible — l'effet se résout alors sans rien récupérer,
 *     convention « si possible » déjà en vigueur pour le ciblage
 *     d'Équipement) ;
 *   - `missing` : il fallait choisir et le joueur n'a rien désigné ;
 *   - `illegal` : il a désigné une carte que le filtre refuse.
 */
export function validateGraveyardChoice(
  state: GameState,
  playerId: PlayerId,
  effects: readonly EffectDefinition[] | undefined,
  chosenInstanceId: string | undefined
): { ok: true } | { ok: false; reason: "missing" | "illegal" } {
  const effect = graveyardEffectIn(effects);
  if (!effect) return { ok: true };
  const eligible = eligibleGraveyardCards(state, playerId, effect);
  if (chosenInstanceId) {
    // Un choix explicite doit toujours être valide, même s'il n'était pas le
    // SEUL disponible.
    return eligible.some((c) => c.instanceId === chosenInstanceId) ? { ok: true } : { ok: false, reason: "illegal" };
  }
  return eligible.length > 0 ? { ok: false, reason: "missing" } : { ok: true };
}
