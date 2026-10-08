/**
 * RELEVÉ DE L'AUDIENCE — ce que le public pense vraiment des parties.
 *
 * Joue des parties bot contre bot sur les listes préconstruites, passe
 * chaque état final par le VRAI verdict (`analyzeMatch`) pour les DEUX
 * joueurs, et relève :
 *
 *   - la répartition du spectacle (gagnants, perdants), pour vérifier qu'il
 *     DISCRIMINE — une partie terne et une partie folle ne doivent pas
 *     finir au même score ;
 *   - la fréquence et le poids moyen de chaque signal et de chaque moment,
 *     pour repérer un signal qui tombe à chaque partie (il ne dit rien) ou
 *     jamais (il est hors de portée) ;
 *   - l'audience qu'atteint un joueur qui enchaîne ces parties, pour situer
 *     les seuils des mécènes et les paliers.
 *
 * Un bot n'est pas un joueur : il ne timeoute jamais et joue sans panache
 * particulier. Les chiffres disent ce qu'obtient « une partie normale ».
 *
 *   npm run audience -- [parties par deck]
 */
import { createGameState } from "@/game/state/createGameState";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { dispatch } from "@/game/engine";
import { createSeededRandom } from "@/game/rng";
import type { GameState } from "@/game/state/types";
import { AUDIENCE_MILESTONES, analyzeMatch, nextAudience, readMoments } from "@/game/audience";
import { SPONSORS } from "@/game/progression";
import { DECKS } from "@/scripts/decks";

const N = Number(process.argv[2] ?? 3);
const names = Object.keys(DECKS);

const spectacles: { won: boolean; value: number }[] = [];
const signals = new Map<string, { count: number; total: number }>();
const moments = new Map<string, { games: number; count: number; total: number }>();
let games = 0;

for (const [i, deckName] of names.entries()) {
  for (let s = 0; s < N; s++) {
    const opp = names[(i + 1 + s * 3) % names.length]!;
    const seed = 9100 + i * 100 + s;
    const rnd = createSeededRandom(seed ^ 0x5eed);
    let state: GameState = createGameState({ gameId: `public-${seed}`, player1: { id: "a", deck: DECKS[deckName]! }, player2: { id: "b", deck: DECKS[opp]! }, seed });
    let coups = 0;
    while (state.status === "active" && coups < 900) {
      const acteur = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
      if (!acteur) break;
      const r = dispatch(state, chooseBotAction(state, acteur, "moyen", rnd));
      if (!r.ok) break;
      state = r.state;
      coups++;
    }
    if (state.status === "active") continue;
    games++;
    for (const playerId of ["a", "b"]) {
      const analysis = analyzeMatch(state, playerId);
      spectacles.push({ won: state.winnerId === playerId, value: analysis.spectacle });
      for (const signal of analysis.signals) {
        const entry = signals.get(signal.id) ?? { count: 0, total: 0 };
        entry.count++;
        entry.total += signal.weight;
        signals.set(signal.id, entry);
      }
      const seen = new Set<string>();
      for (const moment of readMoments(state, playerId)) {
        const entry = moments.get(moment.id) ?? { games: 0, count: 0, total: 0 };
        entry.count++;
        entry.total += moment.weight;
        if (!seen.has(moment.id)) entry.games++;
        seen.add(moment.id);
        moments.set(moment.id, entry);
      }
    }
  }
}

const values = spectacles.map((entry) => entry.value).sort((a, b) => a - b);
const quantile = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))] ?? 0;
const mean = (list: number[]) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0);
const round = (value: number) => Math.round(value * 10) / 10;
const judged = spectacles.length;

console.log(`\n${games} parties terminées, ${judged} verdicts (les deux joueurs).\n`);
console.log("SPECTACLE");
console.log(`  moyenne ${round(mean(values))} · gagnants ${round(mean(spectacles.filter((e) => e.won).map((e) => e.value)))} · perdants ${round(mean(spectacles.filter((e) => !e.won).map((e) => e.value)))}`);
console.log(`  quantiles  p10 ${quantile(0.1)} · p25 ${quantile(0.25)} · médiane ${quantile(0.5)} · p75 ${quantile(0.75)} · p90 ${quantile(0.9)}`);
const bands = [
  ["s'ennuie (<20)", 0, 20],
  ["s'impatiente (20-39)", 20, 40],
  ["suit (40-59)", 40, 60],
  ["captivé (60-79)", 60, 80],
  ["debout (≥80)", 80, 101],
] as const;
for (const [label, min, max] of bands) {
  const share = values.filter((value) => value >= min && value < max).length / Math.max(1, judged);
  console.log(`  ${label.padEnd(22)} ${String(Math.round(share * 100)).padStart(3)} %  ${"█".repeat(Math.round(share * 40))}`);
}

console.log("\nSIGNAUX (part des verdicts · poids moyen)");
for (const [id, entry] of [...signals].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${id.padEnd(22)} ${String(Math.round((entry.count / judged) * 100)).padStart(3)} %  ${round(entry.total / entry.count)}`);
}

console.log("\nMOMENTS (part des verdicts où il survient · par partie · poids moyen)");
for (const [id, entry] of [...moments].sort((a, b) => b[1].games - a[1].games)) {
  console.log(
    `  ${id.padEnd(22)} ${String(Math.round((entry.games / judged) * 100)).padStart(3)} %  ${String(round(entry.count / judged)).padStart(5)}  ${round(entry.total / entry.count)}`
  );
}

// Un joueur qui enchaîne ces parties, dans l'ordre, en duel puis contre le bot.
console.log("\nAUDIENCE D'UN JOUEUR QUI ENCHAÎNE CES PARTIES");
for (const opponent of ["joueur", "difficile", "moyen", "facile"] as const) {
  let audience = 0;
  let best = 0;
  const reachedAt = new Map<number, number>();
  /** Variations par partie, une fois l'audience installée (après les 15 premières). */
  const swings: number[] = [];
  spectacles.forEach((entry, index) => {
    const before = audience;
    audience = nextAudience(audience, entry.value, { opponent, won: entry.won });
    if (index >= 15) swings.push(audience - before);
    best = Math.max(best, audience);
    for (const milestone of AUDIENCE_MILESTONES) if (best >= milestone.threshold && !reachedAt.has(milestone.threshold)) reachedAt.set(milestone.threshold, index + 1);
    for (const sponsor of SPONSORS) if (best >= sponsor.audienceRequired && !reachedAt.has(-sponsor.audienceRequired)) reachedAt.set(-sponsor.audienceRequired, index + 1);
  });
  console.log(`  ${opponent === "joueur" ? "en duel" : `bot ${opponent}`} : audience finale ${audience}, record ${best}`);
  const worst = Math.min(0, ...swings);
  console.log(`    variation par partie (installée) : moyenne ±${round(mean(swings.map(Math.abs)))} · pire chute ${worst}`);
  const milestones = AUDIENCE_MILESTONES.map((m) => `${m.threshold} → ${reachedAt.get(m.threshold) ?? "jamais"}`).join(" · ");
  const sponsors = SPONSORS.map((s) => `${s.name} (${s.audienceRequired}) → ${reachedAt.get(-s.audienceRequired) ?? "jamais"}`).join(" · ");
  console.log(`    paliers (partie où atteint) : ${milestones}`);
  console.log(`    mécènes (partie où le seuil est atteint) : ${sponsors}`);
}
