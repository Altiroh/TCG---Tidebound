/**
 * Le seed en SQL, à coller dans l'éditeur SQL de Supabase.
 *
 * Même contenu exactement que `npm run seed:cards` (les deux lisent
 * `scripts/seedRows.ts`), mais sans clé service_role : utile quand on n'a
 * pas le secret sous la main, ou pour relire ce qui va être écrit avant de
 * l'écrire.
 *
 * Le SQL produit est IDEMPOTENT : `insert ... on conflict do update`, comme
 * les upserts du script. On peut le rejouer autant de fois qu'on veut ; une
 * carte déjà présente est mise à jour, jamais dupliquée. Rien n'est
 * supprimé — les quêtes retirées du catalogue sont seulement désactivées,
 * exactement comme le fait le script.
 *
 * Usage : npm run seed:sql > seed.sql
 */
import { cardRows, questRows, systemDeckCardRows, systemDeckRows, type SeedRow, type SeedValue } from "@/scripts/seedRows";

/** Un littéral SQL sûr : les chaînes sont échappées par doublement de l'apostrophe, jamais concaténées telles quelles. */
function literal(value: SeedValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Valeur numérique non finie dans le seed : ${value}`);
    return String(value);
  }
  if (Array.isArray(value)) {
    // Tableau Postgres (`text[]`) construit élément par élément plutôt
    // qu'en littéral `'{...}'` : l'échappement reste celui des chaînes.
    return `array[${value.map((item) => literal(item)).join(", ")}]::text[]`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Un `insert ... on conflict do update` pour un lot de lignes homogènes.
 * `conflictColumns` est la clé qui décide d'un doublon ; toutes les autres
 * colonnes sont mises à jour depuis la ligne proposée (`excluded`).
 */
function upsertStatement(table: string, rows: SeedRow[], conflictColumns: string[]): string {
  if (rows.length === 0) return `-- ${table} : rien à écrire.\n`;

  const columns = Object.keys(rows[0]!);
  const updated = columns.filter((column) => !conflictColumns.includes(column));
  const values = rows.map((row) => `  (${columns.map((column) => literal(row[column] ?? null)).join(", ")})`).join(",\n");

  const setClause =
    updated.length > 0
      ? `do update set\n${updated.map((column) => `  ${column} = excluded.${column}`).join(",\n")}`
      : "do nothing";

  return [
    `-- ${table} : ${rows.length} ligne${rows.length > 1 ? "s" : ""}.`,
    `insert into public.${table} (${columns.join(", ")}) values`,
    values,
    `on conflict (${conflictColumns.join(", ")}) ${setClause};`,
    "",
  ].join("\n");
}

function main() {
  const cards = cardRows();
  const decks = systemDeckRows();
  const deckCards = systemDeckCardRows();
  const quests = questRows();

  const codes = quests.map((quest) => literal(quest.code ?? null)).join(", ");

  const sql = [
    "-- Seed du catalogue Tidebound — généré par `npm run seed:sql`.",
    "-- NE PAS ÉDITER À LA MAIN : régénérer depuis le catalogue TypeScript",
    "-- (`game/cards/sets/core.ts`, `game/cards/decks/preconstructed.ts`,",
    "-- `game/quests/catalog.ts`) via `scripts/seedRows.ts`.",
    "--",
    "-- Idempotent : rejouable sans risque, rien n'est supprimé.",
    "",
    "begin;",
    "",
    upsertStatement("cards", cards, ["id"]),
    upsertStatement("system_decks", decks, ["id"]),
    upsertStatement("system_deck_cards", deckCards, ["system_deck_id", "card_id"]),
    upsertStatement("quests", quests, ["code"]),
    "-- Quêtes retirées du catalogue : désactivées, jamais supprimées (des",
    "-- joueurs peuvent les avoir en cours ou à réclamer).",
    `update public.quests set is_enabled = false where code is null or code not in (${codes});`,
    "",
    "commit;",
    "",
  ].join("\n");

  process.stdout.write(sql);
}

main();
