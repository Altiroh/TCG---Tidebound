import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, enFinDeTour, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * « Quand une Créature alliée meurt, récupérez 1 Ancrage » PENDANT LE TOUR
 * ADVERSE (retour du 19/10/2026) : chaque façon de mourir hors de son tour
 * déclenche bien l'effet de son contrôleur.
 */

const pret = (cardId: string, owner: string) => instance(cardId, owner, { summoningSick: false });
function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, overrides: Partial<GameState> = {}): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, anchor: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
    ...overrides,
  });
}
const ancrage = (state: GameState) => state.players.find((p) => p.id === "p1")!.anchor;
function attaqueAdverse(board: CardInstance[], cibleId: string, attaquant = pret("crabe-de-fer", "p2")): GameState {
  const r = dispatch(
    { ...table({ board }, { board: [attaquant] }, { activePlayerId: "p2" }), phase: "combatPhase" },
    { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId, defenderInstanceId: cibleId }
  );
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("à la mort d'une Créature alliée pendant le tour ADVERSE, l'Ancrage revient", () => {
  it("Nécrophage des Fonds : alliée tuée en défense", () => {
    const necro = instance("necrophage-des-fonds", "p1");
    const proie = instance("couveuse-difforme", "p1", { damageMarked: 3 });
    expect(ancrage(attaqueAdverse([necro, proie], proie.instanceId))).toBe(11);
  });

  it("Nécrophage des Fonds : une Larve jeton tuée", () => {
    const necro = instance("necrophage-des-fonds", "p1");
    const jeton = instance("larve", "p1");
    expect(ancrage(attaqueAdverse([necro, jeton], jeton.instanceId))).toBe(11);
  });

  it("Larve de Cale et Arlequin Raccommodeur : leur propre mort", () => {
    const larve = instance("larve-de-cale", "p1");
    expect(ancrage(attaqueAdverse([larve], larve.instanceId))).toBe(11);
    const arlequin = instance("arlequin-raccommodeur", "p1", { damageMarked: 2 });
    expect(ancrage(attaqueAdverse([arlequin], arlequin.instanceId))).toBe(11);
  });

  it("Nécrophage des Fonds : alliée tuée par la RÉACTION d'une Poisson-Bombe adverse", () => {
    const necro = instance("necrophage-des-fonds", "p1");
    const mur = instance("crabe-de-fer", "p1");
    const proie = instance("couveuse-difforme", "p1", { damageMarked: 2 });
    const bombe = pret("poisson-bombe", "p2");
    const r = dispatch(
      { ...table({ board: [necro, mur, proie] }, { board: [bombe] }, { activePlayerId: "p2" }), phase: "combatPhase" },
      { type: "attack", playerId: "p2", attackerInstanceId: bombe.instanceId, defenderInstanceId: mur.instanceId }
    );
    if (!r.ok) throw new Error(r.error);
    const apres = activateReactionFor(r.state, "poisson-bombe", proie.instanceId);
    if (!apres.ok) throw new Error(apres.error);
    expect(ancrage(apres.state)).toBe(11);
  });

  it("Nécrophage des Fonds : alliée Malade morte au DÉBUT du tour adverse (Houle)", () => {
    const necro = instance("necrophage-des-fonds", "p1");
    const malade = instance("couveuse-difforme", "p1", { damageMarked: 3, statuses: ["malade"] });
    const depart = { ...table({ board: [necro, malade] }), environment: testEnvironment({ tideState: "houle" }) };
    const r = dispatch(enFinDeTour(depart), { type: "endTurn", playerId: "p1" });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.activePlayerId).toBe("p2");
    expect(ancrage(r.state)).toBe(11);
  });
});
