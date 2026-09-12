import { nextFloat, nextInt } from "@/game/rng";
import { DEPTH_SLOT_BASE_ABYSSAL_CHANCE, PITY } from "@/game/boosters/constants";
import {
  RARITY_ORDER,
  type BoosterPoolCard,
  type BoosterSlotRule,
  type CardRarity,
  type DrawBoosterInput,
  type DrawBoosterResult,
  type DrawnCard,
} from "@/game/boosters/types";

/**
 * Tirage d'un booster — fonction PURE et déterministe (RNG à graine,
 * `game/rng.ts`), donc entièrement testable sans base de données.
 *
 * Elle ne fait QUE décider des cartes. La consommation du booster,
 * l'écriture de la collection, l'historique d'ouverture et la mise à jour
 * du pity sont faits atomiquement en base (`open_booster`, cf.
 * `features/boosters/actions.ts`) : le cadrage exige que l'ouverture soit
 * « entièrement autoritaire côté serveur » et que « le client ne génère et
 * ne reroll jamais les cartes lui-même ».
 */

/**
 * Chance du slot Profondeur d'être Abyssale, pity inclus.
 *
 * Exposée pour les tests : c'est la seule partie du tirage qui a une forme
 * analytique vérifiable, et la plus facile à casser par erreur d'indice
 * (« après 10 boosters » vs « au 10e booster »).
 */
export function abyssalChanceWithPity(packsSinceAbyssal: number, baseChance: number): number {
  const packNumber = Math.max(0, Math.floor(packsSinceAbyssal)) + 1;
  if (packNumber >= PITY.guaranteeAtPack) return 1;
  if (packNumber <= PITY.rampStartsAfterPacks) return baseChance;

  // Montée linéaire du booster (rampStartsAfterPacks + 1) — le 11e — jusqu'au
  // booster garanti exclu. Au 11e la chance est déjà strictement supérieure
  // à la base ("augmente progressivement"), au 20e elle vaut 1 (branche
  // ci-dessus).
  const span = PITY.guaranteeAtPack - PITY.rampStartsAfterPacks;
  const step = packNumber - PITY.rampStartsAfterPacks;
  return baseChance + (1 - baseChance) * (step / span);
}

/** Cartes du pool appartenant à un palier donné. */
function cardsOfRarity(pool: readonly BoosterPoolCard[], rarity: CardRarity): BoosterPoolCard[] {
  return pool.filter((card) => card.rarity === rarity);
}

/**
 * Palier réellement utilisable le plus proche de `wanted` : on descend la
 * rareté, puis on remonte. Nécessaire pour que le booster produise toujours
 * son nombre de cartes même si un palier est vide (catalogue partiel, pool
 * thématique restreint, raretés pas encore assignées). Sans ce repli, un
 * seul palier vide rendrait l'ouverture impossible.
 */
function resolveAvailableRarity(pool: readonly BoosterPoolCard[], wanted: CardRarity): CardRarity | null {
  const wantedIndex = RARITY_ORDER.indexOf(wanted);

  for (let i = wantedIndex; i >= 0; i--) {
    const rarity = RARITY_ORDER[i]!;
    if (cardsOfRarity(pool, rarity).length > 0) return rarity;
  }
  for (let i = wantedIndex + 1; i < RARITY_ORDER.length; i++) {
    const rarity = RARITY_ORDER[i]!;
    if (cardsOfRarity(pool, rarity).length > 0) return rarity;
  }
  return null;
}

