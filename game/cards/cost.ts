import type { CardDefinition } from "@/game/cards/types";
import { getWaterDefinition } from "@/game/environment/waterData";

/**
 * Coût effectif d'une carte, modifié par les Eaux actuelles (ex: "les
 * Équipements coûtent 1 de moins" dans les Récifs Rouges). Jamais négatif.
 * Le système de coût/ressource complet reste à cadrer (cadrage section 21) ;
 * ceci ne fait qu'appliquer ce que les Eaux annoncent déjà pouvoir faire.
 */
export function computeEffectiveCost(def: CardDefinition, waterId: string): number {
  const water = getWaterDefinition(waterId);
  const tags = def.tags ?? [];
  const delta = (water.costModifierByTag ?? [])
    .filter((mod) => tags.includes(mod.tag))
    .reduce((sum, mod) => sum + mod.delta, 0);
  return Math.max(0, def.cost + delta);
}
