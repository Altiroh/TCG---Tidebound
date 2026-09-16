import type { AchievementStats } from "@/game/achievements/catalog";
import { CARD_BACKS, CARD_BACK_COSMETIC_KIND } from "@/game/cosmetics/cardBacks";
import { SHIP_FRAMES, SHIP_FRAME_COSMETIC_KIND } from "@/game/cosmetics/shipFrames";
import { isCosmeticUnlocked, isFree, type CosmeticSkin } from "@/game/cosmetics/unlock";

/**
 * Les deux familles de Collectables vues ENSEMBLE — c'est ce que le
 * serveur synchronise, et ce que l'écran Collectables affiche.
 *
 * Volontairement à part des deux catalogues : eux décrivent des objets,
 * celui-ci répond à la seule question qui demande de connaître le joueur —
 * « qu'est-ce qui est débloqué ? ». Même découpage que
 * `game/achievements/catalog.ts` (le catalogue) et `unlockedAchievements`
 * (l'évaluation).
 */

/** Une famille de Collectables, avec son nom de famille en base. */
export interface CollectableFamily {
  kind: string;
  label: string;
  items: readonly CosmeticSkin[];
}

export const COLLECTABLE_FAMILIES: readonly CollectableFamily[] = [
  { kind: CARD_BACK_COSMETIC_KIND, label: "Dos de carte", items: CARD_BACKS },
  { kind: SHIP_FRAME_COSMETIC_KIND, label: "Cadres de navire", items: SHIP_FRAMES },
];

/** Un Collectable à créditer en base. */
export interface CollectableGrant {
  /** `player_cosmetics.cosmetic_kind`. */
  kind: string;
  /** `player_cosmetics.cosmetic_id`. */
  id: string;
  label: string;
}

/**
 * Tout ce que les compteurs actuels justifient, gratuits exclus.
 *
 * Les gratuits ne sont jamais rendus : ils ne s'écrivent pas en base (une
 * ligne par joueur et par cosmétique gratuit ne dirait rien que le
 * catalogue ne dise déjà), et `owned` les traite à part.
 *
 * Les ACHATS sont rendus dès lors qu'ils sont dans `purchasedIds` — la
 * synchronisation ne les crée donc jamais, elle les constate. C'est l'achat
 * lui-même qui écrit la ligne.
 */
export function unlockedCollectables(stats: AchievementStats, purchasedIds: ReadonlySet<string>): CollectableGrant[] {
  const grants: CollectableGrant[] = [];
  for (const family of COLLECTABLE_FAMILIES) {
    for (const item of family.items) {
      if (isFree(item)) continue;
      if (item.unlock.kind === "purchase") continue;
      if (!isCosmeticUnlocked(item.unlock, stats, purchasedIds, item.id)) continue;
      grants.push({ kind: family.kind, id: item.id, label: item.label });
    }
  }
  return grants;
}

/**
 * Prix d'un Collectable achetable, ou `null` s'il ne s'achète pas.
 *
 * Le Market s'en sert pour dresser son rayon, et l'achat pour débiter le
 * bon montant : le prix vit au catalogue, jamais dans l'écran ni en base.
 */
export function collectablePrice(kind: string, id: string): number | null {
  const item = COLLECTABLE_FAMILIES.find((family) => family.kind === kind)?.items.find((entry) => entry.id === id);
  return item?.unlock.kind === "purchase" ? item.unlock.priceTides : null;
}

/** Tous les Collectables en vente, dans l'ordre des catalogues. */
export function purchasableCollectables(): Array<{ kind: string; item: CosmeticSkin; priceTides: number }> {
  const rows: Array<{ kind: string; item: CosmeticSkin; priceTides: number }> = [];
  for (const family of COLLECTABLE_FAMILIES) {
    for (const item of family.items) {
      if (item.unlock.kind === "purchase") rows.push({ kind: family.kind, item, priceTides: item.unlock.priceTides });
    }
  }
  return rows;
}
