import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { DECK_ABYSSES_SILENCIEUSES, DECK_MAREE_MONTANTE } from "@/game/cards/decks/preconstructed";
import { RULES } from "@/game/rules/constants";

function newTestGame(seed = 42) {
  return createGameState({
    gameId: "test-game",
    player1: { id: "p1", deck: DECK_MAREE_MONTANTE },
    player2: { id: "p2", deck: DECK_ABYSSES_SILENCIEUSES },
    seed,
  });
}

describe("createGameState", () => {
  it("distribue la bonne taille de main de départ (second joueur +1)", () => {
    const state = newTestGame();
    expect(state.players[0].hand).toHaveLength(RULES.STARTING_HAND_SIZE);
    expect(state.players[1].hand).toHaveLength(RULES.STARTING_HAND_SIZE + RULES.SECOND_PLAYER_EXTRA_CARD);
  });

  it("installe l'Ancrage et la Raison de départ depuis le Navire choisi par chaque deck", () => {
    const state = newTestGame();
    expect(state.players[0].shipId).toBe("le-brise-lames");
    expect(state.players[0].anchor).toBe(24);
    expect(state.players[0].reasonMax).toBe(8);
    expect(state.players[0].reason).toBe(8);
    expect(state.players[1].shipId).toBe("linsondable");
    expect(state.players[1].anchor).toBe(18);
    expect(state.players[1].reasonMax).toBe(10);
    expect(state.players[1].reason).toBe(10);
  });

  it("initialise la Marée en Calme avec sa durée et son Intensité de base", () => {
    const state = newTestGame();
    expect(state.environment.tideState).toBe("calme");
    expect(state.environment.tideRemainingTurns).toBe(RULES.TIDE_STATE_DURATION.calme);
    expect(state.environment.tideIntensity).toBe(RULES.TIDE_BASE_INTENSITY);
  });

  it("tire des Eaux de départ dans WATER_POOL (jamais l'utilitaire de test mer-etale)", () => {
    const state = newTestGame();
    expect(state.environment.currentWaterId).not.toBe("mer-etale");
    expect(state.environment.waterRemainingTurns).toBeGreaterThan(0);
  });

  it("aucun joueur n'a utilisé son action principale au départ", () => {
    const state = newTestGame();
    expect(state.players[0].hasUsedMainActionThisTurn).toBe(false);
    expect(state.players[1].hasUsedMainActionThisTurn).toBe(false);
  });

  it("est parfaitement déterministe pour une même graine", () => {
    const a = newTestGame(7);
    const b = newTestGame(7);
    const handA = a.players[0].hand.map((c) => c.cardId);
    const handB = b.players[0].hand.map((c) => c.cardId);
    expect(handA).toEqual(handB);
    expect(a.environment.currentWaterId).toBe(b.environment.currentWaterId);
  });

  it("ne perd ni ne duplique de carte : deck + main = taille du deck initial", () => {
    const state = newTestGame();
    const totalP1 = state.players[0].deck.length + state.players[0].hand.length;
    expect(totalP1).toBe(DECK_MAREE_MONTANTE.cardIds.length);
  });
});
