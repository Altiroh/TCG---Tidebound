import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { deriveEffectVolley, patchedDisplay, SHOT_FLIGHT_MS, TOUCH_LAND_MS, volleyLandingMs } from "@/features/match/effectPresentation";
import type { GameState } from "@/game";
import { instance, testEnvironment, testGameState, testPlayer } from "../game/testHelpers";

/**
 * Effets SANS DÉGÂTS (13/10/2026) — détruire, poser un état, renvoyer : le
 * moteur dit qui les lance (`origin`, posé par `resolveEffect`), et la mise
 * en scène relie le lanceur à sa cible comme pour des dégâts. Avant, la
 * cible de L'Amiral sans Pavillon disparaissait sans que rien ne la touche.
 */
function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

const onBoard = (state: GameState, id: string) => state.players.some((p) => p.board.some((u) => u.instanceId === id));

describe("L'Amiral sans Pavillon détruit sa cible sous les yeux du joueur", () => {
  const amiral = instance("lamiral-sans-pavillon", "p1");
  const cible = instance("matelot-du-sans-nom", "p2");
  const posee = testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { shipId: "le-brise-lames", reason: 10, reasonMax: 10, hand: [amiral] }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, board: [cible, instance("matelot-du-sans-nom", "p2")] }),
    ],
  });

  it("la destruction porte son lanceur, et l'Amiral lance son sort pour la toucher", () => {
    const pose = dispatch(posee, { type: "playCard", playerId: "p1", instanceId: amiral.instanceId });
    ok(pose);
    const effet = dispatch(pose.state, { type: "activateArrival", playerId: "p1", sourceInstanceId: amiral.instanceId, abilityIndex: 0, targetInstanceId: cible.instanceId });
    ok(effet);
    expect(onBoard(effet.state, cible.instanceId)).toBe(false);

    const destroy = effet.events.find((e) => e.type === "DESTROY");
    expect(destroy).toMatchObject({ instanceId: cible.instanceId, origin: { playerId: "p1", instanceId: amiral.instanceId } });

    const volley = deriveEffectVolley(effet.events, pose.state, effet.state, 1)!;
    expect(volley.touches).toEqual([
      {
        to: { kind: "unit", id: cible.instanceId },
        source: { from: { kind: "unit", id: amiral.instanceId }, originPlayerId: "p1" },
        kind: "destroy",
        tone: "attack",
      },
    ]);
    expect(volley.awakens).toContain(amiral.instanceId);
    expect(volley.awakenTones?.[amiral.instanceId]).toBe("attack");
    expect(volleyLandingMs(volley)).toBe(volley.delayMs + volley.castMs + SHOT_FLIGHT_MS + TOUCH_LAND_MS);
    // La cible reste à sa place jusqu'à ce que l'effet la touche.
    expect(onBoard(patchedDisplay(pose.state, effet.state, volley), cible.instanceId)).toBe(true);
  });
});

describe("Guetteur Méfiant : son effet activé se met en scène", () => {
  it("les dégâts partent du Guetteur, en sort (orbe bleue)", () => {
    const guetteur = instance("guetteur-mefiant", "p2");
    const posee = instance("matelot-du-sans-nom", "p1");
    const cible = instance("matelot-du-sans-nom", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "calme" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", reason: 10, reasonMax: 10, hand: [posee], board: [cible] }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, board: [guetteur] }),
      ],
    });
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: posee.instanceId });
    ok(pose);
    expect(pose.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    const tir = dispatch(pose.state, { type: "activateReaction", playerId: "p2", sourceInstanceId: guetteur.instanceId, abilityIndex: 0, targetInstanceId: cible.instanceId });
    ok(tir);
    const volley = deriveEffectVolley(tir.events, pose.state, tir.state, 1)!;
    expect(volley.awakens).toEqual([guetteur.instanceId]);
    expect(volley.awakenTones).toEqual({ [guetteur.instanceId]: "attack" });
    expect(volley.shots).toMatchObject([{ to: { kind: "unit", id: cible.instanceId }, look: "magic", amount: 2 }]);
  });
});

describe("ce qui ne laisse pas de chiffre se voit quand même", () => {
  const lanceur = instance("poisson-lanterne", "p1");
  const cible = instance("murene-aveugle", "p2");
  const before = testGameState({ players: [testPlayer("p1", { board: [lanceur] }), testPlayer("p2", { board: [cible] })] });
  const base = { turnNumber: 3, timestamp: 0 };
  const origin = { playerId: "p1", instanceId: lanceur.instanceId };

  it("un malus qui TUE sa cible la touche avant qu'elle ne parte", () => {
    const after = testGameState({ players: [testPlayer("p1", { board: [lanceur] }), testPlayer("p2", { board: [] })] });
    const volley = deriveEffectVolley(
      [{ ...base, type: "DEBUFF_APPLIED", targetInstanceId: cible.instanceId, attack: -2, health: -2, origin }, { ...base, type: "DESTROY", instanceId: cible.instanceId, reason: "lethal" }],
      before,
      after,
      1
    )!;
    expect(volley.touches).toMatchObject([{ to: { kind: "unit", id: cible.instanceId }, kind: "destroy", tone: "malus" }]);
    expect(onBoard(patchedDisplay(before, after, volley), cible.instanceId)).toBe(true);
  });

  it("une perte sans chiffre (un mot-clé, un texte ignoré) touche sa cible", () => {
    const volley = deriveEffectVolley([{ ...base, type: "DEBUFF_APPLIED", targetInstanceId: cible.instanceId, attack: 0, health: 0, origin }], before, before, 1)!;
    expect(volley.touches).toMatchObject([{ to: { kind: "unit", id: cible.instanceId }, kind: "status", tone: "malus" }]);
  });

  it("une Armure gagnée part en sort vers le Navire, et ne s'affiche qu'à l'arrivée", () => {
    const after = { ...before, players: before.players.map((p) => (p.id === "p1" ? { ...p, armor: 3 } : p)) as GameState["players"] };
    const volley = deriveEffectVolley([{ ...base, type: "ARMOR_CHANGED", playerId: "p1", delta: 3, armorAfter: 3, origin }], before, after, 1)!;
    expect(volley.touches).toMatchObject([{ to: { kind: "ship", id: "p1" }, kind: "armor", tone: "heal", amount: 3 }]);
    expect(patchedDisplay(before, after, volley).players[0].armor).toBe(before.players[0].armor);
  });
});
