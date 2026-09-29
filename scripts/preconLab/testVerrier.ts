/**
 * TEST VERRIER — relevé chiffré de la QUALITÉ DU MOTEUR, pas seulement du
 * taux de victoire (29/09/2026).
 *
 * Lit l'agrégat JSON d'un tournoi du labo (`lab.ts --json`) et rend, par
 * deck, ce que le Test Verrier demande de mesurer :
 *
 *   - Densité fonctionnelle : part des exemplaires qui sont JOUÉS quand ils
 *     sont vus (≥ 70 %) et qui ne font pas perdre (Δ ≥ −3) ;
 *   - Cartes mortes : exemplaires joués moins de 40 % des fois où ils sont
 *     en main ;
 *   - Poids morts : exemplaires dont Δ ≤ −8 (la partie va plus mal quand
 *     on les pioche) ;
 *   - Démarrage : mains sans carte à 2 ou moins, tours inactifs T1-4 ;
 *   - Conversion : dégâts infligés par partie, coups fatals par source ;
 *   - Raison : Raison laissée en fin de tour, dette moyenne.
 *
 * Δ est une corrélation (une carte chère est vue dans des parties longues),
 * jamais une preuve : c'est la COMBINAISON des colonnes qui dit où casse
 * un moteur.
 *
 *   npx tsx scripts/preconLab/testVerrier.ts tournoi.json
 */
import { readFileSync } from "node:fs";
import { getCardDefinition } from "@/game/cards/sets/core";

interface CardAgg { copies: number; seen: number; played: number; gamesSeen: number; winsSeen: number }
interface DeckAgg {
  name: string; games: number; wins: number; turns: number;
  damage: Record<string, number>; units: number; summoned: number;
  reasonLeft: number[]; reasonDebt: number[]; idle2plus: number; openingNo2: number;
  finalBlowSource: Record<string, number>; cards: Record<string, CardAgg>;
}

const file = process.argv[2];
if (!file) throw new Error("usage : testVerrier.ts tournoi.json");
const json = JSON.parse(readFileSync(file, "utf8")) as { aggs: Record<string, DeckAgg> | DeckAgg[] };
const decks = (Array.isArray(json.aggs) ? json.aggs : Object.values(json.aggs)).sort((a, b) => b.wins / b.games - a.wins / a.games);

const pct = (x: number) => `${Math.round(x * 100)} %`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const nom = (id: string) => { try { return getCardDefinition(id).name; } catch { return id; } };

console.log("| Deck | WR | Densité fonctionnelle | Cartes mortes (<40 % jouées) | Poids morts (Δ ≤ −8) | Mains sans ≤2 | Dégâts/partie | Unités posées | Raison laissée |");
console.log("|---|---|---|---|---|---|---|---|---|");
const details: string[] = [];
for (const d of decks) {
  let total = 0, fonctionnel = 0, mortes = 0, poids = 0;
  const listeMortes: string[] = [], listePoids: string[] = [];
  for (const [id, c] of Object.entries(d.cards)) {
    total += c.copies;
    const jouee = c.seen ? c.played / c.seen : 0;
    const nonVue = d.games - c.gamesSeen;
    const delta = c.gamesSeen && nonVue ? c.winsSeen / c.gamesSeen - (d.wins - c.winsSeen) / nonVue : 0;
    if (jouee >= 0.7 && delta >= -0.03) fonctionnel += c.copies;
    if (jouee < 0.4) { mortes += c.copies; listeMortes.push(`${nom(id)} ×${c.copies} (${pct(jouee)})`); }
    if (delta <= -0.08) { poids += c.copies; listePoids.push(`${nom(id)} ×${c.copies} (Δ ${Math.round(delta * 100)})`); }
  }
  const dmg = Object.values(d.damage).reduce((a, b) => a + b, 0) / d.games;
  console.log(`| ${d.name} | ${pct(d.wins / d.games)} | ${fonctionnel}/${total} (${pct(fonctionnel / total)}) | ${mortes} | ${poids} | ${pct(d.openingNo2 / d.games)} | ${dmg.toFixed(1)} | ${((d.units + d.summoned) / d.games).toFixed(1)} | ${avg(d.reasonLeft).toFixed(1)} |`);
  details.push(`- **${d.name}** — mortes : ${listeMortes.join(", ") || "aucune"} · poids morts : ${listePoids.join(", ") || "aucun"}`);
}
console.log("\n" + details.join("\n"));
