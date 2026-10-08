import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getPlayer, type GameState, type PlayerId } from "@/game/state/types";
import { answerHandDiscard, instance, testGameState, testPlayer, enFinDeTour } from "./testHelpers";

/**
 * La Veillée au Standard Verrier (01/10/2026) : ses gains de Puissance
 * RESTENT. Chaque test joue l'action par `dispatch`, puis passe le tour pour
 * vérifier que le gain survit à la fin du tour.
 */

const pioche = (n: number, o: string) => Array.from({ length: n }, () => instance("tetard-fesse", o));
const puissance = (state: GameState, owner: PlayerId, id: string) =>
  getPlayer(state, owner).board.find((u) => u.instanceId === id)!.modifiers.reduce((sum, m) => sum + m.attack, 0);
function finDeTour(state: GameState): GameState {
  const fin = dispatch(enFinDeTour(state), { type: "endTurn", playerId: state.activePlayerId });
  if (!fin.ok) throw new Error(fin.error);
  return fin.state;
}

describe("Veillée — des gains qui restent", () => {
  it("Cache-Cache : une défausse lui donne +1 Puissance, encore là au tour suivant", () => {
    const cacheCache = instance("cache-cache", "p1");
    const mousse = instance("mousse-des-quarts", "p1"); // « piochez 1 carte puis défaussez 1 carte »
    const aDefausser = instance("marin-des-jetees", "p1");
    const state = testGameState({
      phase: "mainPhase",
      players: [
        testPlayer("p1", { hand: [mousse, aDefausser], board: [cacheCache], deck: pioche(10, "p1"), reason: 10 }),
        testPlayer("p2", { shipId: "le-goliath", deck: pioche(10, "p2") }),
      ],
    });
    const joue = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
    if (!joue.ok) throw new Error(joue.error);
    const defausse = answerHandDiscard(joue.state, [aDefausser.instanceId]);
    if (!defausse.ok) throw new Error(defausse.error);
    expect(puissance(defausse.state, "p1", cacheCache.instanceId)).toBe(1);
    expect(puissance(finDeTour(defausse.state), "p1", cacheCache.instanceId)).toBe(1);
  });

  it("Papa est en mer : un autre Un Dead détruit, +1 Puissance conservée", () => {
    const papa = instance("papa-est-en-mer", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    const state = testGameState({
      phase: "mainPhase",
      players: [
        testPlayer("p1", { board: [papa, ptitBout], deck: pioche(10, "p1") }),
        testPlayer("p2", { shipId: "le-goliath", deck: pioche(10, "p2") }),
      ],
    });
    // « est DÉTRUITE » : un Sabordage n'en est pas une, Papa ne bouge pas.
    const sabordage = dispatch(state, { type: "saborder", playerId: "p1", instanceId: ptitBout.instanceId });
    if (!sabordage.ok) throw new Error(sabordage.error);
    expect(puissance(sabordage.state, "p1", papa.instanceId)).toBe(0);

    // Une vraie destruction (par un effet) : +1 Puissance, conservée.
    const condamne = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, board: p.board.map((u) => (u.instanceId === ptitBout.instanceId ? { ...u, pendingRemoval: "destroyed" as const } : u)) } : p
      ) as typeof state.players,
    };
    const detruit = dispatch(condamne, { type: "advancePhase", playerId: "p1" });
    if (!detruit.ok) throw new Error(detruit.error);
    expect(puissance(detruit.state, "p1", papa.instanceId)).toBe(1);
    expect(puissance(finDeTour(detruit.state), "p1", papa.instanceId)).toBe(1);
  });

  it("Encore cinq minutes : elle tient au combat et gagne +1 Puissance, conservée", () => {
    const encore = instance("encore-cinq-minutes", "p2"); // 2 / 3
    const brute = instance("la-chose-qui-remonte", "p1"); // 5 Puissance : coup mortel
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p1",
      players: [
        testPlayer("p1", { board: [brute], deck: pioche(10, "p1") }),
        testPlayer("p2", { shipId: "le-goliath", board: [encore], deck: pioche(10, "p2") }),
      ],
    });
    const attaque = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId, defenderInstanceId: encore.instanceId });
    if (!attaque.ok) throw new Error(attaque.error);
    const survivante = getPlayer(attaque.state, "p2").board.find((u) => u.instanceId === encore.instanceId);
    expect(survivante).toBeDefined();
    expect(puissance(attaque.state, "p2", encore.instanceId)).toBe(1);
    expect(puissance(finDeTour(attaque.state), "p2", encore.instanceId)).toBe(1);
  });
});
