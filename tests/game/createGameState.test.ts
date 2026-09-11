import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BRISE_LAMES, DECK_LE_COURLIS } from "@/game/cards/decks/preconstructed";
import { RULES } from "@/game/rules/constants";

function newTestGame(seed = 42) {
  return createGameState({
    gameId: "test-game",
    player1: { id: "p1", deck: DECK_LE_BRISE_LAMES },
    player2: { id: "p2", deck: DECK_LE_COURLIS },
    seed,
  });
}

describe("createGameState", () => {
  it("distribue la bonne taille de main de départ (second joueur +1)", () => {
    const state = newTestGame();
    expect(state.players[0].hand).toHaveLength(RULES.STARTING_HAND_SIZE);
    expect(state.players[1].hand).toHaveLength(RULES.STARTING_HAND_SIZE + RULES.SECOND_PLAYER_EXTRA_CARD);
  });

  it("installe l'Ancrage et la Raison max depuis le Navire choisi par chaque deck, mais démarre à 50% de Raison", () => {
    const state = newTestGame();
    expect(state.players[0].shipId).toBe("le-brise-lames");
    expect(state.players[0].anchor).toBe(24);
    expect(state.players[0].reasonMax).toBe(8);
    expect(state.players[0].reason).toBe(4);
    expect(state.players[1].shipId).toBe("le-courlis");
    expect(state.players[1].anchor).toBe(17);
    expect(state.players[1].reasonMax).toBe(12);
    expect(state.players[1].reason).toBe(6);
  });

  it("initialise la Marée en Calme, orientation Montante, avec sa durée et son Intensité de base", () => {
    const state = newTestGame();
    expect(state.environment.tideState).toBe("calme");
    expect(state.environment.tideRemainingTurns).toBe(RULES.TIDE_STATE_DURATION.calme);
    expect(state.environment.tideOrientation).toBe("montante");
    expect(state.environment.tideIntensity).toBe(RULES.TIDE_BASE_INTENSITY);
  });

  it("est parfaitement déterministe pour une même graine", () => {
    const a = newTestGame(7);
    const b = newTestGame(7);
    const handA = a.players[0].hand.map((c) => c.cardId);
    const handB = b.players[0].hand.map((c) => c.cardId);
    expect(handA).toEqual(handB);
  });

  it("ne perd ni ne duplique de carte : deck + main = taille du deck initial", () => {
    const state = newTestGame();
    const totalP1 = state.players[0].deck.length + state.players[0].hand.length;
    expect(totalP1).toBe(DECK_LE_BRISE_LAMES.cardIds.length);
  });
});
