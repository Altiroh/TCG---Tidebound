/**
 * PORTE A — la main de départ. Tirages aléatoires (sans partie) : quelle
 * part des mains ne permet pas de jouer tôt ?
 *
 *  - « sans unité ≤ 2 » : aucune unité de coût 2 ou moins dans les 5
 *    premières cartes (le premier tour se passe sans corps) ;
 *  - « morte T1-T3 » : dans les 7 premières cartes vues (main + 2 pioches),
 *    au plus une carte de coût ≤ 3 — deux tours à ne presque rien faire ;
 *  - « sans unité T1-T3 » : aucune unité de coût ≤ 3 dans ces 7 cartes.
 *
 *   npx tsx scripts/preconLab/openingHands.ts scripts/preconLab/libraries/v9.ts
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { DeckList } from "@/game/cards/decks/types";

const DRAWS = 20000;

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function main() {
  const mod = (await import(pathToFileURL(resolve(process.argv[2]!)).href)) as { LIBRARY: DeckList[] };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  console.log("| Deck | sans unité ≤2 (5 cartes) | morte T1-T3 (≤1 carte ≤3 sur 7) | sans unité ≤3 sur 7 |");
  console.log("|---|---|---|---|");
  for (const deck of mod.LIBRARY) {
    let noCheapUnit = 0;
    let dead = 0;
    let noUnit = 0;
    const isUnit = (id: string) => ["marin", "creature"].includes(getCardDefinition(id).type);
    for (let n = 0; n < DRAWS; n += 1) {
      const s = shuffle(deck.cardIds, rnd);
      const five = s.slice(0, 5);
      const seven = s.slice(0, 7);
      if (!five.some((id) => isUnit(id) && getCardDefinition(id).cost <= 2)) noCheapUnit += 1;
      if (seven.filter((id) => getCardDefinition(id).cost <= 3).length <= 1) dead += 1;
      if (!seven.some((id) => isUnit(id) && getCardDefinition(id).cost <= 3)) noUnit += 1;
    }
    const p = (x: number) => `${((x / DRAWS) * 100).toFixed(1)} %`;
    console.log(`| ${deck.name} | ${p(noCheapUnit)} | ${p(dead)} | ${p(noUnit)} |`);
  }
}

void main();
