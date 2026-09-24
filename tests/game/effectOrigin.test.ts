import { describe, expect, it } from "vitest";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { EffectDefinition } from "@/game/effects/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * `DamageEvent.origin` dit à l'interface d'où part le projectile d'un effet :
 * de la carte qui l'a lancé, ou du Navire de son contrôleur quand l'effet
 * n'a pas de carte source (sort joué de la main, capacité de Navire).
 * `BuffAppliedEvent.keywords` dit quels mots-clés le modificateur accorde.
 */
function stateWith(): { state: GameState; lanceur: string; cible: string } {
  const lanceur = instance("poisson-lanterne", "p1");
  const cible = instance("poisson-lanterne", "p2");
  const base = testGameState();
  return {
    state: {
      ...base,
      players: [testPlayer("p1", { board: [lanceur] }), testPlayer("p2", { shipId: "le-goliath", board: [cible] })] as GameState["players"],
    },
    lanceur: lanceur.instanceId,
    cible: cible.instanceId,
  };
}

function damages(events: GameEvent[]) {
  return events.filter((event): event is Extract<GameEvent, { type: "DAMAGE" }> => event.type === "DAMAGE");
}

describe("lanceur d'un effet de dégâts", () => {
  const coupDeNavire: EffectDefinition = { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 } };
  const coupSurUnite: EffectDefinition = { type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 1 } };

  it("porte la carte source quand l'effet en a une", () => {
    const { state, lanceur, cible } = stateWith();
    const surNavire = damages(resolveEffect(state, coupDeNavire, { controllerId: "p1", sourceInstanceId: lanceur, turnNumber: 1 }).events);
    expect(surNavire).toHaveLength(1);
    expect(surNavire[0]!.origin).toEqual({ playerId: "p1", instanceId: lanceur });

    const surUnite = damages(
      resolveEffect(state, coupSurUnite, { controllerId: "p1", sourceInstanceId: lanceur, chosenTargetInstanceId: cible, turnNumber: 1 }).events
    );
    expect(surUnite).toHaveLength(1);
    expect(surUnite[0]!.origin).toEqual({ playerId: "p1", instanceId: lanceur });
  });

  it("ne porte que le contrôleur sans carte source (sort de main, Navire)", () => {
    const { state } = stateWith();
    const events = damages(resolveEffect(state, coupDeNavire, { controllerId: "p1", turnNumber: 1 }).events);
    expect(events[0]!.origin).toEqual({ playerId: "p1" });
  });
});

describe("mots-clés d'un gain", () => {
  it("BUFF_APPLIED nomme les mots-clés accordés", () => {
    const { state, lanceur } = stateWith();
    const effect: EffectDefinition = {
      type: "buff",
      target: { kind: "self" },
      amount: { kind: "flat", value: 1 },
      grantKeywords: ["garde"],
    };
    const { events } = resolveEffect(state, effect, { controllerId: "p1", sourceInstanceId: lanceur, turnNumber: 1 });
    const buff = events.find((event) => event.type === "BUFF_APPLIED");
    expect(buff).toMatchObject({ targetInstanceId: lanceur, attack: 1, health: 1, keywords: ["garde"] });
  });
});