/** Tire un palier dans une pondération, en appliquant le pity à la part Abyssale. */
function pickWeightedRarity(
  weights: Partial<Record<CardRarity, number>>,
  packsSinceAbyssal: number,
  seed: number
): { rarity: CardRarity | null; nextSeed: number } {
  const entries = RARITY_ORDER.map((rarity) => ({ rarity, weight: weights[rarity] ?? 0 })).filter((e) => e.weight > 0);
  if (entries.length === 0) return { rarity: null, nextSeed: seed };

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  const declaredAbyssal = (weights.abyssal ?? 0) / totalWeight;
  // Un slot pondéré sans part Abyssale déclarée ne doit pas se mettre à en
  // produire par pity : seul le slot Profondeur (qui en déclare une) est
  // concerné par le cadrage.
  const canRollAbyssal = (weights.abyssal ?? 0) > 0;
  const abyssalChance = canRollAbyssal
    ? abyssalChanceWithPity(packsSinceAbyssal, declaredAbyssal || DEPTH_SLOT_BASE_ABYSSAL_CHANCE)
    : 0;

  const roll = nextFloat(seed);
  if (canRollAbyssal && roll.value < abyssalChance) {
    return { rarity: "abyssal", nextSeed: roll.nextState };
  }

  // Le reste de la probabilité est réparti entre les autres paliers au
  // prorata de leurs poids d'origine : renforcer l'Abyssale ne doit pas
  // changer l'équilibre relatif entre Peu commune et Rare.
  const others = entries.filter((e) => e.rarity !== "abyssal");
  if (others.length === 0) return { rarity: "abyssal", nextSeed: roll.nextState };

  const othersTotal = others.reduce((sum, e) => sum + e.weight, 0);
  const pick = nextFloat(roll.nextState);
  let cursor = pick.value * othersTotal;
  for (const entry of others) {
    cursor -= entry.weight;
    if (cursor < 0) return { rarity: entry.rarity, nextSeed: pick.nextState };
  }
  return { rarity: others[others.length - 1]!.rarity, nextSeed: pick.nextState };
}

/**
 * Choisit une carte dans un palier.
 *
 * Protection Abyssale — VERROUILLÉE : « privilégier une Abyssale que le
 * joueur ne possède pas encore ; si toutes les Abyssales du pool sont déjà
 * possédées, effectuer un tirage normal parmi elles ». Elle ne s'applique
 * qu'aux Abyssales : les doublons des autres paliers sont assumés par le
 * cadrage (ils alimentent le recyclage).
 */
function pickCardOfRarity(
  pool: readonly BoosterPoolCard[],
  rarity: CardRarity,
  ownedCardIds: ReadonlySet<string>,
  seed: number
): { card: BoosterPoolCard | null; nextSeed: number } {
  const candidates = cardsOfRarity(pool, rarity);
  if (candidates.length === 0) return { card: null, nextSeed: seed };

  let eligible = candidates;
  if (rarity === "abyssal") {
    const unowned = candidates.filter((card) => !ownedCardIds.has(card.id));
    if (unowned.length > 0) eligible = unowned;
  }

  const draw = nextInt(seed, eligible.length);
  return { card: eligible[draw.value] ?? null, nextSeed: draw.nextState };
}

/** Rareté visée par un slot, avant repli sur les paliers réellement peuplés. */
function wantedRarityFor(
  slot: BoosterSlotRule,
  packsSinceAbyssal: number,
  seed: number
): { rarity: CardRarity | null; nextSeed: number } {
  if (slot.guaranteedRarity) return { rarity: slot.guaranteedRarity, nextSeed: seed };
  if (slot.weightedRarities) return pickWeightedRarity(slot.weightedRarities, packsSinceAbyssal, seed);
  return { rarity: null, nextSeed: seed };
}

export function drawBooster({ slots, pool, ownedCardIds, packsSinceAbyssal, seed }: DrawBoosterInput): DrawBoosterResult {
  const cards: DrawnCard[] = [];
  // Copie locale de la collection : une Abyssale tirée au slot 7 ne doit
  // pas être re-proposée par la protection au slot 8 du MÊME booster.
  const owned = new Set(ownedCardIds);
  let rngSeed = seed;
  let abyssalPulled = false;

  const orderedSlots = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);

  for (const slot of orderedSlots) {
    const wanted = wantedRarityFor(slot, packsSinceAbyssal, rngSeed);
    rngSeed = wanted.nextSeed;
    if (!wanted.rarity) continue;

    const rarity = resolveAvailableRarity(pool, wanted.rarity);
    if (!rarity) continue;

    const picked = pickCardOfRarity(pool, rarity, owned, rngSeed);
    rngSeed = picked.nextSeed;
    if (!picked.card) continue;

    const isNew = !owned.has(picked.card.id);
    owned.add(picked.card.id);
    if (rarity === "abyssal") abyssalPulled = true;

    cards.push({ slotIndex: slot.slotIndex, cardId: picked.card.id, rarity, isNew });
  }

  return {
    cards,
    abyssalPulled,
    nextPacksSinceAbyssal: abyssalPulled ? 0 : packsSinceAbyssal + 1,
    nextSeed: rngSeed,
  };
}
