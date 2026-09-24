/**
 * LABO DES PRÉCONSTRUITS — tournoi toutes rondes, en parallèle, avec
 * relevé carte par carte et variantes d'ablation.
 *
 *   npx tsx scripts/preconLab/lab.ts --lib scripts/preconLab/libraries/v1.ts --games 40
 *   npx tsx scripts/preconLab/lab.ts --lib … --games 40 --bot difficile
 *   npx tsx scripts/preconLab/lab.ts --lib … --only "La Veillée" --ablate "La Veillée:le-naufrage-impossible"
 *
 * `--lib` désigne un module qui exporte `LIBRARY: DeckList[]` (défaut : le
 * rayon actuel). `--games` = parties par paire, moitié dans chaque sens.
 * `--only` restreint aux paires impliquant ces decks (affrontés à tout le
 * rayon). `--ablate "Deck:carte,carte"` ajoute une variante du deck SANS
 * ces cartes — l'équivalent de ne jamais les piocher — jouée contre le
 * reste du rayon. `--json fichier` écrit l'agrégat complet.
 *
 * `--field module` : les decks de `--lib` ne s'affrontent PAS entre eux,
 * chacun joue seulement contre ceux du champ. C'est le mode « variantes »
 * (une carte glissée dans un deck neutre, mesurée contre le rayon).
 *
 * Chaque paire est jouée dans les deux sens, graines identiques d'une
 * exécution à l'autre : deux mesures ne diffèrent que par les listes.
 */
import { fork } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DeckList } from "@/game/cards/decks/types";
import type { BotDifficulty } from "@/game/bot/types";
import { getCardDefinition } from "@/game/cards/sets/core";
import { playInstrumentedGame, type GameRecord, type SideRecord } from "@/scripts/preconLab/instrument";

interface Job {
  a: number;
  b: number;
  seed: number;
}

interface WorkerInput {
  decks: DeckList[];
  jobs: Job[];
  bot: BotDifficulty;
}

// --- Mode travailleur -----------------------------------------------------

if (process.argv[2] === "--worker") {
  const input = JSON.parse(readFileSync(process.argv[3]!, "utf8")) as WorkerInput;
  const out: GameRecord[] = [];
  for (const job of input.jobs) {
    out.push(playInstrumentedGame(input.decks[job.a]!, input.decks[job.b]!, job.seed, input.bot));
  }
  writeFileSync(process.argv[4]!, JSON.stringify(out));
  process.exit(0);
}

// --- Arguments ------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((v, i) => {
    if (v === name && process.argv[i + 1]) out.push(process.argv[i + 1]!);
  });
  return out;
}

async function loadLibrary(path: string | undefined): Promise<DeckList[]> {
  if (!path) {
    const mod = await import("@/game/cards/decks/precon");
    return [...mod.PRECON_DECK_LISTS];
  }
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { LIBRARY?: DeckList[]; default?: { LIBRARY?: DeckList[] } };
  const lib = mod.LIBRARY ?? mod.default?.LIBRARY;
  if (!lib) throw new Error(`${path} n'exporte pas LIBRARY`);
  return lib;
}

// --- Agrégation -----------------------------------------------------------

interface CardAgg {
  copies: number;
  seen: number;
  played: number;
  heldTurns: number;
  deadTurns: number;
  shipDamage: number;
  finalBlows: number;
  gamesSeen: number;
  winsSeen: number;
}

interface DeckAgg {
  name: string;
  games: number;
  wins: number;
  winsFirst: number;
  gamesFirst: number;
  turns: number;
  vs: Record<string, { games: number; wins: number }>;
  damage: Record<string, number>;
  selfDamage: number;
  deraison: number;
  healed: number;
  units: number;
  summoned: number;
  cardsPlayed: number;
  reasonLeft: number[];
  reasonDebt: number[];
  idleEarly: number;
  idle2plus: number;
  openingNo2: number;
  openingPoor3: number;
  finalBlowSource: Record<string, number>;
  cards: Record<string, CardAgg>;
}

