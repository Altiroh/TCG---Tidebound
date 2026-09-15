import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { getCardDefinition, getMaxCopies } from "@/game";

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
 * Exemplaires qu'un deck personnel accepte de cette carte — sa limite
 * propre (`CardDefinition.maxCopies`), jamais une constante globale : une
 * Légendaire plafonne plus bas qu'une Commune, et un seuil uniforme de 3
 * aurait rendu ses exemplaires en trop invendables.
 *
 * `null` pour une carte inconnue du catalogue.
 */
export function keepThreshold(cardId: string): number | null {
  try {
    return getMaxCopies(getCardDefinition(cardId));
  } catch {
    return null;
  }
}

/**
 * Combien d'exemplaires sont REVENDABLES sur `owned` possédés : l'EXCÉDENT,
 * c'est-à-dire ce qui dépasse ce qu'un deck peut accueillir.
 *
 * C'était auparavant « tout sauf le dernier », ce qui rendait vendable un
 * 2ᵉ exemplaire dont un deck a parfaitement l'usage — une erreur qu'aucun
 * achat ne rattrape. Le seuil est donc celui du jeu : au-delà, l'exemplaire
 * ne peut servir nulle part, et lui seul part.
 */
export function sellableCopies(cardId: string, owned: number): number {
  const keep = keepThreshold(cardId);
  if (keep === null) return 0;
  return Math.max(0, owned - keep);
}
