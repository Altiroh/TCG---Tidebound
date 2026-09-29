import { describe, expect, it } from "vitest";
import { auraContextOf, collectAuraContributions, computeEffectiveStats, createGameState, PLAYABLE_DECKS, stepBotTurn } from "@/game";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";

/**
 * Les bonus de plateau sont mémorisés par identité d'objets (`auraTotals`,
 * `game/cards/stats.ts`). Le cache ne doit JAMAIS rendre autre chose que le
 * calcul direct — y compris quand le plateau change d'un état à l'autre.
 */
describe("mémoire des bonus de plateau", () => {
  it("rend toujours la somme des contributions, tout au long de vraies parties", () => {
    let checks = 0;
    for (let seed = 1; seed <= 6; seed++) {
      let state = createGameState({
        gameId: `aura-${seed}`,
        player1: { id: "p1", deck: PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]! },
        player2: { id: "p2", deck: PLAYABLE_DECKS[(seed + 7) % PLAYABLE_DECKS.length]! },
        seed,
      });
      for (let i = 0; i < 120 && state.status === "active"; i++) {
        for (const player of state.players) {
          const aura = auraContextOf(state, player.id);
          for (const unit of player.board) {
            const base = computeEffectiveStats(unit, state.environment.tideState);
            const withAura = computeEffectiveStats(unit, state.environment.tideState, aura);
            const direct = collectAuraContributions(unit, state.environment.tideState, aura);
            expect(withAura.attack).toBe(base.attack + direct.reduce((sum, c) => sum + c.attack, 0));
            expect(withAura.health).toBe(base.health + direct.reduce((sum, c) => sum + c.health, 0));
            checks++;
          }
        }
        const actor = botHasSomethingToDo(state, "p1") ? "p1" : "p2";
        state = stepBotTurn(state, actor, "moyen").state;
      }
    }
    expect(checks).toBeGreaterThan(200);
  });

  it("suit un changement de contexte sur le même plateau (Raison, joueur actif)", () => {
    const state = createGameState({ gameId: "aura-ctx", player1: { id: "p1", deck: PLAYABLE_DECKS[0]! }, player2: { id: "p2", deck: PLAYABLE_DECKS[1]! }, seed: 9 });
    const board = state.players[0].board;
    for (const unit of board) {
      const low = computeEffectiveStats(unit, state.environment.tideState, { controllerBoard: board, controllerReason: -3, controllerIsActive: true });
      const high = computeEffectiveStats(unit, state.environment.tideState, { controllerBoard: board, controllerReason: 9, controllerIsActive: false });
      const lowDirect = collectAuraContributions(unit, state.environment.tideState, { controllerBoard: board, controllerReason: -3, controllerIsActive: true });
      const highDirect = collectAuraContributions(unit, state.environment.tideState, { controllerBoard: board, controllerReason: 9, controllerIsActive: false });
      expect(low.attack - high.attack).toBe(lowDirect.reduce((s, c) => s + c.attack, 0) - highDirect.reduce((s, c) => s + c.attack, 0));
    }
  });
});
