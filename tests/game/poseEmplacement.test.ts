import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Où la carte se pose dans le rang (`PlayCardAction.boardIndex`).
 *
 * Le rang était une pile : toute carte jouée s'ajoutait au bout, et le
 * joueur ne pouvait rien y faire — « on ne peut pas choisir le placement de
 * la carte dans notre board » (retour de test du 20/09/2026). Il reste
 * DENSE — aucun trou entre deux cartes — donc choisir l'emplacement, c'est
 * choisir l'ORDRE.
 */

function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`action refusée : ${(result as { error?: string }).error}`);
}

const nameAt = (board: { cardId: string }[]) => board.map((u) => u.cardId);

describe("pose : emplacement dans le rang", () => {
  it("insère la carte à l'emplacement demandé et pousse les suivantes", () => {
    const gauche = instance("murene-aveugle", "p1");
    const droite = instance("raie-des-fosses", "p1");
    const enMain = instance("tetard-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [gauche, droite], hand: [enMain] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId, boardIndex: 1 });
    ok(result);
    expect(nameAt(result.state.players[0].board)).toEqual(["murene-aveugle", "tetard-fesse", "raie-des-fosses"]);
  });

  it("sans emplacement demandé, se range en fin de rang — comme avant", () => {
    const gauche = instance("murene-aveugle", "p1");
    const enMain = instance("tetard-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [gauche], hand: [enMain] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId });
    ok(result);
    expect(nameAt(result.state.players[0].board)).toEqual(["murene-aveugle", "tetard-fesse"]);
  });

  it("un emplacement hors du rang est ramené dedans", () => {
    const gauche = instance("murene-aveugle", "p1");
    const enMain = instance("tetard-fesse", "p1");
    const enMainBis = instance("ptite-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [gauche], hand: [enMain, enMainBis] }), testPlayer("p2")],
    });

    // Viser la case 4 d'un rang qui n'en occupe qu'une : la carte se range
    // en seconde position, pas en cinquième — le rang n'a pas de trou.
    const loin = dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId, boardIndex: 4 });
    ok(loin);
    expect(nameAt(loin.state.players[0].board)).toEqual(["murene-aveugle", "tetard-fesse"]);

    const negatif = dispatch(loin.state, { type: "playCard", playerId: "p1", instanceId: enMainBis.instanceId, boardIndex: -3 });
    ok(negatif);
    expect(nameAt(negatif.state.players[0].board)).toEqual(["ptite-fesse", "murene-aveugle", "tetard-fesse"]);
  });

  it("un Équipement se range de lui-même juste après le permanent qu'il équipe", () => {
    const porteur = instance("murene-aveugle", "p1");
    const autre = instance("raie-des-fosses", "p1");
    const harpon = instance("harpon-de-pont", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, autre], hand: [harpon] }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: harpon.instanceId,
      targetInstanceId: porteur.instanceId,
    });
    ok(result);
    // Sans ça, le trait qui relie l'Équipement à son porteur traversait le
    // rang entier pour rejoindre une carte posée à l'autre bout.
    expect(nameAt(result.state.players[0].board)).toEqual(["murene-aveugle", "harpon-de-pont", "raie-des-fosses"]);
  });
});
