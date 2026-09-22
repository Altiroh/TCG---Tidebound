import { BOOSTER_EXTENSIONS } from "@/game/boosters";
import { BOOSTER_POOLS } from "@/game/boosters/pools";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import type { BoosterInventory } from "@/features/boosters/actions";

/**
 * Inventaire FACTICE du laboratoire de layout (`/game/boosters-preview`).
 *
 * L'écran « Mes boosters » ne s'affiche que connecté : sans session, il
 * rend la carte « Connecte-toi » et rien d'autre. Régler les trois zones
 * demandait donc de se connecter à chaque essai, et de posséder la bonne
 * combinaison de sachets — dont, justement, celle qu'on ne possède PAS,
 * qui est la moitié du travail.
 *
 * Ce module fabrique l'inventaire à la main : aucun accès base, aucune
 * session, aucune écriture. Les noms viennent de `BOOSTER_EXTENSIONS`
 * depuis le 22/09/2026 — il en gardait sa propre copie, qui avait déjà
 * manqué l'arrivée du Nécessaire du Marin. Les prix, eux, restent écrits
 * ici : s'ils divergent de la base, c'est le laboratoire qui a tort.
 *
 * La réserve est volontairement DÉSÉQUILIBRÉE : des extensions bien
 * fournies, une à un seul exemplaire, et deux à zéro. C'est cette dernière
 * ligne qui dit si l'état « non possédée » se lit — grisé au centre, Ouvrir
 * éteint, Market allumé.
 */

/** Exemplaires en réserve — le cas de figure qu'on veut juger. */
const OWNED: Readonly<Record<string, number>> = {
  standard: 0,
  "poissons-pas-frais": 1,
  "etrangete-sous-marine": 5,
  "la-veillee-des-disparus": 7,
};

/** Boosters ouverts depuis la dernière Abyssale, pour voir le compteur de pity. */
const PITY_COUNTS: Readonly<Record<string, number>> = {
  "la-veillee-des-disparus": 14,
};

export function previewBoosterInventory(): BoosterInventory {
  return {
    isSignedIn: true,
    balance: 74266,
    ownedCardIds: [],
    boosters: BOOSTER_EXTENSIONS.map((extension) => {
      const pool = BOOSTER_POOLS[extension.boosterId] ?? [];
      return {
        boosterId: extension.boosterId,
        name: extension.name,
        cardCount: 8,
        price: extension.kind === "base" ? 100 : 150,
        isPurchasable: true,
        owned: OWNED[extension.boosterId] ?? 0,
        obtainedAt: null,
        packsSinceAbyssal: PITY_COUNTS[extension.boosterId] ?? 0,
        pool: pool.map((cardId) => ({ cardId, rarity: rarityForCardId(cardId) ?? "common" })),
      };
    }),
  };
}
