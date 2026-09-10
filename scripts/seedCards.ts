/**
 * Synchronise la table Supabase `cards` (et `system_decks`/
 * `system_deck_cards`) à partir du catalogue TypeScript, seule source de
 * vérité pour la RÉSOLUTION d'une partie (`game/cards/sets/core.ts`,
 * `game/cards/decks/preconstructed.ts`). `cards` en base n'est qu'un
 * miroir utilisé par les systèmes de collection/boosters/deckbuilding —
 * ce script les garde en phase plutôt que de dupliquer les 81 cartes à la
 * main dans une migration SQL.
 *
 * `rarity`/`rarity_weight` ne sont PAS dans `CardDefinition` (ce sont des
 * données de collection, pas de gameplay) : ce script les laisse à leur
 * valeur par défaut ('common'/55) pour toute carte sans entrée dans
 * `RARITY_OVERRIDES` ci-dessous. Compléter cette table dès que le design
 * verrouille la rareté carte par carte (cf. TODO dans la migration
 * `supabase/migrations/20260910120000_cards_collection_economy.sql`).
 *
 * Usage : npx tsx scripts/seedCards.ts
 * (nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans l'environnement)
 */
import { createClient } from "@supabase/supabase-js";
import { CORE_SET, getMaxCopies } from "@/game";
import { PRECONSTRUCTED_DECKS } from "@/game";

const RARITY_WEIGHTS: Record<string, number> = {
  common: 55,
  uncommon: 28,
  rare: 12,
  abyssal: 5,
};

/**
 * Rareté par carte — TODO design (non verrouillé par `TCG_DATABASE.md` à
 * ce jour). Toute carte absente de cette table reste 'common' par défaut ;
 * ne pas se fier à ce placeholder pour équilibrer de vrais boosters.
 */
const RARITY_OVERRIDES: Record<string, "common" | "uncommon" | "rare" | "abyssal"> = {};

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
  const rows = CORE_SET.map((def) => {
    const rarity = RARITY_OVERRIDES[def.id] ?? "common";
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
      set_code: "core",
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

async function main() {
  const supabase = createServiceClient();
  await seedCards(supabase);
  await seedSystemDecks(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
