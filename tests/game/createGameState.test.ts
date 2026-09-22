import { describe, expect, it } from "vitest";
import { getShipDefinition } from "@/game/environment/shipData";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_GRAND_BANC, DECK_LE_THEATRE_ENGLOUTI } from "@/game/cards/decks/borrowed";
import { RULES } from "@/game/rules/constants";

function newTestGame(seed = 42) {
  return createGameState({
    gameId: "test-game",
    player1: { id: "p1", deck: DECK_LE_GRAND_BANC },
    player2: { id: "p2", deck: DECK_LE_THEATRE_ENGLOUTI },
    seed,
  });
}

describe("createGameState", () => {
  it("distribue la bonne taille de main de départ (second joueur +1)", () => {
    const state = newTestGame();
    expect(state.players[0].hand).toHaveLength(RULES.STARTING_HAND_SIZE);
    expect(state.players[1].hand).toHaveLength(RULES.STARTING_HAND_SIZE + RULES.SECOND_PLAYER_EXTRA_CARD);
  });

  it("installe l'Ancrage et la Raison max depuis le Navire choisi par chaque deck, mais démarre au plafond de 15 % (arrondi au supérieur)", () => {
    const state = newTestGame();
    expect(state.players[0].shipId).toBe("le-brise-lames");
    // L'Ancrage est LU sur le Navire : ce test vérifie le câblage, pas la
    // valeur, qui bouge au gré de l'équilibrage du rythme.
    expect(state.players[0].anchor).toBe(getShipDefinition("le-brise-lames").startingAnchor);
    expect(state.players[0].reasonMax).toBe(8);
    expect(state.players[0].reason).toBe(2);
    expect(state.players[0].reasonCap).toBe(2);
    expect(state.players[1].shipId).toBe("le-courlis");
    expect(state.players[1].anchor).toBe(getShipDefinition("le-courlis").startingAnchor);
    expect(state.players[1].reasonMax).toBe(12);
    expect(state.players[1].reason).toBe(2);
    expect(state.players[1].reasonCap).toBe(2);
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
    expect(totalP1).toBe(DECK_LE_GRAND_BANC.cardIds.length);
  });
});
