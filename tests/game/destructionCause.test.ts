import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { destructionCauseOf } from "@/game/state/processDeaths";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * COMMENT une carte est détruite.
 *
 * Le moteur ne retenait que la ZONE et le geste (`graveyardCause` :
 * détruite / sabordée / défaussée / expirée). Plusieurs textes posent une
 * autre question — « qu'elle devrait être détruite AU COMBAT » (Encore cinq
 * minutes) — à laquelle une destruction par un effet ou par la Marée ne doit
 * pas répondre oui.
 *
 * La cause se déduit à la mort, de la dernière source de dégâts retenue sur
 * l'unité : une fois morte, il n'y a plus personne à interroger.
 */

function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(String((result as { error?: string }).error ?? "échec"));
}

describe("cause de destruction — déduction", () => {
  it("fait primer le Sabordage sur tout le reste", () => {
    // Un Sabordage est un coût consenti : même si l'unité traînait des
    // dégâts de combat, ce n'est pas le combat qui l'a emportée.
    const unit = instance("crabe-de-fer", "p1", { pendingRemoval: "scuttled", lastDamageCause: "combat" });
    expect(destructionCauseOf(unit, false)).toBe("scuttle");
  });

  it("impute à la Marée une destruction DIRECTE, pas au dernier coup reçu", () => {
    const unit = instance("crabe-de-fer", "p1", { lastDamageCause: "combat" });
    expect(destructionCauseOf(unit, true)).toBe("tide");
  });

  it("impute à l'effet une unité marquée par une destruction, même blessée au combat", () => {
    const unit = instance("crabe-de-fer", "p1", { pendingRemoval: "destroyed", lastDamageCause: "combat" });
    expect(destructionCauseOf(unit, false)).toBe("effect");
  });

  it("retombe sur la dernière source de dégâts, et sur « effet » quand il n'y en a aucune", () => {
    expect(destructionCauseOf(instance("crabe-de-fer", "p1", { lastDamageCause: "combat" }), false)).toBe("combat");
    expect(destructionCauseOf(instance("crabe-de-fer", "p1", { lastDamageCause: "tide" }), false)).toBe("tide");
    expect(destructionCauseOf(instance("crabe-de-fer", "p1"), false)).toBe("effect");
  });
});

describe("cause de destruction — en partie", () => {
  it("marque « combat » sur la carte tuée par une attaque, jusque dans le Cimetière", () => {
    // Requin Balafré 4/2 contre Têtard-Fesse 1/1 : le défenseur meurt du coup.
    const attaquant = instance("requin-balafre", "p1");
    const defenseur = instance("tetard-fesse", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { board: [defenseur], anchor: 20 })],
    });

    const attaque = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: defenseur.instanceId,
    });
    ok(attaque);

    const mort = attaque.state.players.find((p) => p.id === "p2")!.graveyard.find((c) => c.instanceId === defenseur.instanceId);
    expect(mort).toBeDefined();
    expect(mort!.destructionCause).toBe("combat");
    expect(mort!.graveyardCause).toBe("destroyed");
  });

  it("marque « scuttle » sur un Sabordage", () => {
    const unit = instance("crabe-de-fer", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [unit], reason: 10 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const saborde = dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId });
    ok(saborde);

    const mort = saborde.state.players.find((p) => p.id === "p1")!.graveyard.find((c) => c.instanceId === unit.instanceId)!;
    expect(mort.destructionCause).toBe("scuttle");
    expect(mort.graveyardCause).toBe("scuttled");
  });
});

describe("« détruite au combat » — Encore cinq minutes", () => {
  /** 2/3 : une attaque à 4 la tuerait, la survie la laisse à 1 Résistance. */
  function faceAUneAttaque() {
    const encore = instance("encore-cinq-minutes", "p2");
    const attaquant = instance("requin-balafre", "p1"); // 4/2
    return testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { board: [encore], anchor: 20 })],
    });
  }

  it("survit au combat, à 1 Résistance", () => {
    const state = faceAUneAttaque();
    const attaquant = state.players[0].board[0]!;
    const encore = state.players[1].board[0]!;

    const attaque = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: encore.instanceId,
    });
    ok(attaque);

    const survivante = attaque.state.players.find((p) => p.id === "p2")!.board.find((u) => u.instanceId === encore.instanceId);
    expect(survivante, "elle devait rester sur le plateau").toBeDefined();
    // « elle reste à 1 Résistance » : 3 de Résistance, 2 dégâts marqués.
    expect(survivante!.damageMarked).toBe(2);
  });

  it("ne survit PAS à une destruction par un effet", () => {
    // Levier de Lest saborde une Structure ; ici c'est le Sabordage direct
    // qui sert de destruction non-combat la plus courte.
    const encore = instance("encore-cinq-minutes", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [encore], reason: 10 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const saborde = dispatch(state, { type: "saborder", playerId: "p1", instanceId: encore.instanceId });
    ok(saborde);

    const p1 = saborde.state.players.find((p) => p.id === "p1")!;
    expect(p1.board.find((u) => u.instanceId === encore.instanceId)).toBeUndefined();
    expect(p1.graveyard.find((c) => c.instanceId === encore.instanceId)!.destructionCause).toBe("scuttle");
  });
});
