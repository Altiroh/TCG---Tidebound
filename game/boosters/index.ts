/**
 * Boosters (méta-jeu) — format, pity, protection Abyssale, tirage.
 *
 * Logique PURE et déterministe : aucun accès base ni réseau, RNG à graine.
 * La consommation du booster et l'écriture de la collection se font
 * atomiquement en base (`features/boosters/actions.ts`).
 */
export {
  DEPTH_SLOT_BASE_ABYSSAL_CHANCE,
  PITY,
  RARITY_WEIGHTS,
  RECYCLE_VALUE,
  STANDARD_BOOSTER_PRICE,
} from "@/game/boosters/constants";

export { abyssalChanceWithPity, drawBooster } from "@/game/boosters/draw";
// La rareté d'une carte est une donnée de CODE : les écritures en base en
// découlent (`scripts/seedCards.ts`), jamais l'inverse.
export { rarityForCardId, cardIdsMissingRarity, assertRarityCoverage } from "@/game/boosters/cardRarity";
export { RARITY_ORDER } from "@/game/boosters/types";
// De quelle EXTENSION vient un sachet, et ce qu'il raconte — du contenu de
// jeu, relu par un test comme le texte d'une carte.
export {
  ARCHETYPE_DOMINANCE_THRESHOLD,
  BOOSTER_EXTENSIONS,
  OFF_SHELF_BOOSTER_IDS,
  SHELF_BOOSTER_IDS,
  boosterExtension,
  boosterExtensionLabel,
} from "@/game/boosters/extensions";
export type { BoosterExtension, BoosterKind } from "@/game/boosters/extensions";
export type {
  BoosterPoolCard,
  BoosterSlotRule,
  CardRarity,
  DrawBoosterInput,
  DrawBoosterResult,
  DrawnCard,
} from "@/game/boosters/types";
