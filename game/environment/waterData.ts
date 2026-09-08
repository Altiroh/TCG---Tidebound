import type { WaterDefinition } from "@/game/environment/types";
import { RULES } from "@/game/rules/constants";

/**
 * Eaux traversées : biome maritime commun aux deux joueurs, tiré
 * automatiquement par le moteur (jamais une carte de deck — cadrage
 * "Mécaniques verrouillées" section 25). Cible du prototype : 8 Eaux ;
 * seules 4 sont data-ées pour l'instant, le reste suivra le design des
 * cartes. `mer-etale` est un utilitaire de test/neutre, volontairement
 * exclu de `WATER_POOL` (le tirage aléatoire ne doit jamais y retomber).
 */
export const WATER_SET: WaterDefinition[] = [
  {
    id: "mer-etale",
    name: "Mer Étale",
    text: "Eaux neutres, sans particularité. Utilitaire de test, absent du pool de tirage.",
    duration: RULES.DEFAULT_WATER_DURATION,
  },
  {
    id: "mer-des-brumes",
    name: "Mer des Brumes",
    text: "Les cartes Brume gagnent en puissance ; l'Observation est plus difficile ; les créatures Abyssales sont dures à cibler.",
    duration: 2,
    statModifierByTag: [{ tag: "brume", attack: 1, health: 0 }],
    costModifierByTag: [{ tag: "observation", delta: 1 }],
  },
  {
    id: "recifs-rouges",
    name: "Récifs Rouges",
    text: "Les Équipements coûtent moins cher ; les créatures souffrent davantage des Tempêtes.",
    duration: 2,
    costModifierByTag: [{ tag: "equipement", delta: -1 }],
    tideDamageModifierByState: { tempete: 1 },
  },
  {
    id: "mer-de-verre",
    name: "Mer de Verre",
    text: "Les effets de Tempête sont réduits ; les cartes liées aux Abysses coûtent plus cher.",
    duration: 3,
    tideDamageModifierByState: { tempete: -1 },
    costModifierByTag: [{ tag: "abyssal", delta: 1 }],
  },
  {
    id: "eaux-noires",
    name: "Eaux Noires",
    text: "Chaque joueur perd de l'Ancrage supplémentaire pendant les Abysses.",
    duration: 2,
    tideDamageModifierByState: { abysses: 1 },
  },
];

export const WATER_DATABASE: ReadonlyMap<string, WaterDefinition> = new Map(
  WATER_SET.map((water) => [water.id, water])
);

/** Eaux réellement tirables par le moteur — exclut les utilitaires de test comme `mer-etale`. */
export const WATER_POOL: readonly WaterDefinition[] = WATER_SET.filter((w) => w.id !== "mer-etale");

export function getWaterDefinition(waterId: string): WaterDefinition {
  const water = WATER_DATABASE.get(waterId);
  if (!water) throw new Error(`Eaux inconnues: ${waterId}`);
  return water;
}
