import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BRISE_LAMES, DECK_LE_COURLIS } from "@/game/cards/decks/preconstructed";
import { runBotTurn } from "@/game/bot/runBotTurn";
import type { BotDifficulty } from "@/game/bot/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

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

  it("résout automatiquement un choix forcé en attente (Le Fond Vous Regarde), même hors de son propre tour", () => {
    const fondVousRegarde = instance("le-fond-vous-regarde", "p1");
    const state = testGameState({
      activePlayerId: "p2",
      players: [
        testPlayer("p1", { board: [fondVousRegarde], reason: 10, anchor: 20 }),
        testPlayer("p2", { reason: 10, anchor: 20 }),
      ],
      pendingChoice: {
        playerId: "p2",
        sourceInstanceId: fondVousRegarde.instanceId,
        reasonLossAmount: 1,
        anchorDamageAmount: 1,
        turnNumber: 1,
      },
    });

    const result = runBotTurn(state, "p2", "difficile");
    expect(result.pendingChoice).toBeUndefined();
    // L'Ancrage pèse bien plus lourd que la Raison dans `evaluateState` : le bot doit préférer perdre de la Raison.
    expect(result.players[1].reason).toBe(9);
    expect(result.players[1].anchor).toBe(20);
  });
});
