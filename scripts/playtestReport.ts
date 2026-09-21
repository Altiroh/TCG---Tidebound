/**
 * Banc d'essai des decks v4 — passe de stabilisation (21/09/2026).
 *
 * Deux relevés :
 *   1. les cinq affrontements nommés par le cadrage (swarm vs défense,
 *      Abysses vs Raison stable, Structures vs aggro, Marionnettes vs
 *      contrôle, Un Dead vs midrange) ;
 *   2. un tournoi toutes rondes entre les dix listes compétitives.
 *
 * Chaque paire est jouée dans LES DEUX SENS, moitié-moitié : le premier
 * joueur a un avantage structurel (il pose avant), et le masquer fausserait
 * tout classement.
 *
 * AVERTISSEMENT — c'est un bot, pas un joueur. Son évaluation a été réglée
 * sur l'ANCIENNE économie de Raison : il surdépense et s'endette là où un
 * humain temporiserait. Ces chiffres disent le RYTHME et les écarts
 * GROSSIERS entre decks, pas la qualité d'un archétype.
 *
 *   npx tsx scripts/playtestReport.ts [partiesParPaire]
 */
import { createGameState } from "@/game/state/createGameState";
import {
  DECK_BEC_DANS_LA_BRUME, DECK_CAP_DE_FER, DECK_LE_BANC_DEBORDE,
  DECK_GRACE_SOUS_PRESSION, DECK_A_PORTEE,
} from "@/game/cards/decks/borrowed";
import {
  DECK_DERNIER_RAPPEL, DECK_SOUS_LA_LIGNE, DECK_TOUT_RECUPERER,
  DECK_LES_PETITS_ATTENDENT, DECK_GRENOUILLES_AU_CANON, DECK_LA_LIGNE_TENUE,
} from "@/game/cards/decks/precon";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { getCardDefinition } from "@/game/cards/sets/core";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";
import type { DeckList } from "@/game/cards/decks/types";


const N = Number(process.argv[2] ?? 20);

const DECKS: Record<string, DeckList> = {
  "La Ligne Tenue": DECK_LA_LIGNE_TENUE,
  "Bec dans la Brume": DECK_BEC_DANS_LA_BRUME,
  "Cap de Fer": DECK_CAP_DE_FER,
  "Le Banc Déborde": DECK_LE_BANC_DEBORDE,
  "Grâce sous pression": DECK_GRACE_SOUS_PRESSION,
  "À Portée": DECK_A_PORTEE,
  "Dernier Rappel": DECK_DERNIER_RAPPEL,
  "Sous la Ligne": DECK_SOUS_LA_LIGNE,
  "Tout Récupérer": DECK_TOUT_RECUPERER,
  "Les Petits Attendent": DECK_LES_PETITS_ATTENDENT,
  "Grenouilles au Canon": DECK_GRENOUILLES_AU_CANON,
};

interface Mesures {
  posesParTour: number[];
  slotsFinDeTour: number[];
  premierCout: Record<5 | 6 | 7, number[]>;
  deraison: number;
  ancrageDeraison: number;
  tours: number;
  vainqueur: "a" | "b" | "nul";
}

function partie(deckA: DeckList, deckB: DeckList, seed: number): Mesures {
  let state: GameState = createGameState({
    gameId: `pt-${seed}`,
    player1: { id: "a", deck: deckA },
    player2: { id: "b", deck: deckB },
    seed,
  });

  const m: Mesures = {
    posesParTour: [], slotsFinDeTour: [],
    premierCout: { 5: [], 6: [], 7: [] },
    deraison: 0, ancrageDeraison: 0, tours: 0, vainqueur: "nul",
  };
  const vus = new Set<number>();

  let coups = 0;
  while (state.status === "active" && coups < 900) {
    const acteur = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
    if (!acteur) break;
    const avant = state;
    const res = dispatch(state, chooseBotAction(state, acteur, "moyen"));
    if (!res.ok) break;

    const tour = avant.turnNumber;
    for (const e of res.events) {
      if (!e) continue;
      if (e.type === "PLAY_CARD") {
        const jouee = avant.players.flatMap((pl) => pl.hand).find((c) => c.instanceId === e.instanceId);
        const cout = jouee ? getCardDefinition(jouee.cardId).cost : undefined;
        m.posesParTour[tour] = (m.posesParTour[tour] ?? 0) + 1;
        if (cout !== undefined && cout >= 5 && cout <= 7 && !vus.has(cout)) {
          vus.add(cout);
          m.premierCout[cout as 5 | 6 | 7].push(tour);
        }
      }
      if (e.type === "DERAISON_SETTLED") { m.deraison += e.debt; m.ancrageDeraison += e.anchorDamage; }
    }
    if (res.state.turnNumber !== avant.turnNumber) {
      m.slotsFinDeTour[tour] = Math.max(...res.state.players.map((pl) => pl.board.length));
    }
    state = res.state;
    coups += 1;
  }

  m.tours = state.turnNumber;
  const a = state.players.find((p) => p.id === "a")!;
  const b = state.players.find((p) => p.id === "b")!;
  m.vainqueur = a.anchor <= 0 && b.anchor <= 0 ? "nul" : a.anchor <= 0 ? "b" : b.anchor <= 0 ? "a" : "nul";
  return m;
}

const moy = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((x, y) => x + y, 0) / xs.length);
const f2 = (n: number) => n.toFixed(2);

