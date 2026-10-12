import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isArrivalCost } from "@/game/cards/arrivalRule";
import type { GameState } from "@/game";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * EFFETS D'ARRIVÉE FACULTATIFS (12/10/2026) : l'effet d'arrivée d'un
 * permanent se PROPOSE (Appliquer / Passer) au lieu de s'imposer ; seule
 * une contrepartie reste imposée, un effet mêlé se refuse en bloc.
 */

function poser(cardId: string, p1: Parameters<typeof testPlayer>[1] = {}, tide: GameState["environment"]["tideState"] = "calme") {
  const carte = instance(cardId, "p1");
  const base = testGameState({ players: [testPlayer("p1", { hand: [carte], reason: 10, ...p1 }), testPlayer("p2")] });
  const state: GameState = { ...base, environment: { ...base.environment, tideState: tide } };
  const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId });
  if (!r.ok) throw new Error(r.error);
  return { carte, state: r.state };
}
const arriveeDe = (cardId: string) => getCardDefinition(cardId).abilities!.findIndex((a) => a.arrivalEffect);

describe("effets d'arrivée facultatifs", () => {
  it("l'effet d'arrivée se propose, il ne s'applique pas tout seul", () => {
    const { carte, state } = poser("chirurgien-de-coque", { anchor: 20 });
    expect(state.players[0].anchor).toBe(20);
    expect(state.pendingReaction?.awaitingPlayerId).toBe("p1");
    // Appliquer : il se résout.
    const applique = dispatch(state, { type: "activateReaction", playerId: "p1", sourceInstanceId: carte.instanceId, abilityIndex: arriveeDe("chirurgien-de-coque") });
    if (!applique.ok) throw new Error(applique.error);
    expect(applique.state.players[0].anchor).toBe(21);
  });

  it("passer la fenêtre : la carte est posée, son effet n'a pas lieu", () => {
    const { carte, state } = poser("chirurgien-de-coque", { anchor: 20 });
    const passe = dispatch(state, { type: "passReaction", playerId: "p1" });
    if (!passe.ok) throw new Error(passe.error);
    expect(passe.state.players[0].board.some((u) => u.instanceId === carte.instanceId)).toBe(true);
    expect(passe.state.players[0].anchor).toBe(20);
  });

  it("une contrepartie seule reste imposée (« à son arrivée, perdez 2 Raison »)", () => {
    const { state } = poser("la-chose-qui-remonte", { reason: 10 }, "tempete");
    const cout = getCardDefinition("la-chose-qui-remonte").cost;
    expect(state.players[0].reason).toBe(10 - cout - 2);
    expect(getCardDefinition("la-chose-qui-remonte").abilities?.some((a) => a.arrivalEffect) ?? false).toBe(false);
  });

  it("un effet mêlé (« piochez puis défaussez ») se refuse en bloc", () => {
    const def = getCardDefinition("mousse-des-quarts");
    const arrivee = def.abilities!.find((a) => a.arrivalEffect)!;
    expect(arrivee.effects.map((e) => e.type)).toEqual(["draw", "discard"]);
    expect(def.onPlayEffects ?? []).toEqual([]);
  });

  it("sans rien à faire (condition manquée), pas de fenêtre", () => {
    const { state } = poser("poisson-lanterne", {}, "calme");
    expect(state.pendingReaction).toBeUndefined();
  });

  it("le choix de couleur d'une Sentinelle reste imposé ; la pose d'un Équipement aussi", () => {
    const emissaire = getCardDefinition("emissaire-de-quartz");
    expect(emissaire.abilities?.find((a) => a.effects.some((e) => e.type === "chooseChromaticColor"))?.mode ?? "auto").toBe("auto");
    expect(getCardDefinition("le-cerf-volant").onPlayEffects?.some((e) => e.type === "attachEquipment")).toBe(true);
  });

  it("ce qui compte comme contrepartie", () => {
    expect(isArrivalCost({ type: "reasonLoss", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } })).toBe(true);
    expect(isArrivalCost({ type: "reasonLoss", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 1 } })).toBe(false);
    expect(isArrivalCost({ type: "damage", target: { kind: "self" }, amount: { kind: "flat", value: 1 } })).toBe(true);
  });
});
