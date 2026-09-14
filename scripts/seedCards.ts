/**
 * Synchronise la table Supabase `cards` (et `system_decks`/
 * `system_deck_cards`) à partir du catalogue TypeScript, seule source de
 * vérité pour la RÉSOLUTION d'une partie (`game/cards/sets/core.ts`,
 * `game/cards/decks/preconstructed.ts`). `cards` en base n'est qu'un
 * miroir utilisé par les systèmes de collection/boosters/deckbuilding —
 * ce script les garde en phase plutôt que de dupliquer les cartes à la
 * main dans une migration SQL.
 *
 * `rarity`/`rarity_weight` ne sont PAS dans `CardDefinition` (ce sont des
 * données de collection, pas de gameplay) : elles viennent de
 * `game/boosters/cardRarity.ts`, alimenté par l'audit de design. Le script
 * REFUSE de tourner si une carte du catalogue n'y a pas d'entrée — un
 * défaut silencieux à 'common' rendrait tous les boosters faux (plus aucune
 * Peu commune/Rare/Abyssale à tirer) sans que rien ne le signale.
 *
 * Usage : npx tsx scripts/seedCards.ts
 * (nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans l'environnement)
 */
import { createClient } from "@supabase/supabase-js";
import { CORE_SET, PRECONSTRUCTED_DECKS, getMaxCopies } from "@/game";
import { RARITY_WEIGHTS } from "@/game/boosters";
import { assertRarityCoverage, rarityForCardId } from "@/game/boosters/cardRarity";
import { QUEST_CATALOG } from "@/game/quests";

/**
 * `cards`, `system_decks` et `system_deck_cards` ne sont pas dans
 * `Database` (cf. lib/supabase/types.ts, volontairement partiel) : ce
 * client est donc non-typé sur `.from(...)`, plutôt que de parsemer le
 * fichier de `@ts-expect-error` par appel.
 */
function createServiceClient(): { from(table: string): ReturnType<ReturnType<typeof createClient>["from"]> } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis pour lancer ce script.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function seedCards(supabase: ReturnType<typeof createServiceClient>) {
  // Avant toute écriture : mieux vaut un seed qui refuse de tourner qu'une
  // base où la moitié du catalogue est Commune par défaut.
  assertRarityCoverage();

  const rows = CORE_SET.map((def) => {
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
      // carte (Lot 10 Cra-Poiscail). C'est ce code qui décide dans quels
      // boosters la carte peut tomber — cf. `features/boosters/actions.ts`.
      set_code: def.setCode ?? "core",
      version: 1,
    };
  });

  const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Échec du seed cards: ${error.message}`);
  console.log(`cards: ${rows.length} cartes synchronisées.`);
}

async function seedSystemDecks(supabase: ReturnType<typeof createServiceClient>) {
  const deckRows = PRECONSTRUCTED_DECKS.map((deck) => ({
    id: deck.id,
    ship_id: deck.shipId,
    name: deck.name,
    is_enabled: true,
    version: 1,
  }));

  const { error: deckError } = await supabase.from("system_decks").upsert(deckRows, { onConflict: "id" });
  if (deckError) throw new Error(`Échec du seed system_decks: ${deckError.message}`);

  const cardRows = PRECONSTRUCTED_DECKS.flatMap((deck) => {
    const quantities = new Map<string, number>();
    for (const cardId of deck.cardIds) quantities.set(cardId, (quantities.get(cardId) ?? 0) + 1);
    return Array.from(quantities.entries()).map(([card_id, quantity]) => ({
      system_deck_id: deck.id,
      card_id,
      quantity,
    }));
  });

  const { error: cardsError } = await supabase
    .from("system_deck_cards")
    .upsert(cardRows, { onConflict: "system_deck_id,card_id" });
  if (cardsError) throw new Error(`Échec du seed system_deck_cards: ${cardsError.message}`);

  console.log(`system_decks: ${deckRows.length} decks, ${cardRows.length} lignes de composition synchronisées.`);
}

/**
 * Miroir du catalogue de quêtes (`game/quests/catalog.ts`), synchronisé sur
 * `quests.code`. Une quête retirée du catalogue n'est pas supprimée (des
 * joueurs peuvent l'avoir en cours ou à réclamer) : elle est désactivée, et
 * n'est donc plus attribuée.
 */
async function seedQuests(supabase: ReturnType<typeof createServiceClient>) {
  const rows = QUEST_CATALOG.map((quest) => ({
    code: quest.code,
    quest_type: quest.questType,
    objective_key: quest.objectiveKey,
    target_value: quest.targetValue,
    reward_currency: quest.rewardTides,
    reward_booster_definition_id: quest.rewardBoosterId ?? null,
    bot_progress_allowed: quest.botProgressAllowed,
    period: quest.questType,
    is_enabled: true,
  }));

  const { error } = await supabase.from("quests").upsert(rows, { onConflict: "code" });
  if (error) throw new Error(`Échec du seed quests: ${error.message}`);

  const codes = rows.map((row) => `"${row.code}"`).join(",");
  const { error: disableError } = await supabase
    .from("quests")
    .update({ is_enabled: false })
    .not("code", "in", `(${codes})`);
  if (disableError) throw new Error(`Échec de la désactivation des quêtes retirées: ${disableError.message}`);

  console.log(`quests: ${rows.length} quêtes synchronisées.`);
}

async function main() {
  const supabase = createServiceClient();
  await seedCards(supabase);
  await seedSystemDecks(supabase);
  await seedQuests(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