/** Joue `n` parties, moitié dans un sens moitié dans l'autre. */
function duel(nomA: string, nomB: string, n: number) {
  const res: Mesures[] = [];
  let victoiresA = 0, victoiresB = 0, nuls = 0;
  for (let i = 0; i < n; i++) {
    const inverse = i % 2 === 1;
    const m = inverse ? partie(DECKS[nomB]!, DECKS[nomA]!, 1000 + i) : partie(DECKS[nomA]!, DECKS[nomB]!, 1000 + i);
    const gagnantEstA = inverse ? m.vainqueur === "b" : m.vainqueur === "a";
    const gagnantEstB = inverse ? m.vainqueur === "a" : m.vainqueur === "b";
    if (gagnantEstA) victoiresA += 1; else if (gagnantEstB) victoiresB += 1; else nuls += 1;
    res.push(m);
  }
  return { res, victoiresA, victoiresB, nuls };
}

const AFFRONTEMENTS: [string, string, string][] = [
  // Les cinq affrontements demandés pour la première vague de pièges.
  ["swarm Cra-Poiscail vs Structures défensives", "Grenouilles au Canon", "La Ligne Tenue"],
  ["Courlis aggro vs Structures", "Bec dans la Brume", "La Ligne Tenue"],
  ["Goliath artillerie vs Structures", "À Portée", "La Ligne Tenue"],
  ["Abysses vs Structures de contrôle de Marée", "Sous la Ligne", "La Ligne Tenue"],
  ["Structures/Sabordage miroir", "Tout Récupérer", "La Ligne Tenue"],
];

// Mode duel ciblé : `npx tsx scripts/playtestReport.ts 60 --duel "Deck A" "Deck B"`
// Sert à confirmer un signal sur un grand échantillon sans payer le tournoi.
if (process.argv.includes("--duel")) {
  const i = process.argv.indexOf("--duel");
  const [nomA, nomB] = [process.argv[i + 1]!, process.argv[i + 2]!];
  const { res, victoiresA, victoiresB, nuls } = duel(nomA, nomB, N);
  console.log(`\n${nomA}  ${victoiresA} — ${victoiresB}  ${nomB}${nuls ? ` (${nuls} nuls)` : ""}  sur ${N} parties → ${((victoiresA / N) * 100).toFixed(1)}%`);
  console.log(`Slots occupés T2/T3/T4 : ${[2, 3, 4].map((t) => f2(moy(res.map((m) => m.slotsFinDeTour[t] ?? 0)))).join(" / ")}`);
  console.log(`Déraison : ${f2(moy(res.map((m) => m.deraison)))} pts · durée ${f2(moy(res.map((m) => m.tours)))} tours\n`);
  process.exit(0);
}

console.log(`\n╔══ BANC D'ESSAI — ${N} parties par affrontement, bot moyen, les deux sens ══╗\n`);
console.log("## Les cinq affrontements du cadrage\n");
const global: Mesures[] = [];
for (const [label, a, b] of AFFRONTEMENTS) {
  const { res, victoiresA, victoiresB, nuls } = duel(a, b, N);
  global.push(...res);
  const pct = ((victoiresA / N) * 100).toFixed(0);
  console.log(`### ${label}`);
  console.log(`    ${a}  ${victoiresA} — ${victoiresB}  ${b}${nuls ? ` (${nuls} sans vainqueur)` : ""}   → ${pct}% pour ${a}`);
  console.log(`    durée moyenne : ${f2(moy(res.map((m) => m.tours)))} tours · Déraison : ${f2(moy(res.map((m) => m.deraison)))} pts / ${f2(moy(res.map((m) => m.ancrageDeraison)))} Ancrage\n`);
}

console.log("## Rythme, toutes parties confondues\n");
console.log("    Cartes posées   T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moy(global.map((m) => m.posesParTour[t] ?? 0)))).join(" / "));
console.log("    Slots occupés   T1 / T2 / T3 / T4 : " + [1, 2, 3, 4].map((t) => f2(moy(global.map((m) => m.slotsFinDeTour[t] ?? 0)))).join(" / "));
for (const c of [5, 6, 7] as const) {
  const tous = global.flatMap((m) => m.premierCout[c]);
  console.log(`    Premier coût ${c} joué : ${tous.length === 0 ? "JAMAIS" : `T${f2(moy(tous))} (dans ${tous.length}/${global.length} parties)`}`);
}
console.log(`    Déraison par partie : ${f2(moy(global.map((m) => m.deraison)))} pts, soit ${f2(moy(global.map((m) => m.ancrageDeraison)))} Ancrage`);
console.log(`    Durée moyenne : ${f2(moy(global.map((m) => m.tours)))} tours\n`);

console.log("## Tournoi toutes rondes — les dix listes v4\n");
const noms = Object.keys(DECKS);
const bilan: Record<string, { v: number; d: number }> = {};
for (const n of noms) bilan[n] = { v: 0, d: 0 };
const parPaire = Math.max(4, Math.round(N / 3));
for (let i = 0; i < noms.length; i++) {
  for (let j = i + 1; j < noms.length; j++) {
    const { victoiresA, victoiresB } = duel(noms[i]!, noms[j]!, parPaire);
    bilan[noms[i]!]!.v += victoiresA; bilan[noms[i]!]!.d += victoiresB;
    bilan[noms[j]!]!.v += victoiresB; bilan[noms[j]!]!.d += victoiresA;
  }
}
console.log(`    (${parPaire} parties par paire, 45 paires)\n`);
const classement = noms.map((n) => ({ n, ...bilan[n]!, r: bilan[n]!.v / Math.max(1, bilan[n]!.v + bilan[n]!.d) }))
  .sort((x, y) => y.r - x.r);
for (const c of classement) {
  const barre = "█".repeat(Math.round(c.r * 30));
  console.log(`    ${(c.r * 100).toFixed(0).padStart(3)}%  ${barre.padEnd(30)} ${c.n}  (${c.v}V ${c.d}D)`);
}
console.log();
