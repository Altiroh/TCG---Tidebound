/**
 * Synchronise la table Supabase `cards` (et `system_decks`/
 * `system_deck_cards`/`quests`) à partir du catalogue TypeScript, seule
 * source de vérité pour la RÉSOLUTION d'une partie
 * (`game/cards/sets/core.ts`, `game/cards/decks/preconstructed.ts`).
 * `cards` en base n'est qu'un miroir utilisé par les systèmes de
 * collection/boosters/deckbuilding — ce script les garde en phase plutôt
 * que de dupliquer les cartes à la main dans une migration SQL.
 *
 * Les lignes elles-mêmes viennent de `scripts/seedRows.ts`, partagé avec
 * `scripts/seedCardsSql.ts` : ce fichier-ci ne fait que les écrire.
 *
 * Usage : npm run seed:cards
 * (nécessite NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans
 * l'environnement — sans clé service_role, voir `npm run seed:sql`)
 */
import { createClient } from "@supabase/supabase-js";
import { cardRows, questRows, systemDeckCardRows, systemDeckRows } from "@/scripts/seedRows";

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
  const rows = cardRows();
  const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Échec du seed cards: ${error.message}`);
  console.log(`cards: ${rows.length} cartes synchronisées.`);
}

async function seedSystemDecks(supabase: ReturnType<typeof createServiceClient>) {
  const deckRows = systemDeckRows();
  const { error: deckError } = await supabase.from("system_decks").upsert(deckRows, { onConflict: "id" });
  if (deckError) throw new Error(`Échec du seed system_decks: ${deckError.message}`);

  const cardRows = systemDeckCardRows();
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
  const rows = questRows();
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
