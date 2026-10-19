import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Sommeil de Pierre devient une Chaîne INSTANTANÉE (19/10/2026) : « Chaîne —
 * Une unité Opaline gagne +0/+2 jusqu'à votre prochain tour. Si elle est LV,
 * elle ne peut pas être renvoyée en main ce tour. » Elle se joue aussi en
 * réaction depuis la main, quand une unité attaque.
 */
const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));

describe("Sommeil de Pierre, Chaîne", () => {
  it("est une Chaîne instantanée", () => {
    const def = getCardDefinition("sommeil-de-pierre");
    expect(def.chaine).toBe(true);
    expect(def.chaineLibre).toBe(true);
    expect(def.text.startsWith("Chaîne — ")).toBe(true);
  });

  it("se joue depuis la main quand l'adversaire attaque : l'unité Opaline gagne +0/+2", () => {
    const sommeil = instance("sommeil-de-pierre", "p2");
    const opalin = instance("elyor-opalin-du-retour", "p2");
    const attaquant = instance("crabe-de-fer", "p1", { summoningSick: false });
    const state: GameState = testGameState({
      environment: testEnvironment({ tideState: "calme" }),
      phase: "combatPhase",
      players: [
        testPlayer("p1", { reason: 10, reasonMax: 10, board: [attaquant], deck: pioche("p1") }),
        testPlayer("p2", { reason: 10, reasonMax: 10, hand: [sommeil], board: [opalin], deck: pioche("p2") }),
      ],
    });
    const base = computeEffectiveStats(opalin, "calme", auraContextOf(state, "p2")).health;
    const attaque = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: opalin.instanceId });
    if (!attaque.ok) throw new Error(attaque.error);
    expect(pendingCandidates(attaque.state).some((c) => c.cardId === "sommeil-de-pierre")).toBe(true);
    const reponse = activateReactionFor(attaque.state, "sommeil-de-pierre", opalin.instanceId);
    if (!reponse.ok) throw new Error(reponse.error);
    const apres = reponse.state.players.find((p) => p.id === "p2")!.board.find((u) => u.instanceId === opalin.instanceId);
    expect(apres).toBeDefined();
    const sante = computeEffectiveStats(apres!, "calme", auraContextOf(reponse.state, "p2")).health - apres!.damageMarked;
    // +2 de Résistance absorbent une partie du coup.
    expect(sante).toBeGreaterThan(base - computeEffectiveStats(attaquant, "calme", auraContextOf(state, "p1")).attack);
  });
});
