import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import type { DeckList } from "@/game/cards/decks/types";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";
import { withSeededRandom } from "./botLadder/ladder";
import { BIENFAITS, FELINS } from "./mareeBenieDecks";

/**
 * LA MARÉE BÉNIE jouée par le bot, de la première pioche à la victoire :
 * aucun coup proposé ne doit être refusé par le moteur (Bénédiction,
 * Souillure, Voile, marqueurs, questions et fenêtres comprises). Parties
 * complètes : test LENT (`npm run test:lents`).
 */

function partie(a: DeckList, b: DeckList, seed: number): { state: GameState; refus: string[] } {
  let state = createGameState({ gameId: `maree-${seed}`, player1: { id: "A", deck: a }, player2: { id: "B", deck: b }, seed });
  const refus: string[] = [];
  withSeededRandom(seed, () => {
    for (let guard = 0; guard < 3000 && state.status === "active"; guard += 1) {
      const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
      if (!actor) break;
      const action = chooseBotAction(state, actor, "difficile");
      const result = dispatch(state, action);
      if (!result.ok) {
        refus.push(`${action.type} : ${result.error}`);
        break;
      }
      if (result.state === state) break;
      state = result.state;
    }
  });
  return { state, refus };
}

describe("La Marée Bénie jouée par le bot", () => {
  it("Bienfaits du Fond contre Équipage Félin : le bot mène la partie à son terme, sans coup refusé", () => {
    for (const seed of [1, 2]) {
      const { state, refus } = partie(BIENFAITS, FELINS, seed);
      expect(refus, `graine ${seed}`).toEqual([]);
      expect(state.status, `graine ${seed}`).toBe("finished");
    }
  });

  it("contre un préconstruit existant aussi", () => {
    const { state, refus } = partie(FELINS, PLAYABLE_DECKS[1]!, 3);
    expect(refus).toEqual([]);
    expect(state.status).toBe("finished");
  });
});
