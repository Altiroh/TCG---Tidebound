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
export type {
  BoosterPoolCard,
  BoosterSlotRule,
  CardRarity,
  DrawBoosterInput,
  DrawBoosterResult,
  DrawnCard,
} from "@/game/boosters/types";
