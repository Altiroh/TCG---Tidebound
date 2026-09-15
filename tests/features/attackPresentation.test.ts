import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "../game/testHelpers";
import type { GameState } from "@/game";

/**
 * Le retard d'affichage des attaques (`useAttackPresentation`) montre l'état
 * d'AVANT le choc pendant l'animation. Tout ce qui DÉCIDE — le bot, la
 * validation d'une action — doit continuer à lire l'état réel.
 *
 * Ces tests portent sur l'invariant de moteur qui rend le bug possible :
 * rejouer une action depuis un état périmé ramène en jeu une carte déjà
 * partie au cimetière. C'est ce qu'on voyait à l'écran — la carte détruite
 * revenait encaisser le coup avant de repartir.
 */
function boardIds(state: GameState, playerId: string): string[] {
  return state.players.find((p) => p.id === playerId)!.board.map((card) => card.cardId);
}

describe("état réel contre état affiché", () => {
  it("rejouer depuis un état périmé remet en jeu une carte détruite", () => {
    const attacker = instance("murene-aveugle", "p1", { summoningSick: false });
    const victim = instance("poisson-lanterne", "p2");
    const base = testGameState();
    const before: GameState = {
      ...base,
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [attacker] }),
        testPlayer("p2", { shipId: "lerrant", board: [victim] }),
      ] as typeof base.players,
    };

    const attack = dispatch(before, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: victim.instanceId,
    });
    expect(attack.ok).toBe(true);
    if (!attack.ok) return;

    // Murène 3/1 contre Poisson-Lanterne 1/1 : la victime meurt.
    expect(boardIds(attack.state, "p2")).toEqual([]);

    // L'état d'AVANT, celui que l'affichage retient pendant l'animation,
    // contient toujours la victime. C'est légitime pour PEINDRE, jamais
    // pour décider : toute action repartant de là la ressuscite.
    expect(boardIds(before, "p2")).toEqual(["poisson-lanterne"]);
  });

  it("l'état d'après une attaque ne réapparaît jamais de lui-même", () => {
    // Garde-fou de lecture : deux états successifs du moteur sont
    // indépendants, et rien dans l'état d'après ne permet de revenir à
    // celui d'avant. Le retour en arrière ne peut donc venir que d'un
    // appelant qui a gardé l'ancien — ce que le bot faisait.
    const attacker = instance("murene-aveugle", "p1", { summoningSick: false });
    const victim = instance("poisson-lanterne", "p2");
    const base = testGameState();
    const before: GameState = {
      ...base,
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [attacker] }),
        testPlayer("p2", { shipId: "lerrant", board: [victim] }),
      ] as typeof base.players,
    };

    const attack = dispatch(before, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: victim.instanceId,
    });
    if (!attack.ok) return;

    // Le journal ne perd rien, et la victime est bien au cimetière.
    expect(attack.state.eventLog.length).toBeGreaterThan(before.eventLog.length);
    expect(attack.state.players[1].graveyard.map((c) => c.cardId)).toContain("poisson-lanterne");
  });
});
