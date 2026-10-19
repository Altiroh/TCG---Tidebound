import { RARITY_ORDER, type CardRarity } from "@/game/boosters";
import { CARD_ARTWORKS } from "@/game/cosmetics/artworks";
import { CARD_FINISHES } from "@/game/cosmetics/finishes";

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
 * Rang d'une ÉDITION à rareté égale : la finition compte d'abord (la plus
 * rare, Star Foil, en dernier), puis l'illustration (Classique, Styled,
 * Styled Full-Art). Une édition classique vaut 0.
 */
function editionRank(card: BoosterOpeningCard): number {
  return CARD_FINISHES.indexOf(card.finish ?? "classique") * CARD_ARTWORKS.length + CARD_ARTWORKS.indexOf(card.artwork ?? "classique");
}

/**
 * ORDRE DE RÉVÉLATION des cartes d'une ouverture : de la plus commune à la
 * plus rare, pour qu'on les retourne PETIT À PETIT et que la tension monte —
 * les communes ouvrent la rangée (elles se retournent d'elles-mêmes), la
 * meilleure carte la ferme. À rareté égale, une édition exceptionnelle
 * (finition, illustration alternative) passe après l'édition classique.
 * Tri stable : à égalité complète, l'ordre du tirage est gardé.
 */
export function sortForReveal(cards: readonly BoosterOpeningCard[]): BoosterOpeningCard[] {
  return [...cards].sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || editionRank(a) - editionRank(b));
}
