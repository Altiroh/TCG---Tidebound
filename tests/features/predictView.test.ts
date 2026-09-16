import { describe, expect, it } from "vitest";
import { createGameState, dispatch, PLAYABLE_DECKS, toPlayerView, type GameState } from "@/game";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { predictView } from "@/features/online/predictView";

/**
 * Ce que le joueur voit de lui-même et du plateau : c'est ce que la prédiction affiche.
 * Les identifiants de modificateur sont écartés : ils dérivent de la graine, absente
 * de la vue, et ne s'affichent nulle part.
 */
function visible(view: GameState, playerId: string) {
  return view.players.map((player) => ({
    id: player.id,
    board: player.board.map((unit) => ({ ...unit, modifiers: unit.modifiers.map(({ id: _id, ...modifier }) => modifier) })),
    graveyard: player.graveyard,
    reason: player.reason,
    anchor: player.anchor,
    hand: player.id === playerId ? player.hand : player.hand.length,
  }));
}

describe("predictView", () => {
  it("affiche, pour chaque coup prédit, exactement ce que le serveur renverra", () => {
    let predictedCount = 0;
    for (let deckIndex = 0; deckIndex < PLAYABLE_DECKS.length - 1; deckIndex++) {
      let state = createGameState({
        gameId: `predict-${deckIndex}`,
        player1: { id: "p1", deck: PLAYABLE_DECKS[deckIndex]! },
        player2: { id: "p2", deck: PLAYABLE_DECKS[deckIndex + 1]! },
      });
      // Quelques tours, pour avoir de la Raison et des cartes variées en main.
      for (let turn = 0; turn < 12 && state.status === "active"; turn++) {
        const actor = state.activePlayerId;
        for (const action of enumerateCandidateActions(state, actor)) {
          const view = toPlayerView(state, actor);
          const prediction = predictView(view, action);
          if (!prediction) continue;
          const server = dispatch(state, action);
          expect(server.ok).toBe(true);
          if (!server.ok) continue;
          predictedCount++;
          expect(visible(prediction, actor)).toEqual(visible(toPlayerView(server.state, actor), actor));
        }
        const ended = dispatch(state, { type: "endTurn", playerId: actor });
        if (!ended.ok) break;
        state = ended.state;
      }
    }
    expect(predictedCount).toBeGreaterThan(0);
  });

  it("ne prédit jamais un changement de tour", () => {
    const state = createGameState({ gameId: "predict-end", player1: { id: "p1", deck: PLAYABLE_DECKS[0]! }, player2: { id: "p2", deck: PLAYABLE_DECKS[1]! } });
    expect(predictView(toPlayerView(state, state.activePlayerId), { type: "endTurn", playerId: state.activePlayerId })).toBeNull();
  });
});
