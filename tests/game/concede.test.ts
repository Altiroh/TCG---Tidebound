import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";

describe("abandon volontaire (abandonner le navire)", () => {
  it("termine la partie au profit de l'adversaire, et le journal dit pourquoi", () => {
    const state = testGameState();

    const result = dispatch(state, { type: "concede", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.status).toBe("finished");
    expect(result.state.winnerId).toBe("p2");
    const ended = result.events.find((e) => e.type === "GAME_ENDED");
    expect(ended).toBeDefined();
    expect(ended && "reason" in ended && ended.reason).toBe("concede");
  });

  it("est acceptée hors de son tour — on n'attend pas son tour pour partir", () => {
    const state = testGameState({ activePlayerId: "p1" });

    const result = dispatch(state, { type: "concede", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.winnerId).toBe("p1");
  });

  it("est acceptée pendant une fenêtre de réaction ouverte, qu'elle referme", () => {
    const guetteur = instance("guetteur-mefiant", "p2"); // onCardPlayed, optional, coût 1 Raison
    const cardToPlay = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 3 }),
      ],
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingReaction).toBeDefined();

    // Le joueur dont on attend la réponse abandonne plutôt que de répondre :
    // sans cette exception, la fenêtre resterait ouverte pour toujours.
    const conceded = dispatch(played.state, { type: "concede", playerId: "p2" });
    expect(conceded.ok).toBe(true);
    if (!conceded.ok) return;

    expect(conceded.state.status).toBe("finished");
    expect(conceded.state.winnerId).toBe("p1");
    expect(conceded.state.pendingReaction).toBeUndefined();
  });

  it("refuse un abandon sur une partie déjà terminée, ou d'un joueur qui n'en fait pas partie", () => {
    const finished = testGameState({ status: "finished", winnerId: "p1" });
    expect(dispatch(finished, { type: "concede", playerId: "p2" }).ok).toBe(false);

    const active = testGameState();
    expect(dispatch(active, { type: "concede", playerId: "p3" }).ok).toBe(false);
  });
});
