import { describe, expect, it } from "vitest";
import { createGameState, dispatch, PLAYABLE_DECKS, toPlayerView, type GameState } from "@/game";
import { packFrames, unpackFrames } from "@/features/matches/matchFrames";

/**
 * Vues successives d'une partie, projetées pour `p1` — comme la suite de
 * vues d'un coup suivi du tour du bot. Déterministe (fins de tour
 * alternées, pas de bot tiré au hasard) : chaque étape pioche et allonge le
 * journal.
 */
function botTurnViews(): GameState[] {
  let state = createGameState({
    gameId: "frames",
    player1: { id: "p1", deck: PLAYABLE_DECKS[0]! },
    player2: { id: "bot", deck: PLAYABLE_DECKS[1]! },
  });
  const views: GameState[] = [];
  for (let step = 0; step < 8 && state.status === "active"; step++) {
    const ended = dispatch(state, { type: "endTurn", playerId: state.activePlayerId });
    if (!ended.ok) break;
    state = ended.state;
    views.push(toPlayerView(state, "p1"));
  }
  return views;
}

describe("packFrames / unpackFrames", () => {
  it("restitue chaque vue à l'identique, journal compris (même projection)", () => {
    const views = botTurnViews();
    expect(views.length).toBeGreaterThan(1);
    // Aller-retour JSON : c'est ce que subit réellement la réponse d'une Server Action.
    const restored = unpackFrames(JSON.parse(JSON.stringify(packFrames(views))));
    expect(restored).toHaveLength(views.length);
    restored.forEach((view, index) => {
      expect({ ...view, eventLog: [] }).toEqual({ ...views[index]!, eventLog: [] });
      expect(view.eventLog).toEqual(views[views.length - 1]!.eventLog.slice(0, views[index]!.eventLog.length));
    });
    expect(restored[restored.length - 1]).toEqual(views[views.length - 1]);
  });

  it("ne transporte ni le journal des étapes intermédiaires ni les decks masqués", () => {
    const views = botTurnViews();
    const packed = packFrames(views);
    packed.views.slice(0, -1).forEach((packedView) => expect(packedView.view.eventLog).toEqual([]));
    packed.views.forEach((packedView) => packedView.view.players.forEach((player) => expect(player.deck).toEqual([])));
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(views).length * 0.7);
  });

  it("transporte tel quel un deck qui n'est pas un deck masqué standard", () => {
    const [view] = botTurnViews();
    const altered: GameState = {
      ...view!,
      players: [{ ...view!.players[0], deck: [{ ...view!.players[0].deck[0]!, cardId: "poisson-lanterne" }] }, view!.players[1]],
    };
    const packed = packFrames([altered]);
    expect(packed.views[0]!.deckCounts[0]).toBeNull();
    expect(unpackFrames(packed)).toEqual([altered]);
  });

  it("accepte une vue unique (coup sans tour de bot)", () => {
    const [view] = botTurnViews();
    expect(unpackFrames(packFrames([view!]))).toEqual([view]);
  });
});