function aggregate(records: GameRecord[], decks: DeckList[]): Map<string, DeckAgg> {
  const map = new Map<string, DeckAgg>();
  const get = (name: string) => {
    let agg = map.get(name);
    if (!agg) {
      const deck = decks.find((d) => d.name === name)!;
      const cards: Record<string, CardAgg> = {};
      for (const id of deck.cardIds) {
        cards[id] ??= { copies: 0, seen: 0, played: 0, heldTurns: 0, deadTurns: 0, shipDamage: 0, finalBlows: 0, gamesSeen: 0, winsSeen: 0 };
        cards[id]!.copies += 1;
      }
      agg = {
        name,
        games: 0,
        wins: 0,
        winsFirst: 0,
        gamesFirst: 0,
        turns: 0,
        vs: {},
        damage: { combat: 0, effet: 0, navire: 0, tour: 0 },
        selfDamage: 0,
        deraison: 0,
        healed: 0,
        units: 0,
        summoned: 0,
        cardsPlayed: 0,
        reasonLeft: [],
        reasonDebt: [],
        idleEarly: 0,
        idle2plus: 0,
        openingNo2: 0,
        openingPoor3: 0,
        finalBlowSource: {},
        cards,
      };
      map.set(name, agg);
    }
    return agg;
  };

  const add = (side: SideRecord, opp: SideRecord, turns: number) => {
    const agg = get(side.deck);
    agg.games += 1;
    if (side.won) agg.wins += 1;
    if (side.first) {
      agg.gamesFirst += 1;
      if (side.won) agg.winsFirst += 1;
    }
    agg.turns += turns / 2;
    const vs = (agg.vs[opp.deck] ??= { games: 0, wins: 0 });
    vs.games += 1;
    if (side.won) vs.wins += 1;
    for (const [k, v] of Object.entries(side.damageDealt)) agg.damage[k] = (agg.damage[k] ?? 0) + v;
    agg.selfDamage += side.selfDamage;
    agg.deraison += side.deraisonDamage;
    agg.healed += side.healed;
    agg.units += side.unitsPlayed;
    agg.summoned += side.summoned;
    agg.cardsPlayed += side.cardsPlayed;
    agg.reasonLeft.push(...side.reasonLeft);
    agg.reasonDebt.push(...side.reasonDebt);
    agg.idleEarly += side.idleEarlyTurns;
    if (side.idleEarlyTurns >= 2) agg.idle2plus += 1;
    if (side.openingLow2 === 0) agg.openingNo2 += 1;
    if (side.openingLow3 <= 1) agg.openingPoor3 += 1;
    if (side.won && side.finalBlowSource) agg.finalBlowSource[side.finalBlowSource] = (agg.finalBlowSource[side.finalBlowSource] ?? 0) + 1;
    for (const [id, l] of Object.entries(side.cards)) {
      const c = agg.cards[id];
      if (!c) continue;
      c.seen += l.seen;
      c.played += l.played;
      c.heldTurns += l.heldTurns;
      c.deadTurns += l.deadTurns;
      c.shipDamage += l.shipDamage;
      c.finalBlows += l.finalBlows;
    }
    for (const id of side.seenIds) {
      const c = agg.cards[id];
      if (!c) continue;
      c.gamesSeen += 1;
      if (side.won) c.winsSeen += 1;
    }
  };

  for (const r of records) {
    add(r.a, r.b, r.turns);
    add(r.b, r.a, r.turns);
  }
  return map;
}

// --- Rapport --------------------------------------------------------------

const pct = (x: number, n: number) => (n === 0 ? "—" : `${((x / n) * 100).toFixed(1)}%`);
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const f1 = (n: number) => n.toFixed(1);
const name = (id: string) => {
  try {
    return getCardDefinition(id).name;
  } catch {
    return id;
  }
};

function curve(deck: DeckList): string {
  const b = [0, 0, 0, 0, 0];
  for (const id of deck.cardIds) {
    const c = getCardDefinition(id).cost;
    b[c <= 2 ? 0 : c <= 4 ? 1 : c === 5 ? 2 : 3]! += 1;
  }
  return `1-2:${b[0]} 3-4:${b[1]} 5:${b[2]} 6+:${b[3]}`;
}

function types(deck: DeckList): string {
  const t: Record<string, number> = {};
  for (const id of deck.cardIds) {
    const ty = getCardDefinition(id).type;
    const k = ty === "marin" || ty === "creature" ? "unités" : ty;
    t[k] = (t[k] ?? 0) + 1;
  }
  return Object.entries(t)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
}

