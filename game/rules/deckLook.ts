import { getCardDefinition } from "@/game/cards/sets/core";
import type { CardInstance } from "@/game/cards/types";
import type { DeckLookChoice } from "@/game/state/types";

/** Pourquoi une carte regardée ne peut pas être prise — `null` si elle le peut. */
export type DeckLookRefusal = "type" | "archetype" | "color";

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
  if (choice.takeableCardTypes && !choice.takeableCardTypes.includes(def.type)) return "type";
  if (choice.takeableArchetype && def.archetype !== choice.takeableArchetype) return "archetype";
  if (choice.takeableChromaticColors && !(def.chromatic?.colors ?? []).some((c) => choice.takeableChromaticColors!.includes(c))) {
    return "color";
  }
  return null;
}

export function isDeckLookTakeable(choice: DeckLookChoice, card: CardInstance): boolean {
  return deckLookRefusal(choice, card) === null;
}
