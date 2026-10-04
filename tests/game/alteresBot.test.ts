import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { runBotTurn } from "@/game/bot/runBotTurn";
import { CORE_SET } from "@/game/cards/sets/core";
import { getMaxCopies } from "@/game/cards/types";
import type { DeckList } from "@/game/cards/decks/types";
import type { GameState } from "@/game/state/types";

/**
 * LOT 16 — LES ALTÉRÉS en partie complète, bot contre bot.
 *
 * Ce qui est vérifié : les chaînes d'Éveils posent des questions en file
 * (`pendingChoiceQueue`), et Propagation se joue depuis la main dans une
 * fenêtre de réaction — le bot doit répondre à tout ça sans jamais rester
 * coincé, et la partie doit aller à son terme.
 */

function deck(id: string, filtre: (cardId: string) => boolean, shipId: string): DeckList {
  const cartes = CORE_SET.filter((def) => filtre(def.id) && !def.id.endsWith("-abyssal"));
  const cardIds: string[] = [];
  for (let copie = 0; copie < 3 && cardIds.length < 40; copie++) {
    for (const def of cartes) {
      if (cardIds.length >= 40) break;
      if (copie < getMaxCopies(def)) cardIds.push(def.id);
    }
  }
  return { id, name: id, shipId, description: "Test du Lot 16.", cardIds };
}

const lot = new Set(CORE_SET.filter((def) => def.setCode === "la-mutation-mondiale").map((def) => def.id));
const ALTERES = deck("alteres", (id) => lot.has(id), "le-brise-lames");
const VERRE = deck("verre", (id) => CORE_SET.find((def) => def.id === id)?.archetype === "equipage-de-verre", "le-goliath");

function jouer(p1: DeckList, p2: DeckList, seed: number): { state: GameState; etapes: number } {
  let state = createGameState({ gameId: `lot16-${seed}`, player1: { id: "p1", deck: p1 }, player2: { id: "p2", deck: p2 }, seed });
  let etapes = 0;
  while (state.status === "active" && etapes < 400) {
    const doitJouer = state.pendingReaction?.awaitingPlayerId ?? state.pendingChoice?.playerId ?? state.activePlayerId;
    state = runBotTurn(state, doitJouer, "moyen");
    etapes += 1;
  }
  return { state, etapes };
}

describe("Lot 16 en partie complète", () => {
  it("le deck Altérés fait 40 cartes du lot", () => {
    expect(ALTERES.cardIds).toHaveLength(40);
    for (const id of ALTERES.cardIds) expect(lot.has(id), id).toBe(true);
  });

  it.each([
    ["Altérés contre Altérés", ALTERES, ALTERES, 16],
    ["Altérés contre Verre", ALTERES, VERRE, 61],
    ["Verre contre Altérés", VERRE, ALTERES, 7],
  ] as const)("%s : la partie va à son terme, sans blocage", (_nom, p1, p2, seed) => {
    const { state, etapes } = jouer(p1, p2, seed);
    expect(state.status, `partie encore active après ${etapes} tours de bot`).toBe("finished");
  });
});
