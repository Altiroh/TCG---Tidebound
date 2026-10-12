/**
 * STATISTIQUES DES PARTIES — rapport Markdown de toutes les parties
 * terminées, recalculé depuis l'état final de chacune (`match_states`).
 *
 * Lancé depuis GitHub : onglet Actions → « Statistiques des parties » → Run
 * workflow ; le rapport s'affiche dans le résumé du job. En local :
 *   npm run stats:parties
 *   STATS_DAYS=7 STATS_MODE=pvp npm run stats:parties
 *
 * Ne dépend PAS des tables `balance_*` (banque d'équilibrage) : il relit le
 * journal d'événements de chaque partie, et marche donc aussi sur les
 * parties jouées avant elle. Rien n'est écrit en base.
 *
 * Variables :
 *   STATS_DAYS    fenêtre en jours (défaut 30, 0 = depuis toujours)
 *   STATS_MODE    tous | bot | pvp (défaut tous)
 *   STATS_TOP     longueur des classements (défaut 15)
 *   STATS_MIN     parties minimum pour classer un taux de victoire (défaut 10)
 *   STATS_OUTPUT  fichier où écrire le rapport (défaut : la sortie standard)
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { computeMatchBalanceReport, digestMatches, finishingBlow, FINISHING_LABELS, type DigestMatch, type FinishingKind, type Spread } from "@/game/balance";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import { getCardDefinition } from "@/game/cards/sets/core";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState } from "@/game/state/types";

const days = Number(process.env.STATS_DAYS ?? 30);
const mode = (process.env.STATS_MODE ?? "tous").toLowerCase();
const top = Number(process.env.STATS_TOP ?? 15) || 15;
const minMatches = Number(process.env.STATS_MIN ?? 10) || 10;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** `PlayerState.id` du bot dans une partie serveur (miroir de `BOT_PLAYER_ID`). */
const BOT_PLAYER_ID = "bot";
const PAGE = 1000;
const STATE_CHUNK = 40;

type MatchRow = Record<string, unknown> & { id: string };

async function readMatches(): Promise<MatchRow[]> {
  const rows: MatchRow[] = [];
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  for (let from = 0; ; from += PAGE) {
    // `*` : certaines colonnes (`bot_difficulty`) dépendent de migrations appliquées à la main.
    let query = db.from("matches").select("*").in("status", ["finished", "abandoned"]).order("created_at").range(from, from + PAGE - 1);
    if (since) query = query.gte("created_at", since);
    if (mode === "bot") query = query.eq("mode", "bot");
    if (mode === "pvp") query = query.neq("mode", "bot");
    const { data, error } = await query;
    if (error) throw new Error(`[matches] ${error.message}`);
    rows.push(...((data ?? []) as MatchRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function readStates(ids: string[]): Promise<Map<string, GameState>> {
  const states = new Map<string, GameState>();
  for (let i = 0; i < ids.length; i += STATE_CHUNK) {
    const { data, error } = await db.from("match_states").select("match_id, state").in("match_id", ids.slice(i, i + STATE_CHUNK));
    if (error) throw new Error(`[match_states] ${error.message}`);
    for (const row of data ?? []) states.set(row.match_id as string, row.state as GameState);
  }
  return states;
}

async function readDeckNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>(PLAYABLE_DECKS.map((deck) => [deck.id, deck.name]));
  const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id) && !names.has(id));
  for (let i = 0; i < uuids.length; i += 200) {
    const { data } = await db.from("player_decks").select("id, name").in("id", uuids.slice(i, i + 200));
    for (const row of data ?? []) names.set(row.id as string, `${row.name as string} (perso)`);
  }
  return names;
}

const cardName = (cardId: string) => {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
};
const shipName = (shipId: string) => {
  try {
    return getShipDefinition(shipId).name;
  } catch {
    return shipId;
  }
};

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)} %` : "—");
const fixed = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const clock = (seconds: number) => {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min ${s} s`;
};
const cell = (text: string) => text.replace(/\|/g, "\\|");

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_Aucune donnée._\n";
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

