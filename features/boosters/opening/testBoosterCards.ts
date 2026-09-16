import { rarityForCardId } from "@/game/boosters/cardRarity";
import type { CardRarity } from "@/game/boosters/types";
import { CORE_SET } from "@/game/cards/sets/core";
import { toOpeningRarity, type BoosterOpeningCard } from "@/features/boosters/opening/types";

/**
 * Contenu de TEST de la scène d'ouverture : de vraies cartes du catalogue
 * local (`CORE_SET`), tirées au hasard à chaque ouverture.
 *
 * Rien à voir avec le vrai tirage : pas de pity, pas de protection
 * Abyssale, aucun appel Supabase, rien n'est enregistré. Le vrai contenu
 * reste décidé côté serveur (`openBooster()`), jamais par le navigateur.
 *
 * TODO(booster-serveur) : remplacer par le résultat de `openBooster()`
 * (`features/boosters/actions.ts`) converti via `toOpeningRarity`.
 */

/** Pondération d'un emplacement de test : poids relatifs par rareté. */
type SlotWeights = Partial<Record<CardRarity, number>>;

/**
 * Booster standard de test : **huit** cartes, comme le vrai (voir les
 * `booster_slots` de la migration `20260916120000`) — quatre Communes, deux
 * Peu communes, puis les deux emplacements « hauts ».
 *
 * Le nombre d'emplacements doit suivre celui du vrai booster, pas être
 * choisi pour la commodité : il en avait cinq, et c'est exactement ce qui a
 * masqué un débordement de la rangée à l'écran — le test montrait une
 * rangée qui tenait, l'ouverture réelle une rangée coupée aux deux bords.
 *
 * Les RARETÉS, elles, restent volontairement plus généreuses que le vrai
 * tirage : c'est un outil de réglage d'animation, on veut voir chaque
 * lumière de rareté en quelques ouvertures.
 */
const STANDARD_TEST_SLOTS: readonly SlotWeights[] = [
  { common: 1 },
  { common: 1 },
  { common: 1 },
  { common: 1, uncommon: 1 },
  { uncommon: 1 },
  { uncommon: 3, rare: 2 },
  { rare: 2, epic: 1, legendary: 1 },
  { uncommon: 1, rare: 2, epic: 1, legendary: 1, abyssal: 1 },
];

/** Mini Booster de Bienvenue : 4 cartes, ni Rare ni Abyssale. */
const WELCOME_TEST_SLOTS: readonly SlotWeights[] = [{ common: 1 }, { common: 1 }, { common: 1, uncommon: 1 }, { uncommon: 1 }];

function testSlotsFor(boosterId: string): readonly SlotWeights[] {
  return boosterId === "welcome_tutorial" ? WELCOME_TEST_SLOTS : STANDARD_TEST_SLOTS;
}

let poolByRarity: Map<CardRarity, string[]> | null = null;

function cardPool(): Map<CardRarity, string[]> {
  if (!poolByRarity) {
    poolByRarity = new Map();
    for (const definition of CORE_SET) {
      // Même pool que les vrais boosters (`features/boosters/actions.ts`) :
      // seul le lot "core" est tiré, les lots d'archétype attendent leur
      // booster dédié.
      const rarity = rarityForCardId(definition.id);
      if (!rarity) continue;
      // Exception d'essai : Épiques et Légendaires n'existent que dans les
      // lots d'archétype. Sans eux, leur lumière ne se verrait jamais ici.
      const testOnlyRarity = rarity === "epic" || rarity === "legendary";
      if (definition.setCode !== undefined && definition.setCode !== "core" && !testOnlyRarity) continue;
      const ids = poolByRarity.get(rarity) ?? [];
      ids.push(definition.id);
      poolByRarity.set(rarity, ids);
    }
  }
  return poolByRarity;
}

function pickWeighted(weights: SlotWeights, random: () => number): CardRarity {
  const entries = Object.entries(weights) as [CardRarity, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  for (const [rarity, weight] of entries) {
    cursor -= weight;
    if (cursor < 0) return rarity;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Tire un booster de test. `random` est injectable pour les tests ;
 * `Math.random` suffit ici puisque rien n'est persisté.
 */
export function drawTestBoosterCards(boosterId: string, random: () => number = Math.random): BoosterOpeningCard[] {
  const pool = cardPool();
  const used = new Set<string>();

  return testSlotsFor(boosterId).flatMap((weights, slotIndex) => {
    const rarity = pickWeighted(weights, random);
    let drawn = takeFrom(pool, rarity, used, random);

    // Pool épuisé — il n'y a qu'UNE Légendaire et deux Épiques dans le
    // catalogue, deux emplacements peuvent viser la même. On rabat sur les
    // autres raretés de l'emplacement plutôt que de rendre une carte de
    // moins : le booster de test doit en poser autant que le vrai, c'est
    // précisément ce qu'on vient y régler.
    if (!drawn) {
      for (const fallback of Object.keys(weights) as CardRarity[]) {
        drawn = takeFrom(pool, fallback, used, random);
        if (drawn) break;
      }
    }
    if (!drawn) return [];

    used.add(drawn.cardId);
    // Essai : une carte sur deux passe pour « nouvelle », pour voir le badge.
    return [{ id: `${slotIndex}-${drawn.cardId}`, cardId: drawn.cardId, rarity: toOpeningRarity(drawn.rarity), isNew: random() < 0.5 }];
  });
}

/** Une carte encore inutilisée de cette rareté, ou `null` si le pool est vide. */
function takeFrom(
  pool: Map<CardRarity, string[]>,
  rarity: CardRarity,
  used: ReadonlySet<string>,
  random: () => number
): { cardId: string; rarity: CardRarity } | null {
  const candidates = (pool.get(rarity) ?? []).filter((cardId) => !used.has(cardId));
  if (candidates.length === 0) return null;
  return { cardId: candidates[Math.floor(random() * candidates.length)]!, rarity };
}
