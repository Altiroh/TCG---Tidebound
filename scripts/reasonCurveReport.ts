/**
 * Relevé de la courbe de Raison — passe de stabilisation (21/09/2026).
 *
 * Joue N parties bot contre bot et relève les mesures demandées par le
 * cadrage : rythme de pose, occupation des Slots, premier tour où un coût
 * 5/6/7 est joué, Déraison prise et ce qu'elle coûte, durée des parties.
 *
 * Les valeurs n'ont d'intérêt que COMPARÉES : lancer ce script avant et
 * après un changement de règle (`git stash` sur le moteur) et lire l'écart.
 * Un bot n'est pas un joueur — il ne cherche pas à optimiser sa courbe —
 * donc ces chiffres disent le RYTHME du jeu, pas sa qualité.
 *
 *   npx tsx scripts/reasonCurveReport.ts [nbParties]
 */
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BANC_DEBORDE, DECK_BEC_DANS_LA_BRUME } from "@/game/cards/decks/borrowed";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { getCardDefinition } from "@/game/cards/sets/core";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";
import type { GameEvent } from "@/game/events/types";

const PARTIES = Number(process.argv[2] ?? 20);

interface Releve {
  posesParTour: number[]; // index = numéro de tour (1-based), valeur = cartes posées
  slotsFinDeTour: number[]; // index = numéro de tour, valeur = permanents sur le plateau
  premierCout: Record<5 | 6 | 7, number | undefined>;
  deraisonPrise: number; // total des points de Déraison atteints
  ancrageDeraison: number; // dégâts d'Ancrage réellement infligés par la dette
  tours: number;
}

function jouer(seed: number): Releve {
  let state: GameState = createGameState({
    gameId: `releve-${seed}`,
    player1: { id: "a", deck: DECK_LE_BANC_DEBORDE },
    player2: { id: "b", deck: DECK_BEC_DANS_LA_BRUME },
    seed,
  });

  const r: Releve = {
    posesParTour: [],
    slotsFinDeTour: [],
    premierCout: { 5: undefined, 6: undefined, 7: undefined },
    deraisonPrise: 0,
    ancrageDeraison: 0,
    tours: 0,
  };

  const noter = (avant: GameState, apres: GameState, evenements: readonly GameEvent[]) => {
    const tour = avant.turnNumber;
    for (const e of evenements ?? []) {
      if (!e) continue;
      if (e.type === "PLAY_CARD") {
        // La carte est cherchée dans la main d'AVANT : c'est le seul endroit
        // où elle est à coup sûr, une fois posée elle peut déjà être partie
        // (Objet brisé dans la foulée, Sabordage, effet qui la détruit).
        const jouee = avant.players.flatMap((pl) => pl.hand).find((c) => c.instanceId === e.instanceId);
        const cout = jouee ? getCardDefinition(jouee.cardId).cost : undefined;
        r.posesParTour[tour] = (r.posesParTour[tour] ?? 0) + 1;
        if (cout !== undefined && cout >= 5 && cout <= 7) {
          const k = cout as 5 | 6 | 7;
          if (r.premierCout[k] === undefined) r.premierCout[k] = tour;
        }
      }
      if (e.type === "DERAISON_SETTLED") {
        r.deraisonPrise += e.debt;
        r.ancrageDeraison += e.anchorDamage;
      }
    }
    // Slots occupés, relevés au changement de tour.
    if (apres.turnNumber !== avant.turnNumber) {
      r.slotsFinDeTour[tour] = Math.max(...apres.players.map((pl) => pl.board.length));
    }
  };

  let coups = 0;
  while (state.status === "active" && coups < 800) {
    // Celui qui a quelque chose à décider : l'actif en temps normal, mais
    // l'autre pendant une fenêtre de réaction.
    const acteur = state.players.map((pl) => pl.id).find((id) => botHasSomethingToDo(state, id));
    if (!acteur) break;
    const avant = state;
    const res = dispatch(state, chooseBotAction(state, acteur, "moyen"));
    if (!res.ok) break;
    noter(avant, res.state, res.events);
    state = res.state;
    coups += 1;
  }
  r.tours = state.turnNumber;
  return r;
}

const moyenne = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const fmt = (n: number) => n.toFixed(2);

const releves = Array.from({ length: PARTIES }, (_, i) => jouer(i + 1));

console.log(`\n=== Relevé de la courbe de Raison — ${PARTIES} parties (bot moyen vs bot moyen) ===\n`);

console.log("Cartes posées par tour (moyenne) :");
for (let t = 1; t <= 6; t++) {
  console.log(`  T${t} : ${fmt(moyenne(releves.map((r) => r.posesParTour[t] ?? 0)))}`);
}

console.log("\nPermanents sur le plateau à la fin du tour (moyenne du plus fourni des deux) :");
for (let t = 1; t <= 6; t++) {
  console.log(`  T${t} : ${fmt(moyenne(releves.map((r) => r.slotsFinDeTour[t] ?? 0)))}`);
}

console.log("\nPremier tour où un coût élevé est joué (moyenne sur les parties où il l'est) :");
for (const c of [5, 6, 7] as const) {
  const vus = releves.map((r) => r.premierCout[c]).filter((v): v is number => v !== undefined);
  console.log(`  coût ${c} : ${vus.length === 0 ? "jamais joué" : `T${fmt(moyenne(vus))} (dans ${vus.length}/${PARTIES} parties)`}`);
}

console.log("\nDéraison :");
console.log(`  points de dette réglés par partie : ${fmt(moyenne(releves.map((r) => r.deraisonPrise)))}`);
console.log(`  Ancrage perdu à cause de la dette   : ${fmt(moyenne(releves.map((r) => r.ancrageDeraison)))}`);

console.log(`\nDurée moyenne d'une partie : ${fmt(moyenne(releves.map((r) => r.tours)))} tours\n`);
