import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";

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
