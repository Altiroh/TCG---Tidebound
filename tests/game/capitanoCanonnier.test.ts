import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

const stats = (state: GameState, id: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === id))!;
  const unit = owner.board.find((u) => u.instanceId === id)!;
  return computeEffectiveStats(unit, state.environment.tideState, auraContextOf(state, owner.id));
};

/**
 * Retour de joueur (27/10/2026) : le Capitano blessé par le tir d'arrivée du
 * Canonnier Fêlé gardait 6/6. Les dégâts d'EFFET ne déclenchaient pas
 * « subit des dégâts » (`processDamagedTriggers`).
 */
describe("Il Capitano Naufragé, blessé par le tir d'arrivée du Canonnier Fêlé", () => {
  it("perd 3 Puissance et 2 Résistance à sa première blessure", () => {
    const canonnier = instance("canonnier-fele", "p1");
    const capitano = instance("il-capitano-naufrage", "p2");
    const state = testGameState({
      phase: "mainPhase",
      players: [testPlayer("p1", { hand: [canonnier], reason: 10 }), testPlayer("p2", { board: [capitano] })],
    });
    const posé = dispatch(state, { type: "playCard", playerId: "p1", instanceId: canonnier.instanceId });
    if (!posé.ok) throw new Error(posé.error);
    const entry = (posé.state.deferredArrivals ?? []).find((e) => e.sourceInstanceId === canonnier.instanceId);
    expect(entry).toBeDefined();
    const tir = dispatch(posé.state, {
      type: "activateArrival",
      playerId: "p1",
      sourceInstanceId: canonnier.instanceId,
      abilityIndex: entry!.abilityIndex,
      targetInstanceId: capitano.instanceId,
    });
    if (!tir.ok) throw new Error(tir.error);
    let after = tir.state;
    // Une fenêtre éventuelle (son propre déclencheur) se résout d'elle-même : rien à choisir.
    if (after.pendingReaction) {
      const pass = dispatch(after, { type: "passReaction", playerId: after.priorityPlayerId });
      if (pass.ok) after = pass.state;
    }
    const unit = after.players[1].board.find((u) => u.instanceId === capitano.instanceId)!;
    expect(unit.damageMarked).toBe(1);
    expect(stats(after, capitano.instanceId).attack).toBe(3);
    expect(stats(after, capitano.instanceId).health).toBe(4);
  });
});

describe("Il Capitano Naufragé, blessé par un Objet", () => {
  it("perd aussi 3 Puissance et 2 Résistance, une seule fois", () => {
    const eclat = instance("eclat-de-bouteille", "p1");
    const eclat2 = instance("eclat-de-bouteille", "p1");
    const capitano = instance("il-capitano-naufrage", "p2");
    const state = testGameState({ phase: "mainPhase", players: [testPlayer("p1", { hand: [eclat, eclat2], reason: 10 }), testPlayer("p2", { board: [capitano] })] });
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: eclat.instanceId, targetInstanceId: capitano.instanceId });
    if (!r.ok) throw new Error(r.error);
    expect(stats(r.state, capitano.instanceId)).toMatchObject({ attack: 3, health: 4 });
    const r2 = dispatch(r.state, { type: "playCard", playerId: "p1", instanceId: eclat2.instanceId, targetInstanceId: capitano.instanceId });
    if (!r2.ok) throw new Error(r2.error);
    expect(stats(r2.state, capitano.instanceId)).toMatchObject({ attack: 3, health: 4 });
  });
});
