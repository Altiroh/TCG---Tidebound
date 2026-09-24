import { describe, expect, it } from "vitest";
import {
  ARRIVAL_DELAY_MS,
  BUFF_LAND_MS,
  deriveEffectVolley,
  patchedDisplay,
  SHOT_FLIGHT_MS,
  volleyLandingMs,
} from "@/features/match/effectPresentation";
import { instance, testGameState, testPlayer } from "../game/testHelpers";
import type { GameEvent, GameState } from "@/game";

/**
 * Mise en scène des effets : d'où part le projectile, et quel état le
 * plateau affiche tant qu'il n'a pas touché.
 */
const base = { turnNumber: 3, timestamp: 0 };

function state(p1Board: GameState["players"][0]["board"], p2Board: GameState["players"][1]["board"], anchors: [number, number] = [30, 30]) {
  return testGameState({
    players: [testPlayer("p1", { board: p1Board, anchor: anchors[0] }), testPlayer("p2", { board: p2Board, anchor: anchors[1] })],
  });
}

describe("d'où part le projectile", () => {
  const lanceur = instance("poisson-lanterne", "p1");
  const cible = instance("murene-aveugle", "p2");
  const before = state([lanceur], [cible]);

  it("de la carte en jeu qui porte l'effet", () => {
    const events: GameEvent[] = [
      { ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 1, cause: "effect", origin: { playerId: "p1", instanceId: lanceur.instanceId } },
    ];
    const volley = deriveEffectVolley(events, before, before, 1)!;
    expect(volley.shots).toEqual([
      { from: { kind: "unit", id: lanceur.instanceId }, originPlayerId: "p1", to: { kind: "unit", id: cible.instanceId }, amount: 1, look: "magic" },
    ]);
    expect(volley.delayMs).toBe(0);
  });

  it("du Navire pour un sort joué de la main, et toutes les cibles à la fois", () => {
    const events: GameEvent[] = [
      { ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 2, cause: "effect", origin: { playerId: "p1" } },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 2, origin: { playerId: "p1" } },
    ];
    const volley = deriveEffectVolley(events, before, before, 1)!;
    expect(volley.shots.map((shot) => shot.from)).toEqual([
      { kind: "ship", id: "p1" },
      { kind: "ship", id: "p1" },
    ]);
    expect(volley.shots.map((shot) => shot.to)).toEqual([
      { kind: "unit", id: cible.instanceId },
      { kind: "ship", id: "p2" },
    ]);
  });

  it("le tir du canon est un boulet", () => {
    const events: GameEvent[] = [
      { ...base, type: "SHIP_ABILITY_FIRED", playerId: "p1", shipId: "le-brise-lames", abilityName: "Canon" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, origin: { playerId: "p1" } },
    ];
    expect(deriveEffectVolley(events, before, before, 1)!.shots[0]!.look).toBe("cannon");
  });

  it("une carte tout juste posée tire une fois arrivée", () => {
    const pose = instance("poisson-lanterne", "p1");
    const after = state([lanceur, pose], [cible]);
    const events: GameEvent[] = [
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 1, origin: { playerId: "p1", instanceId: pose.instanceId } },
    ];
    const volley = deriveEffectVolley(events, before, after, 1)!;
    expect(volley.shots[0]!.from).toEqual({ kind: "unit", id: pose.instanceId });
    expect(volley.delayMs).toBe(ARRIVAL_DELAY_MS);
    expect(volleyLandingMs(volley)).toBe(ARRIVAL_DELAY_MS + SHOT_FLIGHT_MS);
  });

  it("les coups de combat et les dégâts sans lanceur ne tirent rien", () => {
    const events: GameEvent[] = [
      { ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 3, combat: "strike" },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 2 },
    ];
    expect(deriveEffectVolley(events, before, before, 1)).toBeNull();
  });
});

describe("soins et gains", () => {
  it("un gain devient une pastille, rangée avant que l'état réel ne s'affiche", () => {
    const unite = instance("poisson-lanterne", "p1");
    const s = state([unite], []);
    const events: GameEvent[] = [
      { ...base, type: "BUFF_APPLIED", targetInstanceId: unite.instanceId, attack: 1, health: 0, keywords: ["garde"] },
      { ...base, type: "HEAL", targetPlayerId: "p1", amount: 2 },
    ];
    const volley = deriveEffectVolley(events, s, s, 1)!;
    expect(volley.buffs).toEqual([{ targetInstanceId: unite.instanceId, attack: 1, health: 0, keywords: ["garde"], loss: false }]);
    expect(volley.heals).toEqual([{ to: { kind: "ship", id: "p1" }, amount: 2 }]);
    expect(volleyLandingMs(volley)).toBe(BUFF_LAND_MS);
  });
});

describe("état affiché pendant la volée", () => {
  it("la cible tuée par l'effet reste en jeu, intacte, jusqu'à l'impact", () => {
    const lanceur = instance("poisson-lanterne", "p1");
    const voisine = instance("poisson-lanterne", "p2");
    const cible = instance("murene-aveugle", "p2");
    const before = state([lanceur], [cible, voisine], [30, 30]);
    const morte = { ...cible, damageMarked: 5 };
    const after: GameState = {
      ...state([lanceur], [voisine], [30, 27]),
      eventLog: [{ ...base, type: "DESTROY", instanceId: cible.instanceId, reason: "effect" }],
    };
    after.players[1].graveyard = [morte];

    const events: GameEvent[] = [
      { ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 5, cause: "effect", origin: { playerId: "p1" } },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, origin: { playerId: "p1" } },
    ];
    const volley = deriveEffectVolley(events, before, after, 1)!;
    const shown = patchedDisplay(before, after, volley);

    // Rendue à sa place d'avant, sans ses dégâts, et plus au Cimetière.
    expect(shown.players[1].board.map((card) => card.instanceId)).toEqual([cible.instanceId, voisine.instanceId]);
    expect(shown.players[1].board[0]!.damageMarked).toBe(0);
    expect(shown.players[1].graveyard).toEqual([]);
    // Le Navire touché garde son Ancrage d'avant ; le journal aussi attend l'impact.
    expect(shown.players[1].anchor).toBe(30);
    expect(shown.eventLog).toBe(before.eventLog);
  });
});
