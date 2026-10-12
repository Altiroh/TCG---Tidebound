import { describe, expect, it } from "vitest";
import { dispatch, guardsBlockingAttack, type GameState } from "@/game";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

// La Garde se montre quand on attaque À CÔTÉ d'elle (décision du 12/10/2026) :
// l'interface demande au moteur QUI s'interpose, au lieu d'afficher un refus.
describe("guardsBlockingAttack — qui s'interpose devant une attaque", () => {
  const attaquant = instance("marin-des-jetees", "p1");
  const garde = instance("mouette-du-brise-lames", "p2");
  const autre = instance("marin-des-jetees", "p2");

  function table(defenders = [garde, autre]): GameState {
    return testGameState({ players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { board: defenders })] });
  }

  it("attaquer le Navire adverse quand une Garde est en jeu : la Garde s'interpose", () => {
    expect(guardsBlockingAttack(table(), "p1", attaquant.instanceId)).toEqual([garde.instanceId]);
  });

  it("attaquer une autre unité que la Garde : la Garde s'interpose aussi", () => {
    expect(guardsBlockingAttack(table(), "p1", attaquant.instanceId, autre.instanceId)).toEqual([garde.instanceId]);
  });

  it("attaquer la Garde elle-même : rien ne s'interpose", () => {
    expect(guardsBlockingAttack(table(), "p1", attaquant.instanceId, garde.instanceId)).toEqual([]);
  });

  it("sans Garde en face : rien ne s'interpose", () => {
    expect(guardsBlockingAttack(table([autre]), "p1", attaquant.instanceId)).toEqual([]);
  });

  it("dit la même chose que le moteur : refusé exactement quand une Garde s'interpose", () => {
    const state = { ...table(), phase: "combatPhase" as const, activePlayerId: "p1", turnNumber: 3 };
    for (const defenderInstanceId of [undefined, autre.instanceId, garde.instanceId]) {
      const blocked = guardsBlockingAttack(state, "p1", attaquant.instanceId, defenderInstanceId).length > 0;
      const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId });
      if (blocked) expect(result.ok ? "" : result.error).toMatch(/Garde/);
      else if (!result.ok) expect(result.error).not.toMatch(/Garde/);
    }
  });
});
