/**
 * RECOUVREMENT entre les decks d'une bibliothèque : exemplaires communs
 * (min des copies de chaque carte partagée), en % de 40, et nombre de
 * cartes distinctes partagées. Courbe, types et Navire au passage.
 *
 *   npx tsx scripts/preconLab/overlap.ts scripts/preconLab/libraries/v3.ts
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { DeckList } from "@/game/cards/decks/types";

function counts(deck: DeckList): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of deck.cardIds) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

async function main() {
  const mod = (await import(pathToFileURL(resolve(process.argv[2]!)).href)) as { LIBRARY: DeckList[] };
  const decks = mod.LIBRARY.filter((d) => d.id !== "neutre");
  const short = (n: string) => n.slice(0, 12);

  console.log("## Recouvrement (exemplaires communs / 40 · cartes communes)\n");
  console.log(`| | ${decks.map((d) => short(d.name)).join(" | ")} |`);
  console.log(`|---|${decks.map(() => "---").join("|")}|`);
  let worst = { pct: 0, pair: "" };
  for (const a of decks) {
    const ca = counts(a);
    const cells = decks.map((b) => {
      if (a === b) return "·";
      const cb = counts(b);
      let shared = 0;
      let distinct = 0;
      for (const [id, n] of ca) {
        const m = cb.get(id);
        if (!m) continue;
        shared += Math.min(n, m);
        distinct += 1;
      }
      const pct = Math.round((shared / Math.min(a.cardIds.length, b.cardIds.length)) * 100);
      if (pct > worst.pct) worst = { pct, pair: `${a.name} / ${b.name}` };
      return `${pct}% · ${distinct}`;
    });
    console.log(`| ${short(a.name)} | ${cells.join(" | ")} |`);
  }
  console.log(`\nPire paire : ${worst.pair} (${worst.pct} %)\n`);

  console.log("## Profil\n");
  console.log("| Deck | Navire | 1-2 | 3-4 | 5 | 6+ | unités | Objets | Structures | Anomalies | Équip. | coût moyen |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const d of decks) {
    const b = [0, 0, 0, 0];
    const t: Record<string, number> = {};
    let sum = 0;
    for (const id of d.cardIds) {
      const def = getCardDefinition(id);
      sum += def.cost;
      b[def.cost <= 2 ? 0 : def.cost <= 4 ? 1 : def.cost === 5 ? 2 : 3]! += 1;
      const k = def.type === "marin" || def.type === "creature" ? "unite" : def.type;
      t[k] = (t[k] ?? 0) + 1;
    }
    console.log(`| ${d.name} | ${d.shipId} | ${b.join(" | ")} | ${t.unite ?? 0} | ${t.objet ?? 0} | ${t.structure ?? 0} | ${t.anomalie ?? 0} | ${t.equipement ?? 0} | ${(sum / d.cardIds.length).toFixed(2)} |`);
  }

  // Cartes présentes dans 3 decks ou plus : les « staples » qui se diffusent.
  const spread = new Map<string, string[]>();
  for (const d of decks) for (const id of new Set(d.cardIds)) spread.set(id, [...(spread.get(id) ?? []), d.name]);
  const staples = [...spread.entries()].filter(([, ds]) => ds.length >= 3).sort((x, y) => y[1].length - x[1].length);
  console.log("\n## Cartes dans 3 decks ou plus\n");
  for (const [id, ds] of staples) console.log(`- ${getCardDefinition(id).name} (${ds.length}) : ${ds.join(", ")}`);
}

void main();
