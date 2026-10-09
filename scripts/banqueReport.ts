/**
 * BANQUE D'ÉQUILIBRAGE — lecture des parties RÉELLES (`balance_*`,
 * migration `20261030120000_banque_statistiques`).
 *
 * Le pendant de `npm run balance` : celui-là fait jouer des bots, celui-ci
 * lit ce que les joueurs ont vraiment joué. Rien n'est écrit.
 *
 * Usage :
 *   npm run banque                 → parties, Navires, cartes (camp joueurs)
 *   npm run banque -- bot          → mêmes tableaux, camp du bot
 *   npm run banque -- carte <id>   → une carte, version par version
 *   npm run banque -- 30           → seuil de parties pour lister une carte (défaut 20)
 *
 * Lecture des taux de cartes : voir l'en-tête de la vue
 * `balance_card_overview`. L'écart « vue − non vue » est le plus parlant.
 */
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const camp = args.includes("bot");
const cardIndex = args.indexOf("carte");
const cardId = cardIndex >= 0 ? args[cardIndex + 1] : undefined;
const threshold = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 20);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const pct = (value: unknown) => (value === null || value === undefined ? "—" : `${(Number(value) * 100).toFixed(1)} %`);
const num = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

async function read<T>(view: string, build: (query: ReturnType<typeof db.from>) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await build(db.from(view));
  if (error) {
    console.error(`[${view}] ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

type Row = Record<string, unknown>;

async function main() {
  if (cardId) {
    const versions = await read<Row>("balance_card_versions", (q) => q.select("*").eq("card_id", cardId).eq("is_bot", camp).order("first_seen_at"));
    console.log(`\n${cardId} — ${camp ? "camp du bot" : "camp des joueurs"}, version par version\n`);
    console.table(
      versions.map((row) => ({
        version: row.def_hash,
        depuis: String(row.first_seen_at).slice(0, 10),
        parties: num(row.matches_in_deck),
        "V% deck": pct(row.win_rate_in_deck),
        "V% vue": pct(row.win_rate_seen),
        "V% jouée": pct(row.win_rate_played),
        poses: num(row.plays),
      }))
    );
    return;
  }

  const matches = await read<Row>("balance_match_overview", (q) => q.select("*").order("matches", { ascending: false }));
  console.log("\nParties\n");
  console.table(
    matches.map((row) => ({
      mode: row.mode,
      bot: row.bot_difficulty ?? "",
      parties: num(row.matches),
      "V% 1er joueur": pct(row.first_player_win_rate),
      nuls: num(row.draws),
      tours: num(row.avg_table_turns),
      "durée (s)": num(row.avg_seconds),
      abandons: num(row.concedes),
    }))
  );

  const ships = await read<Row>("balance_ship_overview", (q) => q.select("*").eq("is_bot", camp).order("win_rate", { ascending: false }));
  console.log(`\nNavires — ${camp ? "camp du bot" : "camp des joueurs"}\n`);
  console.table(
    ships.map((row) => ({
      navire: row.ship_id,
      parties: num(row.matches),
      "V%": pct(row.win_rate),
      "V% 1er": pct(row.win_rate_first),
      "V% 2e": pct(row.win_rate_second),
      tours: num(row.avg_own_turns),
      "capacités/partie": num(row.avg_ability_uses),
    }))
  );

  const cards = await read<Row>("balance_card_overview", (q) =>
    q.select("*").eq("is_bot", camp).gte("matches_in_deck", threshold).order("win_rate_seen", { ascending: false })
  );
  console.log(`\nCartes (au moins ${threshold} parties en deck) — ${camp ? "camp du bot" : "camp des joueurs"}\n`);
  console.table(
    cards.map((row) => {
      const seen = row.win_rate_seen === null ? null : Number(row.win_rate_seen);
      const notSeen = row.win_rate_not_seen === null ? null : Number(row.win_rate_not_seen);
      return {
        carte: row.card_id,
        decks: num(row.matches_in_deck),
        "V% deck": pct(row.win_rate_in_deck),
        "V% vue": pct(seen),
        "V% non vue": pct(notSeen),
        "écart": seen !== null && notSeen !== null ? `${((seen - notSeen) * 100).toFixed(1)} pts` : "—",
        "V% jouée": pct(row.win_rate_played),
        "tour moyen": num(row.avg_play_turn),
        "dégâts/app.": num(row.damage_per_appearance),
        "kills/app.": num(row.kills_per_appearance),
      };
    })
  );
}

void main();
