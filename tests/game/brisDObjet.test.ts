import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Le déclencheur « vous Brisez un Objet » (`onObjectBroken`).
 *
 * L'événement vise l'Objet brisé, qui a DÉJÀ quitté le plateau quand il
 * part : seules les capacités d'OBSERVATEUR (`triggeredBy`) le voient. Ces
 * tests jouent le geste par `dispatch` et vérifient le gain observable —
 * deux cartes avaient silencieusement cessé de fonctionner faute de ce
 * filtre, et une troisième se désamorçait toute seule.
 */

function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`action refusée : ${(result as { error?: string }).error}`);
}

describe("Pantalone Sans-Sou — une fois par tour, lorsque vous Brisez un Objet", () => {
  it("rembourse 1 Raison quand un Objet joué est Brisé", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const enMain = instance("pansements-de-coque", "p1"); // coût 2
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone], hand: [enMain], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId });
    ok(result);
    // 5 - 2 (coût) + 1 (Pantalone).
    expect(result.state.players[0].reason).toBe(4);
  });

  it("ne rembourse qu'une seule fois par tour", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const premier = instance("pansements-de-coque", "p1");
    const second = instance("pansements-de-coque", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone], hand: [premier, second], reason: 5 }), testPlayer("p2")],
    });

    const un = dispatch(state, { type: "playCard", playerId: "p1", instanceId: premier.instanceId });
    ok(un);
    const deux = dispatch(un.state, { type: "playCard", playerId: "p1", instanceId: second.instanceId });
    ok(deux);
    // 5 - 2 + 1 - 2 = 2 : le second Bris ne rembourse plus.
    expect(deux.state.players[0].reason).toBe(2);
  });

  it("un Objet annulé (Sabotage Discret) n'est pas Brisé : rien à rembourser", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const enMain = instance("pansements-de-coque", "p1");
    const sabotage = instance("sabotage-discret", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone], hand: [enMain], reason: 5 }), testPlayer("p2", { hand: [sabotage], reason: 10 })],
    });

    const joue = dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId });
    ok(joue);
    let s = joue.state;
    // Le joueur actif passe d'abord, puis l'adversaire répond.
    while (s.pendingReaction && s.pendingReaction.awaitingPlayerId === "p1") {
      const passe = dispatch(s, { type: "passReaction", playerId: "p1" });
      ok(passe);
      s = passe.state;
    }
    const annule = dispatch(s, { type: "activateReaction", playerId: "p2", sourceInstanceId: sabotage.instanceId, abilityIndex: 0 });
    ok(annule);
    expect(annule.state.players[0].reason).toBe(3);
    expect(annule.events.some((e) => e.type === "OBJECT_BROKEN" && e.instanceId === enMain.instanceId)).toBe(false);
  });
});

describe("Cra-Poiscail Médecin — 1 Ancrage au premier Bris du tour", () => {
  for (const cardId of ["cra-poiscail-medecin", "cra-poiscail-medecin-abyssal"] as const) {
    it(`${cardId} : récupère bien son Ancrage`, () => {
      const medecin = instance(cardId, "p1");
      const objet = instance("pansements-de-coque", "p1");
      const state = testGameState({
        players: [
          testPlayer("p1", { board: [medecin], hand: [objet], anchor: 10, deck: [instance("chope", "p1")] }),
          testPlayer("p2"),
        ],
      });

      const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: objet.instanceId });
      ok(result);
      // +1 par le Médecin, +1 par les Pansements de Coque brisés.
      expect(result.state.players[0].anchor).toBe(12);
    });
  }
});

