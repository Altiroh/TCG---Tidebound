import { RARITY_ORDER, type CardRarity } from "@/game/boosters";
import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { editionRank } from "@/game/cosmetics/editions";
import { ARTWORK_RESALE_MULTIPLIER, FINISH_RESALE_MULTIPLIER } from "@/features/collection/recycleValue";

/**
 * Palier VISUEL d'une carte pendant l'ouverture : les six raretés de la
 * collection, chacune avec sa lumière (cf. `BoosterOpening.module.css`,
 * « Réaction lumineuse par rareté »).
 *
 * La scène n'en avait que trois (standard / rare / abyssal) : une commune et
 * une peu commune se retournaient pareil, une Légendaire comme une Rare. Le
 * type reste distinct de `CardRarity` par son nom — la scène ne dépend pas
 * du modèle serveur — mais il en suit les paliers un pour un.
 */
export type BoosterOpeningRarity = CardRarity;

/** Une carte telle que la scène d'ouverture la consomme. */
export interface BoosterOpeningCard {
  /** Clé stable dans le booster (une même carte peut apparaître deux fois). */
  id: string;
  /** Carte du catalogue affichée une fois retournée. Absente : face provisoire « Carte test ». */
  cardId?: string;
  rarity: BoosterOpeningRarity;
  /** Carte que le joueur ne possédait pas avant cette ouverture : badge « Nouveau ». */
  isNew?: boolean;
  /** Finition TRÈS rare de l'exemplaire (Monochrome, Star Foil…) : appliquée à la carte, et annoncée. */
  finish?: import("@/game/cosmetics/finishes").CardFinish;
  /** Illustration alternative de l'exemplaire (Styled, Styled Full-Art) : montrée, annoncée, et mise en scène. */
  artwork?: import("@/game/cosmetics/artworks").CardArtwork;
  /** Édition jamais obtenue (illustration ou finition rare) : badge « Nouveau », même si la carte est déjà possédée. */
  editionNew?: boolean;
}

/** Traduction d'une rareté de collection vers un palier de mise en scène — un pour un. */
export function toOpeningRarity(rarity: CardRarity): BoosterOpeningRarity {
  return rarity;
}

export const OPENING_RARITY_LABEL: Record<BoosterOpeningRarity, string> = {
  common: "Commune",
  uncommon: "Peu commune",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  abyssal: "Abyssale",
};

/** Raretés qui méritent un son de révélation et une poussière lumineuse. */
export function isHighRarity(rarity: BoosterOpeningRarity): boolean {
  return rarity === "rare" || rarity === "epic" || rarity === "legendary" || rarity === "abyssal";
}

/**
 * VALEUR FINALE d'un exemplaire : base de sa rareté × multiplicateur
 * d'illustration × multiplicateur de finition — le barème de revente
 * (`editionRecycleValueOf`), non arrondi. C'est elle qui dit ce qu'on a
 * vraiment tiré : une Rare Star Foil vaut bien plus qu'une Épique classique.
 */
function finalValue(card: BoosterOpeningCard): number {
  return RECYCLE_VALUE[card.rarity] * ARTWORK_RESALE_MULTIPLIER[card.artwork ?? "classique"] * FINISH_RESALE_MULTIPLIER[card.finish ?? "classique"];
}

/**
 * ORDRE DE RÉVÉLATION des cartes d'une ouverture : de la moins précieuse à
 * la plus précieuse, selon la VALEUR FINALE de l'exemplaire (rareté ET
 * variante), pour qu'on les retourne petit à petit et que la tension monte.
 * Une classique Star Foil passe après la même carte classique, et après
 * une rareté supérieure qui ne vaut pas autant qu'elle. À valeur égale, la
 * rareté de la carte, puis l'édition (`editionRank`) départagent ; tri
 * stable au-delà : l'ordre du tirage est gardé.
 */
export function sortForReveal(cards: readonly BoosterOpeningCard[]): BoosterOpeningCard[] {
  const edition = (card: BoosterOpeningCard) => editionRank({ artwork: card.artwork ?? "classique", finish: card.finish ?? "classique" });
  return [...cards].sort(
    (a, b) => finalValue(a) - finalValue(b) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || edition(a) - edition(b),
  );
}
