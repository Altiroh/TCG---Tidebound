import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BRISE_LAMES, DECK_LE_COURLIS } from "@/game/cards/decks/preconstructed";
import { runBotTurn } from "@/game/bot/runBotTurn";
import type { BotDifficulty } from "@/game/bot/types";

function newTestGame(seed: number) {
  return createGameState({
    gameId: "bot-test-game",
    player1: { id: "p1", deck: DECK_LE_BRISE_LAMES },
    player2: { id: "p2", deck: DECK_LE_COURLIS },
    seed,
  });
}

const DIFFICULTIES: BotDifficulty[] = ["facile", "moyen", "difficile"];

describe("runBotTurn", () => {
  it.each(DIFFICULTIES)("joue un tour complet et légal sans jamais planter (%s)", (difficulty) => {
    const initial = newTestGame(1);
    const afterP1 = runBotTurn(initial, "p1", difficulty);
    expect(afterP1.activePlayerId).not.toBe("p1");
    expect(afterP1.status).toBe("active");
  });

  it("finit toujours par rendre la main (jamais bloqué en boucle infinie)", () => {
    let state = newTestGame(7);
    for (let i = 0; i < 20 && state.status === "active"; i++) {
      const active = state.activePlayerId;
      state = runBotTurn(state, active, "difficile");
      // Le tour doit toujours progresser : soit la main passe à l'autre
      // joueur, soit la partie se termine en cours de tour (ex: une
      // attaque fatale avant même `endTurn`) — dans les deux cas ce n'est
      // jamais un blocage.
      if (state.status === "active") {
        expect(state.activePlayerId).not.toBe(active);
      }
    }
    expect(["active", "finished"]).toContain(state.status);
  });

  it("ne fait jamais progresser l'état si ce n'est pas le tour du joueur demandé", () => {
    const initial = newTestGame(3);
    const result = runBotTurn(initial, "p2", "moyen");
    expect(result).toBe(initial);
  });
});
