import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";
import type { CardArtwork } from "@/game/cosmetics/artworks";
import type { CardFinish } from "@/game/cosmetics/finishes";
import type { CardEdition } from "@/game/cosmetics/editions";

/**
 * Barème de revente — module PUR, sans aucune dépendance serveur.
 *
 * Séparé de `recycleService.ts` exprès : ce dernier importe le client
 * service_role, et un composant client qui aurait besoin du seul barème
 * l'aurait entraîné dans le bundle du navigateur avec lui. Ici il n'y a que
 * du catalogue.
 */

/**
 * Ce que rapporte UN exemplaire de cette carte, ou `null` si la carte est
 * inconnue. La valeur croît avec la rareté (`RECYCLE_VALUE`, dérivé du prix
 * du booster) : c'est le catalogue qui la fixe, jamais l'écran ni la base.
 */
export function recycleValueOf(cardId: string): number | null {
  const rarity = rarityForCardId(cardId);
  return rarity ? RECYCLE_VALUE[rarity] : null;
}

/**
 * REVENTE PAR ÉDITION (Collection visuelle V2). Le prix garanti au jeu
 * d'une édition est :
 *
 *   base de la rareté × multiplicateur d'illustration × multiplicateur de finition
 *
 * arrondi pour se lire (`roundResale`).
 *
 * Barème RELEVÉ le 18/10/2026 (décision de l'utilisatrice : « comme une carte
 * Magic ultra rare ») : la valeur suit enfin la rareté. Une Styled Full-Art
 * Star Foil vaut 20 000 fois sa Classique — 220 000 Tides pour Aberration
 * Vorace, 640 000 pour une Épique. C'est un jackpot assumé : il sort moins
 * d'une fois sur 900 000 boosters pour une carte précise, et sa part dans
 * la revente MOYENNE d'un booster reste infime. Le garde-fou est là, pas
 * dans le plafond : `tests/game/obtentionCartes.test.ts` vérifie qu'un
 * booster entièrement revendu rapporte en moyenne moins que son prix.
 *
 * AJUSTÉ le 28/10/2026 avec les taux de tirage : Styled et Full-Art sortent
 * 1,5 et 2 fois plus souvent, les finitions 2 fois plus — leurs
 * multiplicateurs baissent d'autant (Styled 10 → 7, Full-Art 100 → 50,
 * finitions divisées par 2), pour que la revente MOYENNE d'un booster reste
 * celle d'avant et sous son prix. La Styled Full-Art Star Foil vaut encore
 * 5 000 fois sa Classique.
 */
export const ARTWORK_RESALE_MULTIPLIER: Record<CardArtwork, number> = {
  classique: 1,
  styled: 7,
  "styled-fa": 50,
};

export const FINISH_RESALE_MULTIPLIER: Record<CardFinish, number> = {
  classique: 1,
  monochrome: 1.5,
  foil: 2,
  negative: 4,
  prismatic: 12,
  "star-foil": 100,
};

/** À l'unité sous 100, à la dizaine jusqu'à 999, à la cinquantaine au-delà. */
export function roundResale(value: number): number {
  if (value < 100) return Math.max(1, Math.round(value));
  if (value < 1000) return Math.round(value / 10) * 10;
  return Math.round(value / 50) * 50;
}

/** Ce que rapporte UN exemplaire de cette édition, ou `null` si la carte est inconnue. */
export function editionRecycleValueOf(cardId: string, edition: CardEdition): number | null {
  const base = recycleValueOf(cardId);
  if (base === null) return null;
  return roundResale(base * ARTWORK_RESALE_MULTIPLIER[edition.artwork] * FINISH_RESALE_MULTIPLIER[edition.finish]);
}

/**
 * Exemplaires qu'on GARDE toujours : le maximum qu'un deck peut contenir
 * (`getMaxCopies`), jamais moins d'un. `null` si la carte est inconnue.
 */
export function keptCopiesOf(cardId: string): number | null {
  const def = CARD_DATABASE.get(cardId);
  return def ? Math.max(1, getMaxCopies(def)) : null;
}

/** Exemplaires en SURPLUS — au-delà du maximum d'un deck, donc inutilisables. */
export function surplusOf(cardId: string, owned: number): number {
  const keep = keptCopiesOf(cardId);
  if (keep === null || recycleValueOf(cardId) === null) return 0;
  return Math.max(0, Math.floor(owned) - keep);
}

export interface SurplusLine {
  cardId: string;
  /** Exemplaires possédés, et ceux qu'on garde. */
  owned: number;
  keep: number;
  /** Exemplaires vendus, et ce qu'ils rapportent. */
  quantity: number;
  unitValue: number;
  tides: number;
}

/**
 * Récapitulatif du « Revendre le surplus » de la Collection : chaque carte
 * au-delà de son maximum, la plus lucrative d'abord.
 */
export function surplusPlan(ownedCounts: Readonly<Record<string, number>>): SurplusLine[] {
  const lines: SurplusLine[] = [];
  for (const [cardId, owned] of Object.entries(ownedCounts)) {
    const quantity = surplusOf(cardId, owned);
    if (quantity < 1) continue;
    const unitValue = recycleValueOf(cardId)!;
    lines.push({ cardId, owned, keep: keptCopiesOf(cardId)!, quantity, unitValue, tides: unitValue * quantity });
  }
  return lines.sort((a, b) => b.tides - a.tides || a.cardId.localeCompare(b.cardId));
}
