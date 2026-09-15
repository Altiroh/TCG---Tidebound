import { RECYCLE_VALUE } from "@/game/boosters/constants";
import { rarityForCardId } from "@/game/boosters/cardRarity";

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
