/**
 * Les LIGNES du seed, sans aucune connexion à Supabase.
 *
 * Extrait de `seedCards.ts` pour qu'il existe deux façons d'appliquer
 * exactement le même contenu :
 *
 *   - `npm run seed:cards` — upserts via la clé service_role (le chemin
 *     normal, en local ou en CI) ;
 *   - `npm run seed:sql` — le même contenu en SQL, à coller dans l'éditeur
 *     SQL de Supabase quand on n'a pas la clé service_role sous la main.
 *
 * Les deux doivent rester d'accord : c'est pour ça qu'ils partagent ce
 * fichier plutôt que de recopier la construction des lignes.
 *
 * `rarity`/`rarity_weight` ne sont PAS dans `CardDefinition` (ce sont des
 * données de collection, pas de gameplay) : elles viennent de
 * `game/boosters/cardRarity.ts`, alimenté par l'audit de design. La
 * construction REFUSE de tourner si une carte du catalogue n'y a pas
 * d'entrée — un défaut silencieux à 'common' rendrait tous les boosters
 * faux (plus aucune Peu commune/Rare/Abyssale à tirer) sans que rien ne le
 * signale.
 */
import { CORE_SET, PRECONSTRUCTED_DECKS, getMaxCopies } from "@/game";
import { RARITY_WEIGHTS } from "@/game/boosters";
import { assertRarityCoverage, rarityForCardId } from "@/game/boosters/cardRarity";
import { BOOSTER_POOLS } from "@/game/boosters/pools";
import { QUEST_CATALOG, questProgressKind } from "@/game/quests";

/** Une valeur telle qu'elle part en base : `null`, un scalaire, ou un tableau de texte (colonnes `text[]`). */
export type SeedValue = string | number | boolean | null | string[];
export type SeedRow = Record<string, SeedValue>;

/** Le catalogue de cartes, dans la forme de la table `cards`. */
export function cardRows(): SeedRow[] {
  // Avant toute écriture : mieux vaut un seed qui refuse de tourner qu'une
  // base où la moitié du catalogue est Commune par défaut.
  assertRarityCoverage();

  return CORE_SET.map((def) => {
    const rarity = rarityForCardId(def.id)!;
    return {
      id: def.id,
      name: def.name,
      card_type: def.type,
      subtypes: def.subtype ? [def.subtype] : [],
      reason_cost: def.cost,
      power: def.attack ?? null,
      resistance: def.health ?? null,
      rules_text: def.text ?? null,
      rarity,
      rarity_weight: RARITY_WEIGHTS[rarity],
      max_copies: getMaxCopies(def),
      duration_turns: def.durationTurns ?? null,
      visible_tides: def.visibleDuringTide ?? null,
      is_collectible: true,
      is_enabled: true,
      // Lot de diffusion : "core" par défaut, sinon celui déclaré par la
      // carte (Lot 10 Cra-Poiscail, Lot 11 Théâtre Englouti). PUREMENT
      // DOCUMENTAIRE depuis que les pools existent : ce qui décide où une
      // carte peut tomber, c'est `booster_pool_cards` (`game/boosters/pools.ts`).
      set_code: def.setCode ?? "core",
      version: 1,
    };
  });
}

/**
 * Appartenance carte ↔ booster, dans la forme de `booster_pool_cards`.
 *
 * C'est cette table qui décide où une carte peut tomber. Une carte peut
 * apparaître dans plusieurs pools (les trois passerelles du catalogue) :
 * ce sont des réimpressions, pas des cartes distinctes.
 */
export function boosterPoolCardRows(): SeedRow[] {
  return Object.entries(BOOSTER_POOLS).flatMap(([boosterId, cardIds]) =>
    cardIds.map((cardId) => ({
      booster_definition_id: boosterId,
      card_id: cardId,
      is_enabled: true,
    }))
  );
}

/** Les decks préconstruits, dans la forme de la table `system_decks`. */
export function systemDeckRows(): SeedRow[] {
  return PRECONSTRUCTED_DECKS.map((deck) => ({
    id: deck.id,
    ship_id: deck.shipId,
    name: deck.name,
    is_enabled: true,
    version: 1,
  }));
}

/** La composition des decks préconstruits, regroupée par carte (`system_deck_cards`). */
export function systemDeckCardRows(): SeedRow[] {
  return PRECONSTRUCTED_DECKS.flatMap((deck) => {
    const quantities = new Map<string, number>();
    for (const cardId of deck.cardIds) quantities.set(cardId, (quantities.get(cardId) ?? 0) + 1);
    return Array.from(quantities.entries()).map(([card_id, quantity]) => ({
      system_deck_id: deck.id,
      card_id,
      quantity,
    }));
  });
}

/** Le catalogue de quêtes, dans la forme de la table `quests`. */
export function questRows(): SeedRow[] {
  return QUEST_CATALOG.map((quest) => ({
    code: quest.code,
    name: quest.name,
    category: quest.category,
    progress_kind: questProgressKind(quest.objectiveKey),
    quest_type: quest.questType,
    objective_key: quest.objectiveKey,
    target_value: quest.targetValue,
    reward_currency: quest.rewardTides,
    // Les quêtes rapportent XP **et** Tides (Notion « Progression joueur » §9).
    reward_xp: quest.rewardXp,
    reward_booster_definition_id: quest.rewardBoosterId ?? null,
    bot_progress_allowed: quest.botProgressAllowed,
    period: quest.questType,
    is_enabled: true,
  }));
}
