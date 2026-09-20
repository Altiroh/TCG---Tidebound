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

describe("Pantalone Sans-Sou — premier Bris DEPUIS LA MAIN du tour", () => {
  it("rembourse 1 Raison au Bris depuis la main", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const enMain = instance("pansements-de-coque", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone], hand: [enMain], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: enMain.instanceId, fromHand: true });
    ok(result);
    // Le Bris depuis la main coûte 1 Raison, que Pantalone rembourse.
    expect(result.state.players[0].reason).toBe(5);
  });

  it("un Bris depuis le PLATEAU ne consomme pas son usage du tour", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const surLePlateau = instance("pansements-de-coque", "p1");
    const enMain = instance("pansements-de-coque", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone, surLePlateau], hand: [enMain], reason: 5 }), testPlayer("p2")],
    });

    const depuisLePlateau = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: surLePlateau.instanceId });
    ok(depuisLePlateau);
    expect(depuisLePlateau.state.players[0].reason).toBe(5);

    const depuisLaMain = dispatch(depuisLePlateau.state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: enMain.instanceId,
      fromHand: true,
    });
    ok(depuisLaMain);
    // Sans le filtre `fromHand` sur la capacité, le Bris depuis le plateau
    // brûlait le « une fois par tour » et celui-ci retombait à 4.
    expect(depuisLaMain.state.players[0].reason).toBe(5);
  });

  it("ne rembourse qu'une seule fois par tour", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const premier = instance("pansements-de-coque", "p1");
    const second = instance("pansements-de-coque", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pantalone], hand: [premier, second], reason: 5 }), testPlayer("p2")],
    });

    const un = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: premier.instanceId, fromHand: true });
    ok(un);
    const deux = dispatch(un.state, { type: "breakObject", playerId: "p1", instanceId: second.instanceId, fromHand: true });
    ok(deux);
    expect(deux.state.players[0].reason).toBe(4);
  });
});

describe("Cra-Poiscail Médecin — 1 Ancrage au premier Bris du tour", () => {
  for (const cardId of ["cra-poiscail-medecin", "cra-poiscail-medecin-abyssal"] as const) {
    it(`${cardId} : récupère bien son Ancrage`, () => {
      const medecin = instance(cardId, "p1");
      const objet = instance("pansements-de-coque", "p1");
      const state = testGameState({
        players: [
          testPlayer("p1", { board: [medecin, objet], anchor: 10, deck: [instance("chope", "p1")] }),
          testPlayer("p2"),
        ],
      });

      const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
      ok(result);
      // +1 par le Médecin, +1 par les Pansements de Coque brisés.
      expect(result.state.players[0].anchor).toBe(12);
    });
  }
});

