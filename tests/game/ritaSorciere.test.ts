import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game/cards/sets/core";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Rita, Sorcière sous contrat — « À l'arrivée : une unité adverse perd
 * -1/-1. Sur 5+ : -2/-2 à la place. Réussite critique : -3/-3 à la place. »
 * La cible n'existe que dans les branches de son jet : l'effet doit quand
 * même devenir une arrivée à activer, avec sa cible (retour du 19/10/2026 :
 * l'effet ne se résolvait pas).
 */
function table(p2Board: ReturnType<typeof instance>[] = []): { state: GameState; rita: ReturnType<typeof instance> } {
  const rita = instance("rita-sorciere-sous-contrat", "p1");
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  const state = testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, hand: [rita], deck: pioche("p1") }),
      testPlayer("p2", { reason: 10, reasonMax: 10, board: p2Board, deck: pioche("p2") }),
    ],
  });
  return { state, rita };
}

describe("Rita, Sorcière sous contrat", () => {
  it("son effet d'arrivée est une capacité à activer, ciblée — comme toute arrivée qui demande une décision", () => {
    const def = getCardDefinition("rita-sorciere-sous-contrat");
    expect(def.onPlayEffects ?? []).toHaveLength(0);
    expect(def.abilities?.some((ability) => ability.arrivalEffect && ability.mode === "optional")).toBe(true);
  });

  it("posée, elle luit ; activée sur une unité adverse, le jet tranche et l'unité perd au moins -1/-1", () => {
    const cible = instance("crabe-de-fer", "p2");
    const { state, rita } = table([cible]);
    const base = computeEffectiveStats(cible, "calme", auraContextOf(state, "p2"));
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: rita.instanceId });
    if (!pose.ok) throw new Error(pose.error);
    const entree = pose.state.deferredArrivals?.find((entry) => entry.sourceInstanceId === rita.instanceId);
    expect(entree).toBeDefined();
    let s = dispatch(pose.state, {
      type: "activateArrival",
      playerId: "p1",
      sourceInstanceId: rita.instanceId,
      abilityIndex: entree!.abilityIndex,
      targetInstanceId: cible.instanceId,
    });
    if (!s.ok) throw new Error(s.error);
    // Un jet en attente se ferme.
    for (let i = 0; i < 3 && s.ok && s.state.pendingChoice?.kind === "dieRoll"; i++) {
      s = dispatch(s.state, { type: "resolveChoice", playerId: "p1", choice: { dieResolve: true } });
    }
    if (!s.ok) throw new Error(s.error);
    const apres = s.state.players[1]!.board.find((u) => u.instanceId === cible.instanceId);
    if (apres) {
      const stats = computeEffectiveStats(apres, "calme", auraContextOf(s.state, "p2"));
      expect(base.attack - stats.attack).toBeGreaterThanOrEqual(1);
      expect(base.health - stats.health).toBeGreaterThanOrEqual(1);
    }
  });

  it("sans unité adverse, elle se pose quand même", () => {
    const { state, rita } = table();
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: rita.instanceId }).ok).toBe(true);
  });
});
