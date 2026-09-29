import { describe, expect, it } from "vitest";
import { applyBotAction, chooseBotAction, createGameState, PLAYABLE_DECKS, stepBotTurn, type GameState } from "@/game";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { thinkBotAction } from "@/features/match/bot/botThinker";

function midGame(seed: number): GameState {
  let state = createGameState({
    gameId: `thinker-${seed}`,
    player1: { id: "p1", deck: PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]! },
    player2: { id: "p2", deck: PLAYABLE_DECKS[(seed + 4) % PLAYABLE_DECKS.length]! },
    seed,
  });
  for (let i = 0; i < 25 && state.status === "active"; i++) {
    const actor = botHasSomethingToDo(state, "p1") ? "p1" : "p2";
    state = stepBotTurn(state, actor, "moyen").state;
  }
  return state;
}

function withoutClock(state: GameState): GameState {
  return { ...state, eventLog: state.eventLog.map((event) => ({ ...event, timestamp: 0 })) };
}

describe("réflexion du bot hors du fil principal", () => {
  it("sans Worker (tests, serveur), choisit exactement ce que choisit le moteur", async () => {
    const state = midGame(3);
    const actor = botHasSomethingToDo(state, "p1") ? "p1" : "p2";
    // « Difficile » est déterministe : le même état donne la même action.
    expect(await thinkBotAction(state, actor, "difficile")).toEqual(chooseBotAction(state, actor, "difficile"));
  });

  it("choisir puis appliquer (`applyBotAction`) revient à `stepBotTurn`", () => {
    for (const seed of [1, 2, 5]) {
      const state = midGame(seed);
      const actor = botHasSomethingToDo(state, "p1") ? "p1" : "p2";
      const split = applyBotAction(state, actor, chooseBotAction(state, actor, "difficile"));
      const whole = stepBotTurn(state, actor, "difficile");
      expect(split.done).toBe(whole.done);
      // Seule l'heure des événements diffère (horloge murale) : on la neutralise.
      expect(withoutClock(split.state)).toEqual(withoutClock(whole.state));
    }
  });
});