function spreadRow(label: string, value: Spread | null, format: (n: number) => string = fixed): string[] {
  if (!value) return [label, "—", "—", "—", "—"];
  return [label, format(value.min), format(value.median), format(value.mean), format(value.max)];
}

const MODE_LABELS: Record<string, string> = { bot: "Contre le bot", matchmaking: "Classée / rapide", private_invite: "Partie privée" };

async function main() {
  const rows = await readMatches();
  const states = await readStates(rows.map((row) => row.id));

  const matches: DigestMatch[] = [];
  let missing = 0;
  let broken = 0;
  for (const row of rows) {
    const state = states.get(row.id);
    if (!state?.players || !Array.isArray(state.eventLog)) {
      missing += 1;
      continue;
    }
    try {
      const rowMode = String(row.mode ?? "private_invite");
      const computed = computeMatchBalanceReport({ state, vsBot: rowMode === "bot" });
      // Journal sans horodatage exploitable : la durée vient des dates de la ligne.
      const wall = (Date.parse(String(row.finished_at)) - Date.parse(String(row.created_at))) / 1000;
      const report = computed.seconds > 0 || !(wall > 0) ? computed : { ...computed, seconds: Math.round(wall) };
      matches.push({
        mode: rowMode,
        botDifficulty: (row.bot_difficulty as string | null | undefined) ?? null,
        status: String(row.status),
        day: String(row.finished_at ?? row.updated_at ?? row.created_at).slice(0, 10),
        report,
        finishing: finishingBlow(state),
        humanSeats: report.seats.filter((seat) => seat.playerId !== BOT_PLAYER_ID).map((seat) => seat.seat),
        deckIds: [(row.player1_deck_id as string | null) ?? null, (row.player2_deck_id as string | null) ?? null],
      });
    } catch (error) {
      broken += 1;
      console.error(`[${row.id}] relevé impossible : ${(error as Error).message}`);
    }
  }

  const digest = digestMatches(matches);
  const deckNames = await readDeckNames(digest.decks.map((deck) => deck.id));
  const out: string[] = [];
  const window = days > 0 ? `${days} derniers jours` : "depuis toujours";
  const modeLabel = mode === "bot" ? "contre le bot" : mode === "pvp" ? "entre joueurs" : "tous modes";

  out.push(`# Statistiques des parties — ${window}, ${modeLabel}\n`);
  out.push(`_Généré le ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC._\n`);
  out.push(
    `**${digest.matches} parties analysées** sur ${rows.length} terminées` +
      (missing ? ` · ${missing} sans état enregistré` : "") +
      (broken ? ` · ${broken} illisibles` : "") +
      ".\n",
  );
  if (digest.matches === 0) {
    finish(out);
    return;
  }

  out.push("## Vue d'ensemble\n");
  out.push(
    table(
      ["Mode", "Parties", "Part"],
      Object.entries(digest.byMode)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => [MODE_LABELS[key] ?? key, String(count), pct(count, digest.matches)]),
    ),
  );
  out.push(
    `- Premier joueur vainqueur : **${pct(digest.firstPlayer.wins, digest.firstPlayer.decided)}** des parties décidées` +
      ` · abandons enregistrés (statut) : ${digest.byStatus.abandoned ?? 0}\n`,
  );

  out.push("## Durée et déroulé type\n");
  out.push(
    table(
      ["Mesure", "Min", "Médiane", "Moyenne", "Max"],
      [
        spreadRow("Durée de jeu", digest.seconds, clock),
        spreadRow("Tours de table", digest.tableTurns),
        spreadRow("Tours par joueur", digest.ownTurns),
        spreadRow("Cartes posées par joueur", digest.playsPerSeat),
        spreadRow("Ancrage restant au vainqueur", digest.winnerAnchor),
        spreadRow("Déraison du perdant à la fin", digest.loserReason),
      ],
    ),
  );
  const describe = (match: DigestMatch | null) =>
    match
      ? `${clock(match.report.seconds)}, ${match.report.tableTurns} tours de table, ${MODE_LABELS[match.mode] ?? match.mode}, le ${match.day}` +
        (match.finishing ? ` — ${FINISHING_LABELS[match.finishing.kind].toLowerCase()}` : "")
      : "—";
  out.push(`- Partie la plus courte : ${describe(digest.shortest)}`);
  out.push(`- Partie la plus longue : ${describe(digest.longest)}\n`);

  out.push("## Causes de victoire\n");
  out.push(
    table(
      ["Coup final", "Parties", "Part"],
      (Object.entries(digest.finishing) as Array<[FinishingKind, number]>)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => [FINISHING_LABELS[kind], String(count), pct(count, digest.matches)]),
    ),
  );
  const finishers = digest.cards.filter((line) => line.finishers > 0).sort((a, b) => b.finishers - a.finishers);
  out.push("### Cartes qui portent le plus souvent le coup final\n");
  out.push(table(["Carte", "Parties terminées"], finishers.slice(0, top).map((line) => [cardName(line.cardId), String(line.finishers)])));

  out.push("## Cartes les plus jouées (joueurs)\n");
  out.push(
    table(
      ["#", "Carte", "Poses", "Parties", "V% quand jouée", "Dégâts", "Destructions"],
      digest.cards
        .filter((line) => line.plays > 0)
        .slice(0, top)
        .map((line, index) => [
          String(index + 1),
          cardName(line.cardId),
          String(line.plays),
          String(line.matchesPlayed),
          pct(line.winsWhenPlayed, line.decidedWhenPlayed),
          String(line.damage),
          String(line.kills),
        ]),
    ),
  );

  const ranked = digest.cards.filter((line) => line.decidedWhenPlayed >= minMatches);
  const rate = (line: (typeof ranked)[number]) => line.winsWhenPlayed / line.decidedWhenPlayed;
  out.push(`### Meilleurs taux de victoire quand la carte est jouée (≥ ${minMatches} parties)\n`);
  out.push(
    table(
      ["Carte", "V%", "Parties"],
      [...ranked].sort((a, b) => rate(b) - rate(a)).slice(0, 10).map((line) => [cardName(line.cardId), pct(line.winsWhenPlayed, line.decidedWhenPlayed), String(line.decidedWhenPlayed)]),
    ),
  );
  out.push(`### Plus faibles taux de victoire (≥ ${minMatches} parties)\n`);
  out.push(
    table(
      ["Carte", "V%", "Parties"],
      [...ranked].sort((a, b) => rate(a) - rate(b)).slice(0, 10).map((line) => [cardName(line.cardId), pct(line.winsWhenPlayed, line.decidedWhenPlayed), String(line.decidedWhenPlayed)]),
    ),
  );
  out.push("### Plus gros dégâts cumulés\n");
  out.push(
    table(
      ["Carte", "Dégâts", "Destructions"],
      [...digest.cards].sort((a, b) => b.damage - a.damage).filter((line) => line.damage > 0).slice(0, 10).map((line) => [cardName(line.cardId), String(line.damage), String(line.kills)]),
    ),
  );

  out.push("## Navires (joueurs)\n");
  out.push(table(["Navire", "Parties", "V%"], digest.ships.map((ship) => [shipName(ship.id), String(ship.matches), pct(ship.wins, ship.decided)])));

  out.push("## Decks les plus joués (joueurs)\n");
  out.push(table(["Deck", "Parties", "V%"], digest.decks.slice(0, top).map((deck) => [deckNames.get(deck.id) ?? deck.id, String(deck.matches), pct(deck.wins, deck.decided)])));

  if (digest.vsBot.length > 0) {
    out.push("## Contre le bot\n");
    out.push(table(["Difficulté", "Parties", "Victoires des joueurs"], digest.vsBot.map((level) => [level.id, String(level.matches), pct(level.wins, level.decided)])));
  }

  out.push("## Raisons de fin (moteur)\n");
  out.push(table(["Raison", "Parties"], Object.entries(digest.endReasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => [reason, String(count)])));

  out.push("## Activité par jour\n");
  out.push(table(["Jour", "Parties"], Object.entries(digest.perDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 31).map(([day, count]) => [day, String(count)])));

  finish(out);
}

function finish(out: string[]) {
  const text = out.join("\n");
  if (process.env.STATS_OUTPUT) writeFileSync(process.env.STATS_OUTPUT, text);
  else console.log(text);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
