import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Le Grand Banc au Standard Verrier (01/10/2026) : « le banc grossit ».
 * Les gains des déclencheurs sont CONSERVÉS — vérifiés après la fin du
 * tour —, et Têtard-Fesse relance une arrivée en mourant. Joué par `dispatch`.
 */

const pioche = (owner: string) => [instance("crabe-de-fer", owner), instance("crabe-de-fer", owner)];

function partie(board: ReturnType<typeof instance>[], hand: ReturnType<typeof instance>[] = []): GameState {
  return testGameState({
    phase: "mainPhase",
    players: [
      testPlayer("p1", { board, hand, reason: 10, deck: pioche("p1") }),
      testPlayer("p2", { shipId: "le-goliath", deck: pioche("p2") }),
    ],
  });
}

function joue(state: GameState, action: Parameters<typeof dispatch>[1]): GameState {
  const result = dispatch(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const bonus = (state: GameState, id: string) => {
  const unite = getPlayer(state, "p1").board.find((u) => u.instanceId === id)!;
  return {
    puissance: unite.modifiers.reduce((sum, m) => sum + m.attack, 0),
    resistance: unite.modifiers.reduce((sum, m) => sum + m.health, 0),
  };
};

const finDuTour = (state: GameState) => joue(state, { type: "endTurn", playerId: "p1" });

describe("Grand Banc — le banc grossit", () => {
  it("Chef de Banc : l'arrivante gagne +1 / +1, conservé après la fin du tour", () => {
    const fesse = instance("ptite-fesse", "p1");
    const state = joue(partie([instance("cra-poiscail-chef-de-banc", "p1")], [fesse]), {
      type: "playCard",
      playerId: "p1",
      instanceId: fesse.instanceId,
    });
    expect(bonus(finDuTour(state), fesse.instanceId)).toEqual({ puissance: 1, resistance: 1 });
  });

  it("P'tite Fesse, Grand Rêve : un autre Cra-Poiscail gagne de la Puissance → +1 Puissance, conservée", () => {
    const reve = instance("ptite-fesse-grand-reve", "p1");
    const fesse = instance("ptite-fesse", "p1");
    const state = joue(partie([instance("cra-poiscail-chef-de-banc", "p1"), reve], [fesse]), {
      type: "playCard",
      playerId: "p1",
      instanceId: fesse.instanceId,
    });
    expect(bonus(finDuTour(state), reve.instanceId).puissance).toBe(1);
  });

  it("Cra-Poiscail Ramasseur : vous Brisez un Objet → +1 / +1, conservé", () => {
    const ramasseur = instance("cra-poiscail-ramasseur", "p1");
    const seau = instance("le-seau", "p1");
    const state = joue(partie([ramasseur, seau]), { type: "breakObject", playerId: "p1", instanceId: seau.instanceId });
    expect(bonus(finDuTour(state), ramasseur.instanceId)).toEqual({ puissance: 1, resistance: 1 });
  });

  it("Têtard-Fesse : quand il est détruit, un Péon Cra-Poiscail le remplace", () => {
    const tetard = instance("tetard-fesse", "p2");
    const requin = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [requin], deck: pioche("p1") }),
        testPlayer("p2", { board: [tetard], anchor: 20, deck: pioche("p2") }),
      ],
    });
    const apres = joue(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: requin.instanceId,
      defenderInstanceId: tetard.instanceId,
    });
    const banc = getPlayer(apres, "p2");
    expect(banc.graveyard.some((c) => c.instanceId === tetard.instanceId)).toBe(true);
    expect(banc.board.filter((u) => u.cardId === "peon-cra-poiscail")).toHaveLength(1);
  });
});