function report(aggs: Map<string, DeckAgg>, decks: DeckList[], detail: boolean): string {
  const out: string[] = [];
  const rows = [...aggs.values()].sort((x, y) => y.wins / y.games - x.wins / x.games);
  out.push("## Classement\n");
  out.push("| Deck | WR | 1er | durée | dégâts/partie (combat·effet·navire·tour) | soin | unités+invoc | Raison laissée | dette | inactif≥2 T1-4 | main sans ≤2 |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const a of rows) {
    const g = a.games;
    out.push(
      `| ${a.name} | **${pct(a.wins, g)}** | ${pct(a.winsFirst, a.gamesFirst)} | ${f1(a.turns / g)} | ${f1(a.damage.combat! / g)}·${f1(a.damage.effet! / g)}·${f1(a.damage.navire! / g)}·${f1(a.damage.tour! / g)} | ${f1(a.healed / g)} | ${f1(a.units / g)}+${f1(a.summoned / g)} | ${f1(avg(a.reasonLeft))} | ${f1(avg(a.reasonDebt))} | ${pct(a.idle2plus, g)} | ${pct(a.openingNo2, g)} |`
    );
  }

  // Matrice.
  const names = rows.map((r) => r.name);
  out.push("\n## Matrice (ligne contre colonne)\n");
  out.push(`| | ${names.map((n) => n.slice(0, 10)).join(" | ")} |`);
  out.push(`|---|${names.map(() => "---").join("|")}|`);
  for (const a of rows) {
    out.push(`| ${a.name.slice(0, 18)} | ${names.map((n) => (n === a.name ? "·" : a.vs[n] ? `${Math.round((a.vs[n]!.wins / a.vs[n]!.games) * 100)}` : "")).join(" | ")} |`);
  }

  if (!detail) return out.join("\n");

  for (const a of rows) {
    const deck = decks.find((d) => d.name === a.name)!;
    const g = a.games;
    out.push(`\n### ${a.name} — ${pct(a.wins, g)} (${deck.shipId}) · ${curve(deck)} · ${types(deck)}`);
    const vs = Object.entries(a.vs).sort((x, y) => y[1].wins / y[1].games - x[1].wins / x[1].games);
    out.push(`Meilleurs : ${vs.slice(0, 3).map(([n, v]) => `${n} ${pct(v.wins, v.games)}`).join(", ")} · Pires : ${vs.slice(-3).map(([n, v]) => `${n} ${pct(v.wins, v.games)}`).join(", ")}`);
    const fb = Object.entries(a.finalBlowSource).map(([k, v]) => `${k} ${pct(v, a.wins)}`).join(", ");
    out.push(`Coup final (victoires) : ${fb} · soi-même ${f1(a.selfDamage / g)} · Déraison subie ${f1(a.deraison / g)} · main pauvre (≤1 carte ≤3) ${pct(a.openingPoor3, g)}`);
    out.push("");
    out.push("| carte | cop. | vue/p | jouée/p | jouée/vue | morte | dégâts/p | coups fin. | WR vue | WR non vue | Δ |");
    out.push("|---|---|---|---|---|---|---|---|---|---|---|");
    const cards = Object.entries(a.cards).map(([id, c]) => {
      const wrSeen = c.gamesSeen ? c.winsSeen / c.gamesSeen : 0;
      const notSeen = g - c.gamesSeen;
      const wrNot = notSeen ? (a.wins - c.winsSeen) / notSeen : 0;
      return { id, c, wrSeen, wrNot, delta: notSeen && c.gamesSeen ? wrSeen - wrNot : 0 };
    });
    cards.sort((x, y) => y.delta - x.delta);
    for (const { id, c, wrSeen, wrNot, delta } of cards) {
      out.push(
        `| ${name(id)} (${getCardDefinition(id).cost}) | ${c.copies} | ${f1(c.seen / g)} | ${f1(c.played / g)} | ${pct(c.played, c.seen)} | ${pct(c.deadTurns, c.heldTurns)} | ${f1(c.shipDamage / g)} | ${c.finalBlows} | ${(wrSeen * 100).toFixed(0)} | ${(wrNot * 100).toFixed(0)} | ${(delta * 100).toFixed(0)} |`
      );
    }
  }
  return out.join("\n");
}

// --- Orchestration --------------------------------------------------------

