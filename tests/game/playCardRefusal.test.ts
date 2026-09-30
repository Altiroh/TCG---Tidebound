import { describe, expect, it } from "vitest";
import { playCardRefusal } from "@/game";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * `playCardRefusal` : le motif affiché sur le bouton « Jouer » du zoom, au
 * doigt, AVANT le geste. Même validation que `playCard`, moins la cible et
 * le Cimetière, qui se désignent après.
 */
describe("playCardRefusal", () => {
  it("rien à redire : la carte se joue", () => {
    const card = instance("murene-aveugle", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [card] }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", card.instanceId)).toBeNull();
  });

  it("une carte à cible n'est pas refusée faute de cible désignée", () => {
    const harpoon = instance("harpon-de-pont", "p1");
    const porteur = instance("murene-aveugle", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [harpoon], board: [porteur] }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", harpoon.instanceId)).toBeNull();
  });

  it("un Équipement sans porteur possible est refusé", () => {
    const harpoon = instance("harpon-de-pont", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [harpoon] }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", harpoon.instanceId)).toMatch(/Équipement/);
  });

  it("hors de l'état de Marée requis : le motif du moteur", () => {
    const card = instance("la-chose-qui-remonte", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [card] }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", card.instanceId)).toMatch(/Marée/);
  });

  it("plateau plein : refusée", () => {
    const card = instance("murene-aveugle", "p1");
    const board = Array.from({ length: 6 }, () => instance("murene-aveugle", "p1"));
    const state = testGameState({ players: [testPlayer("p1", { hand: [card], board }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", card.instanceId)).not.toBeNull();
  });

  it("hors de son tour : refusée", () => {
    const card = instance("murene-aveugle", "p1");
    const state = testGameState({ activePlayerId: "p2", players: [testPlayer("p1", { hand: [card] }), testPlayer("p2")] });
    expect(playCardRefusal(state, "p1", card.instanceId)).not.toBeNull();
  });
});
