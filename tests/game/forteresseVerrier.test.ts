import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getPlayer, type GameState } from "@/game/state/types";
import type { CardInstance } from "@/game/cards/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * La Forteresse au Standard Verrier (30/09/2026) : « encaisser → grandir →
 * frapper ». Les murs qui tiennent deviennent des armes (Mouette du
 * Brise-Lames, Carcasse Renversée), et Le Dernier Rempart renvoie les coups.
 * Chaque test joue une vraie attaque par `dispatch`.
 */

/** p1 attaque avec `attaquant` l'unité `cible` de p2. */
function attaque(attaquant: CardInstance, cible: CardInstance, p2Board: CardInstance[], tide: "calme" | "houle" = "houle") {
  const state: GameState = testGameState({
    phase: "combatPhase",
    activePlayerId: "p1",
    environment: testEnvironment({ tideState: tide }),
    players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { shipId: "le-goliath", board: p2Board })],
  });
  const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: cible.instanceId });
  if (!result.ok) throw new Error(result.error);
  return { avant: state, apres: result.state };
}
const puissanceGagnee = (state: GameState, id: string) =>
  getPlayer(state, "p2").board.find((u) => u.instanceId === id)!.modifiers.reduce((sum, m) => sum + m.attack, 0);

describe("Forteresse — encaisser, grandir, frapper", () => {
  it("Mouette du Brise-Lames : elle survit au coup et gagne +1 Puissance, conservée", () => {
    const mouette = instance("mouette-du-brise-lames", "p2"); // 1 / 4, Garde
    const { apres } = attaque(instance("tetard-fesse", "p1"), mouette, [mouette]);
    expect(getPlayer(apres, "p2").board.find((u) => u.instanceId === mouette.instanceId)!.damageMarked).toBeGreaterThan(0);
    expect(puissanceGagnee(apres, mouette.instanceId)).toBe(1);
  });

  it("Carcasse Renversée visible : l'unité qui tient derrière elle grandit", () => {
    const carcasse = instance("carcasse-renversee", "p2");
    const mur = instance("crabe-de-fer", "p2"); // 2 / 5
    const { apres } = attaque(instance("tetard-fesse", "p1"), mur, [carcasse, mur], "houle");
    expect(puissanceGagnee(apres, mur.instanceId)).toBe(1);
  });

  it("Carcasse Renversée masquée (Calme) : rien", () => {
    const carcasse = instance("carcasse-renversee", "p2");
    const mur = instance("crabe-de-fer", "p2");
    const { apres } = attaque(instance("tetard-fesse", "p1"), mur, [carcasse, mur], "calme");
    expect(puissanceGagnee(apres, mur.instanceId)).toBe(0);
  });

  it("Le Dernier Rempart tient le choc et renvoie 2 dégâts au Navire adverse", () => {
    const rempart = instance("le-dernier-rempart", "p2"); // 4 / 8, Garde
    const { avant, apres } = attaque(instance("tetard-fesse", "p1"), rempart, [rempart]);
    expect(getPlayer(apres, "p1").anchor).toBe(getPlayer(avant, "p1").anchor - 2);
  });

  it("une unité qui meurt ne « survit » pas : rien ne se déclenche", () => {
    const mouette = instance("mouette-du-brise-lames", "p2", { damageMarked: 3 }); // 1 Résistance restante
    const { apres } = attaque(instance("crabe-de-fer", "p1"), mouette, [mouette]);
    expect(getPlayer(apres, "p2").board.some((u) => u.instanceId === mouette.instanceId)).toBe(false);
  });
});
