/**
 * BANC D'ESSAI D'ÉQUILIBRAGE — fait jouer toutes les listes les unes contre
 * les autres et rend le tableau des taux de victoire.
 *
 * Pourquoi un script et pas un test : c'est une MESURE, pas une assertion.
 * Un seuil de victoire figé dans la suite se transformerait vite en
 * contrainte à contourner ; ici, on lit un chiffre et on décide.
 *
 * Ce que le tableau dit, et ce qu'il ne dit pas :
 *   - il mesure la puissance d'une liste TELLE QUE LE BOT LA JOUE. Une liste
 *     dont le plan dépasse l'évaluation du bot y paraîtra plus faible qu'elle
 *     n'est. `evaluateState` ne compte ni l'état de la Marée, ni les cartes
 *     du Cimetière, ni les boucles de valeur : un deck de contrôle
 *     environnemental ou de recyclage part avec un handicap qui est celui du
 *     bot, pas celui de la liste ;
 *   - le hasard des bots est FIXÉ par une graine, donc deux exécutions sur le
 *     même catalogue donnent exactement le même tableau. Ce qui bouge d'une
 *     fois à l'autre, ce sont les cartes, pas le dé.
 *
 * Usage : npm run balance  (ajouter un nombre pour changer le nombre de
 * graines par affrontement : `npm run balance -- 10`).
 */
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import { CORE_SET } from "@/game/cards/sets/core";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { dispatch } from "@/game/engine";
import { createGameState } from "@/game/state/createGameState";
import type { GameState } from "@/game/state/types";

const SEEDS = Number(process.argv[2] ?? 6);
const RANDOM_SEED = 20260918;

/** Remplace `Math.random` par une suite déterministe le temps de la mesure. */
function withSeededRandom<T>(seed: number, run: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function playMatch(deckA: number, deckB: number, seed: number): { winner: string | null; turns: number } {
  let state: GameState = createGameState({
    gameId: `balance-${deckA}-${deckB}-${seed}`,
    player1: { id: "A", deck: PLAYABLE_DECKS[deckA]! },
    player2: { id: "B", deck: PLAYABLE_DECKS[deckB]! },
    seed,
  });
  for (let guard = 0; guard < 4000 && state.status === "active"; guard += 1) {
    const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
    if (!actor) break;
    const result = dispatch(state, chooseBotAction(state, actor, "moyen"));
    if (!result.ok || result.state === state) break;
    state = result.state;
  }
  return { winner: state.winnerId ?? null, turns: state.turnNumber };
}

function main() {
  const n = PLAYABLE_DECKS.length;
  const wins = new Array<number>(n).fill(0);
  const played = new Array<number>(n).fill(0);
  const turns: number[] = [];

  withSeededRandom(RANDOM_SEED, () => {
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          // Les deux côtés, pour que l'avantage du premier joueur ne décide pas.
          for (const [x, y] of [[a, b], [b, a]] as const) {
            const { winner, turns: t } = playMatch(x, y, seed);
            turns.push(t);
            played[x] = (played[x] ?? 0) + 1;
            played[y] = (played[y] ?? 0) + 1;
            if (winner === "A") wins[x] = (wins[x] ?? 0) + 1;
            else if (winner === "B") wins[y] = (wins[y] ?? 0) + 1;
          }
        }
      }
    }
  });

  const rows = PLAYABLE_DECKS.map((deck, i) => {
    const w = wins[i] ?? 0;
    const p = played[i] ?? 0;
    return { deck, rate: p > 0 ? w / p : 0, wins: w, played: p };
  }).sort((l, r) => r.rate - l.rate);

  console.log(`\nBANC D'ESSAI — ${turns.length} parties, bots « moyen », graine ${RANDOM_SEED}\n`);
  for (const r of rows) {
    const bar = "█".repeat(Math.round(r.rate * 30));
    console.log(
      `  ${r.deck.id.padEnd(24)} ${r.deck.shipId.padEnd(15)} ${(r.rate * 100).toFixed(1).padStart(5)}%  ${bar}`
    );
  }

  const byShip = new Map<string, { w: number; p: number }>();
  PLAYABLE_DECKS.forEach((deck, i) => {
    const acc = byShip.get(deck.shipId) ?? { w: 0, p: 0 };
    byShip.set(deck.shipId, { w: acc.w + (wins[i] ?? 0), p: acc.p + (played[i] ?? 0) });
  });
  console.log("\n  Par Navire :");
  for (const [ship, { w, p }] of [...byShip].sort((l, r) => r[1].w / r[1].p - l[1].w / l[1].p)) {
    console.log(`    ${ship.padEnd(15)} ${((w / p) * 100).toFixed(1).padStart(5)}%`);
  }

  const sorted = [...turns].sort((a, b) => a - b);
  console.log(
    `\n  Longueur de partie : médiane ${sorted[Math.floor(sorted.length / 2)]} tours, max ${sorted.at(-1)}`
  );

  // Couverture : une carte que personne ne joue n'est pas équilibrée, elle
  // est seulement écrite.
  const used = new Set(PLAYABLE_DECKS.flatMap((d) => d.cardIds));
  const never = CORE_SET.filter((c) => !used.has(c.id));
  console.log(`\n  Couverture : ${CORE_SET.length - never.length}/${CORE_SET.length} cartes jouées par au moins une liste`);
  if (never.length > 0) {
    console.log(`  Jamais jouées (${never.length}) : ${never.map((c) => c.id).join(", ")}`);
  }
  console.log();
}

main();
