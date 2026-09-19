import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BANC_DEBORDE, DECK_BEC_DANS_LA_BRUME } from "@/game/cards/decks/borrowed";
import { botHasSomethingToDo, runBotUntilIdle } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";

/**
 * Déroulé d'une partie contre bot telle que le serveur la joue
 * (`features/matches/matchStore.ts`) : le joueur humain soumet UN coup, puis
 * le serveur fait jouer le bot jusqu'à ce qu'il rende la main
 * (`runBotUntilIdle`). Le "joueur humain" est ici simulé par le bot lui-même,
 * pour obtenir des parties complètes et variées.
 */
function newServerBotMatch(seed: number): GameState {
  return createGameState({
    gameId: "server-bot-match",
    player1: { id: "human", deck: DECK_LE_BANC_DEBORDE },
    player2: { id: "bot", deck: DECK_BEC_DANS_LA_BRUME },
    seed,
  });
}

describe("runBotUntilIdle — partie contre bot arbitrée côté serveur", () => {
  it("ne fait rien quand le bot n'a rien à décider", () => {
    expect(runBotUntilIdle(newServerBotMatch(3), "bot", "moyen")).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5])("rend toujours la main au joueur, jusqu'à la fin de la partie (graine %i)", (seed) => {
    let state = newServerBotMatch(seed);
    let submissions = 0;

    while (state.status === "active" && submissions < 600) {
      // Le serveur n'accepte un coup que de l'humain, et seulement quand il a quelque chose à décider.
      expect(botHasSomethingToDo(state, "human")).toBe(true);

      const result = dispatch(state, chooseBotAction(state, "human", "facile"));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      submissions += 1;

      const frames = runBotUntilIdle(result.state, "bot", "moyen");
      state = frames.length > 0 ? frames[frames.length - 1]! : result.state;

      // Chaque état intermédiaire renvoyé au client est un état réel, en ordre (le journal ne fait que grandir).
      let previousLength = result.state.eventLog.length;
      for (const frame of frames) {
        expect(frame.eventLog.length).toBeGreaterThanOrEqual(previousLength);
        previousLength = frame.eventLog.length;
      }

      if (state.status === "active") {
        expect(botHasSomethingToDo(state, "bot")).toBe(false);
      }
    }

    expect(state.status).toBe("finished");
  });
});
