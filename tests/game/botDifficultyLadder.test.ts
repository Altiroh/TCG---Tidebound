import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { PLAYABLE_DECKS } from "@/game/cards/decks/testDecks";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { dispatch } from "@/game/engine";
import type { BotDifficulty } from "@/game/bot/types";
import type { GameState } from "@/game/state/types";

/**
 * L'ÉCHELLE DE DIFFICULTÉ, vérifiée en jouant.
 *
 * Elle était inversée sans que rien ne le dise : « moyen » perdait 2 parties
 * sur 12 contre « facile », parce que sa marge d'erreur allait piocher dans
 * la moitié la plus faible des coups quand celle de « facile » se contentait
 * d'écarter le pire quart. Aucun test ne pouvait le voir — les difficultés
 * n'étaient comparées à rien.
 *
 * Chaque affrontement se joue dans les DEUX sens, pour que l'avantage du
 * premier joueur ne décide pas du résultat. Les seuils sont volontairement
 * larges : ces bots comportent du hasard, et ce test doit signaler une
 * échelle CASSÉE, pas osciller au gré d'un réglage.
 */
function playMatch(a: BotDifficulty, b: BotDifficulty, seed: number): "A" | "B" | null {
  let state: GameState = createGameState({
    gameId: `ladder-${seed}`,
    player1: { id: "A", deck: PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]! },
    player2: { id: "B", deck: PLAYABLE_DECKS[(seed + 3) % PLAYABLE_DECKS.length]! },
    seed,
  });

  for (let guard = 0; guard < 3000 && state.status === "active"; guard += 1) {
    const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
    if (!actor) break;
    const result = dispatch(state, chooseBotAction(state, actor, actor === "A" ? a : b));
    if (!result.ok || result.state === state) break;
    state = result.state;
  }

  return state.winnerId === "A" ? "A" : state.winnerId === "B" ? "B" : null;
}

/** Parties gagnées par `strong` contre `weak`, les deux couleurs jouées. */
function winsOfStronger(strong: BotDifficulty, weak: BotDifficulty, seeds: number): { wins: number; played: number } {
  let wins = 0;
  let played = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const strongIsA of [true, false]) {
      const winner = playMatch(strongIsA ? strong : weak, strongIsA ? weak : strong, seed);
      if (!winner) continue;
      played += 1;
      if ((winner === "A") === strongIsA) wins += 1;
    }
  }
  return { wins, played };
}

describe("échelle de difficulté du bot", () => {
  it("« moyen » bat « facile » — l'échelle était inversée", () => {
    const { wins, played } = winsOfStronger("moyen", "facile", 8);
    expect(played).toBeGreaterThan(10);
    expect(wins / played).toBeGreaterThan(0.6);
  });

  it("« difficile » bat « moyen »", () => {
    // L'écart mesuré est d'environ deux parties sur trois. Le seuil est
    // placé nettement en-dessous, et sur assez de parties pour que le test
    // signale une échelle cassée sans clignoter à chaque réglage.
    const { wins, played } = winsOfStronger("difficile", "moyen", 10);
    expect(played).toBeGreaterThan(14);
    expect(wins / played).toBeGreaterThan(0.55);
  });

  it("« difficile » écrase « facile »", () => {
    const { wins, played } = winsOfStronger("difficile", "facile", 6);
    expect(played).toBeGreaterThan(8);
    expect(wins / played).toBeGreaterThan(0.7);
  });
});