async function main() {
  const games = Number(arg("--games") ?? 20);
  const bot = (arg("--bot") ?? "moyen") as BotDifficulty;
  const workers = Number(arg("--workers") ?? 15);
  const only = arg("--only")?.split(",").map((s) => s.trim());
  const base = await loadLibrary(arg("--lib"));
  const fieldPath = arg("--field");
  const field = fieldPath ? await loadLibrary(fieldPath) : [];
  const decks: DeckList[] = [...base, ...field];

  // Variantes d'ablation : le deck sans ces cartes.
  const variants: number[] = [];
  for (const spec of args("--ablate")) {
    const [deckName, list] = spec.split(":");
    const src = base.find((d) => d.name === deckName);
    if (!src) throw new Error(`Deck inconnu : ${deckName}`);
    const removed = new Set(list!.split(",").map((s) => s.trim()));
    decks.push({ ...src, id: `${src.id}-abl-${variants.length}`, name: `${src.name} [-${[...removed].join(",")}]`, cardIds: src.cardIds.filter((id) => !removed.has(id)) });
    variants.push(decks.length - 1);
  }

  const baseIdx = base.map((_, i) => i);
  const pairs: Array<[number, number]> = [];
  if (field.length) {
    for (const i of baseIdx) for (let f = 0; f < field.length; f += 1) pairs.push([i, base.length + f]);
  }
  for (const i of field.length ? [] : baseIdx) {
    for (const j of baseIdx) {
      if (j <= i) continue;
      if (only && !only.includes(decks[i]!.name) && !only.includes(decks[j]!.name)) continue;
      if (only && variants.length) continue; // en ablation, on ne rejoue que les variantes et leurs originaux
      pairs.push([i, j]);
    }
  }
  if (variants.length) {
    for (const v of variants) {
      const originalName = decks[v]!.name.replace(/ \[-.*\]$/, "");
      const originalIdx = base.findIndex((d) => d.name === originalName);
      for (const j of baseIdx) {
        if (j === originalIdx) continue;
        pairs.push([v, j]);
        pairs.push([originalIdx, j]);
      }
    }
  }
  const uniquePairs = [...new Map(pairs.map((p) => [`${p[0]}-${p[1]}`, p])).values()];

  const jobs: Job[] = [];
  for (const [i, j] of uniquePairs) {
    for (let s = 0; s < games; s += 1) {
      // Même graine pour toutes les paires : deux mesures ne diffèrent que
      // par les listes. Un sens sur deux, pour neutraliser le premier joueur.
      const seed = 7000 + s * 131;
      jobs.push(s % 2 === 0 ? { a: i, b: j, seed } : { a: j, b: i, seed });
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "preconlab-"));
  const chunks: Job[][] = Array.from({ length: workers }, () => []);
  jobs.forEach((job, k) => chunks[k % workers]!.push(job));
  // Un orchestrateur interrompu ne laisse pas ses travailleurs tourner.
  const children: Array<ReturnType<typeof fork>> = [];
  for (const sig of ["SIGINT", "SIGTERM", "exit"] as const) process.on(sig, () => children.forEach((c) => c.kill()));
  const started = Date.now();
  const results = await Promise.all(
    chunks
      .filter((c) => c.length > 0)
      .map(
        (chunk, k) =>
          new Promise<GameRecord[]>((ok, ko) => {
            const input = join(dir, `in-${k}.json`);
            const output = join(dir, `out-${k}.json`);
            writeFileSync(input, JSON.stringify({ decks, jobs: chunk, bot } satisfies WorkerInput));
            const child = fork(__filename, ["--worker", input, output], { execArgv: ["--import", "tsx"], stdio: "inherit" });
            children.push(child);
            child.on("exit", (code) => (code === 0 ? ok(JSON.parse(readFileSync(output, "utf8"))) : ko(new Error(`travailleur ${k} : code ${code}`))));
          })
      )
  );
  const records = results.flat();
  const aggs = aggregate(records, decks);
  if (field.length) for (const f of field) aggs.delete(f.name);
  console.log(`\n# Labo — ${records.length} parties, bot ${bot}, ${games} par paire, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  console.log(report(aggs, decks, !process.argv.includes("--brief")));
  const json = arg("--json");
  if (json) writeFileSync(json, JSON.stringify({ bot, games, decks, aggs: Object.fromEntries(aggs) }, null, 1));
}

void main();
