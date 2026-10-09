import { hasSubtype } from "@/game/cards/subtypes";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { DeckLookChoice, DeckLookTakeGroup } from "@/game/state/types";

/** Pourquoi une carte regardée ne peut pas être prise — `null` si elle le peut. */
export type DeckLookRefusal = "type" | "archetype" | "color" | "subtype" | "cost";

/**
 * Une carte regardée (`DeckLookChoice.revealed`) peut-elle être prise en
 * main ? Le texte restreint parfois ce qui est PRENABLE — un type
 * (« une Structure parmi elles »), une famille (« une Sentinelle
 * Chromatique »), une couleur (Coffret aux Cinq Pierres) — jamais ce qui
 * est regardé.
 *
 * Une seule règle pour le moteur (`resolveChoice`), le bot et l'écran : la
 * copie de l'écran ne lisait que le type, et une carte hors famille y
 * paraissait sélectionnable.
 */
export function deckLookRefusal(choice: DeckLookChoice, card: CardInstance): DeckLookRefusal | null {
  const def = getCardDefinition(card.cardId);
  // Paniers (Banquet ancestral) : prenable si la carte convient à l'un d'eux.
  if (choice.takeGroups) {
    if (choice.takeGroups.some((group) => fitsGroup(group, card))) return null;
    return choice.takeGroups.some((group) => !group.cardTypes || group.cardTypes.includes(def.type)) ? "archetype" : "type";
  }
  if (choice.takeableCardTypes && !choice.takeableCardTypes.includes(def.type)) return "type";
  if (choice.takeableArchetype && def.archetype !== choice.takeableArchetype) return "archetype";
  if (choice.takeableChromaticColors && !(def.chromatic?.colors ?? []).some((c) => choice.takeableChromaticColors!.includes(c))) {
    return "color";
  }
  if (choice.takeableSubtype && !hasSubtype(def, choice.takeableSubtype)) return "subtype";
  if (choice.takeableMaxCost !== undefined && def.cost > choice.takeableMaxCost) return "cost";
  return null;
}

export function isDeckLookTakeable(choice: DeckLookChoice, card: CardInstance): boolean {
  return deckLookRefusal(choice, card) === null;
}

function fitsGroup(group: DeckLookTakeGroup, card: CardInstance): boolean {
  const def = getCardDefinition(card.cardId);
  if (group.cardTypes && !group.cardTypes.includes(def.type)) return false;
  if (group.archetype && def.archetype !== group.archetype) return false;
  return true;
}

/** Nombre total de cartes qu'on peut prendre : la somme des paniers, ou `take`. */
export function deckLookTakeLimit(choice: DeckLookChoice): number {
  return choice.takeGroups ? choice.takeGroups.reduce((sum, group) => sum + group.count, 0) : choice.take;
}

/**
 * La sélection tient-elle dans les paniers ? Chaque carte doit trouver une
 * place libre dans un panier qui l'accepte (une même carte ne compte qu'une
 * fois). Sans paniers : pas plus de `take` cartes, toutes prenables.
 * Recherche exhaustive : quelques cartes et deux ou trois paniers, au plus.
 */
export function deckLookSelectionFits(choice: DeckLookChoice, cards: CardInstance[]): boolean {
  if (!choice.takeGroups) return cards.length <= choice.take && cards.every((card) => deckLookRefusal(choice, card) === null);
  const places = choice.takeGroups.map((group) => group.count);
  const placer = (index: number): boolean => {
    if (index >= cards.length) return true;
    return choice.takeGroups!.some((group, g) => {
      if (places[g]! <= 0 || !fitsGroup(group, cards[index]!)) return false;
      places[g]! -= 1;
      const ok = placer(index + 1);
      places[g]! += 1;
      return ok;
    });
  };
  return placer(0);
}
