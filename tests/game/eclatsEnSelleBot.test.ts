import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { runBotTurn } from "@/game/bot/runBotTurn";
import { CORE_SET } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";
import type { DeckList } from "@/game/cards/decks/types";
import type { GameState } from "@/game/state/types";

/**
 * LOT 15 EN PARTIE COMPLÈTE : le bot joue les trois familles l'une contre
 * l'autre jusqu'au bout.
 *
 * Ce test ne juge pas l'équilibre (c'est le travail du banc de
 * préconstruits) : il vérifie qu'aucune des mécaniques ouvertes par le lot —
 * survie aux dégâts, Signaux, choix de couleur, regard de pioche adverse,
 * Assemblage — ne bloque une partie, ne boucle, ni ne plante. Une question
 * posée sans que personne ne puisse y répondre se voit ici, et nulle part
 * ailleurs avant la production.
 */

function deckDeFamille(id: string, filtre: (cardId: string) => boolean, shipId: string): DeckList {
  const cartes = CORE_SET.filter((def) => filtre(def.id) && !def.id.endsWith("-abyssal"));
  const cardIds: string[] = [];
  // Trois tours de table sur la liste : chaque carte une fois, puis deux,
  // puis trois — le deck reste varié même tronqué à 40.
  for (let copie = 0; copie < 3 && cardIds.length < 40; copie++) {
    for (const def of cartes) {
      if (cardIds.length >= 40) break;
      if (copie < getMaxCopies(def)) cardIds.push(def.id);
    }
  }
  return { id, name: id, shipId, description: "Test du Lot 15.", cardIds };
}

const lot = new Set(CORE_SET.filter((def) => def.setCode === "eclats-en-selle").map((def) => def.id));
const archetype = (cardId: string) => CORE_SET.find((def) => def.id === cardId)?.archetype;

const VERRE = deckDeFamille(
  "verre",
  (id) => lot.has(id) && (archetype(id) === "equipage-de-verre" || archetype(id) === undefined) && !["selle-de-guerre", "harnais-de-retenue", "debusquer", "ouvrez-la-ligne", "pas-un-pas-de-plus", "la-mauvaise-reputation"].includes(id),
  "le-brise-lames"
);
const CAVALERIE = deckDeFamille("cavalerie", (id) => lot.has(id) && archetype(id) !== "sentinelle-chromatique", "le-goliath");
const SENTINELLES = deckDeFamille("sentinelles", (id) => lot.has(id) && archetype(id) === "sentinelle-chromatique", "le-brise-lames");

function jouer(p1: DeckList, p2: DeckList, seed: number): { state: GameState; etapes: number } {
  let state = createGameState({ gameId: `lot15-${seed}`, player1: { id: "p1", deck: p1 }, player2: { id: "p2", deck: p2 }, seed });
  let etapes = 0;
  while (state.status === "active" && etapes < 400) {
    // Celui que le moteur attend : une fenêtre ou un choix peut attendre
    // l'adversaire du joueur actif (Signal Violet, Pas un Pas de Plus…).
    const doitJouer = state.pendingReaction?.awaitingPlayerId ?? state.pendingChoice?.playerId ?? state.activePlayerId;
    state = runBotTurn(state, doitJouer, "moyen");
    etapes += 1;
  }
  return { state, etapes };
}

describe("Lot 15 en partie complète", () => {
  it("les trois decks de famille font 40 cartes du lot", () => {
    for (const deck of [VERRE, CAVALERIE, SENTINELLES]) {
      expect(deck.cardIds, deck.id).toHaveLength(40);
      for (const id of deck.cardIds) expect(lot.has(id), `${deck.id} : ${id}`).toBe(true);
    }
  });

  it.each([
    ["Verre contre Cavalerie", VERRE, CAVALERIE, 11],
    ["Cavalerie contre Sentinelles", CAVALERIE, SENTINELLES, 23],
    ["Sentinelles contre Verre", SENTINELLES, VERRE, 37],
    ["Sentinelles contre Sentinelles", SENTINELLES, SENTINELLES, 41],
  ] as const)("%s : la partie va à son terme, sans blocage", (_nom, p1, p2, seed) => {
    const { state, etapes } = jouer(p1, p2, seed);
    expect(state.status, `partie encore active après ${etapes} tours de bot`).toBe("finished");
  });
});
