import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isArrivalCost } from "@/game/cards/arrivalRule";
import { activatableArrivals } from "@/game/reactions/deferredArrivals";
import type { GameState } from "@/game";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * EFFETS D'ARRIVÉE FACULTATIFS (12/10/2026) : l'effet d'arrivée d'un
 * permanent se PROPOSE au lieu de s'imposer ; seule une contrepartie reste
 * imposée, un effet mêlé se refuse en bloc. Posé par le joueur actif en
 * Phase principale, il attend EN RÉSERVE (`deferredArrivals.ts`) : la carte
 * luit, le joueur l'active quand il veut pendant ce tour.
 */

function poser(cardId: string, p1: Parameters<typeof testPlayer>[1] = {}, tide: GameState["environment"]["tideState"] = "calme") {
  const carte = instance(cardId, "p1");
  // Une Garde adverse : de quoi désigner une cible (« choisissez une unité adverse »).
  const base = testGameState({ players: [testPlayer("p1", { hand: [carte], reason: 10, ...p1 }), testPlayer("p2", { board: [garde] })] });
  const state: GameState = { ...base, environment: { ...base.environment, tideState: tide } };
  const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId });
  if (!r.ok) throw new Error(r.error);
  return { carte, state: r.state };
}
const garde = instance("crabe-de-fer", "p2", { instanceId: "garde-adverse" });
const aGarde = (state: GameState) => {
  const unit = state.players[1].board.find((u) => u.instanceId === garde.instanceId)!;
  return !unit.modifiers.some((m) => m.removesKeywords?.includes("garde"));
};
/** La capacité d'arrivée qui se propose : écrite facultative, ou rendue telle par la règle (`arrivalEffect`). */
const arriveeDe = (cardId: string) =>
  getCardDefinition(cardId).abilities!.findIndex((a) => a.arrivalEffect || (a.trigger === "onEnterPlay" && a.mode === "optional"));

describe("effets d'arrivée facultatifs", () => {
  it("l'effet d'arrivée se met en RÉSERVE : pas de fenêtre, la carte attend d'être activée", () => {
    const { carte, state } = poser("bete-de-percee");
    expect(aGarde(state)).toBe(true);
    expect(state.pendingReaction).toBeUndefined();
    expect(state.deferredArrivals).toEqual([
      { controllerId: "p1", sourceInstanceId: carte.instanceId, cardId: "bete-de-percee", abilityIndex: arriveeDe("bete-de-percee"), turnNumber: state.turnNumber },
    ]);
    expect(activatableArrivals(state, "p1")).toHaveLength(1);
    // Le joueur peut faire autre chose entre-temps : rien ne bloque la table.
    expect(dispatch(state, { type: "advancePhase", playerId: "p1" }).ok).toBe(true);
    // Activer : il se résout, et quitte la réserve.
    const applique = dispatch(state, { type: "activateArrival", playerId: "p1", sourceInstanceId: carte.instanceId, abilityIndex: arriveeDe("bete-de-percee"), targetInstanceId: garde.instanceId });
    if (!applique.ok) throw new Error(applique.error);
    expect(aGarde(applique.state)).toBe(false);
    expect(applique.state.deferredArrivals).toBeUndefined();
    expect(dispatch(applique.state, { type: "activateArrival", playerId: "p1", sourceInstanceId: carte.instanceId, abilityIndex: arriveeDe("bete-de-percee"), targetInstanceId: garde.instanceId }).ok).toBe(false);
  });

  it("ne pas l'activer, c'est passer : la réserve se perd à la fin du tour", () => {
    const { carte, state } = poser("bete-de-percee");
    const fin = dispatch(state, { type: "endTurn", playerId: "p1" });
    if (!fin.ok) throw new Error(fin.error);
    expect(fin.state.players[0].board.some((u) => u.instanceId === carte.instanceId)).toBe(true);
    expect(aGarde(fin.state)).toBe(true);
    expect(fin.state.deferredArrivals).toBeUndefined();
  });

  it("pas en combat : la réserve attend la Phase principale 2", () => {
    const { carte, state } = poser("bete-de-percee");
    const combat = dispatch(state, { type: "advancePhase", playerId: "p1" });
    if (!combat.ok) throw new Error(combat.error);
    expect(combat.state.phase).toBe("combatPhase");
    expect(activatableArrivals(combat.state, "p1")).toHaveLength(0);
    const p2 = dispatch(combat.state, { type: "advancePhase", playerId: "p1" });
    if (!p2.ok) throw new Error(p2.error);
    expect(p2.state.phase).toBe("mainPhase2");
    const applique = dispatch(p2.state, { type: "activateArrival", playerId: "p1", sourceInstanceId: carte.instanceId, abilityIndex: arriveeDe("bete-de-percee"), targetInstanceId: garde.instanceId });
    expect(applique.ok).toBe(true);
  });

  it("une contrepartie seule reste imposée (« à son arrivée, perdez 2 Raison »)", () => {
    const { state } = poser("la-chose-qui-remonte", { reason: 10 }, "tempete");
    const cout = getCardDefinition("la-chose-qui-remonte").cost;
    expect(state.players[0].reason).toBe(10 - cout - 2);
    expect(getCardDefinition("la-chose-qui-remonte").abilities?.some((a) => a.arrivalEffect) ?? false).toBe(false);
  });

  it("un effet SANS décision s'applique à la pose : rien à demander (soin, pioche, jet de dé)", () => {
    const { state } = poser("chirurgien-de-coque", { anchor: 20 });
    expect(state.players[0].anchor).toBe(21);
    expect(state.deferredArrivals).toBeUndefined();
    expect(state.pendingReaction).toBeUndefined();
    expect(getCardDefinition("chirurgien-de-coque").abilities?.some((a) => a.arrivalEffect) ?? false).toBe(false);
    expect(getCardDefinition("mousse-des-quarts").onPlayEffects?.map((e) => e.type)).toEqual(["draw", "discard"]);
    expect(getCardDefinition("gaston-aventurier-de-ladalle").abilities?.some((a) => a.arrivalEffect) ?? false).toBe(false);
  });

  it("un effet qui DÉSIGNE (une unité, une carte du Cimetière) se propose", () => {
    expect(arriveeDe("bete-de-percee")).toBeGreaterThanOrEqual(0);
    // Le repêchage de « Tu viens jouer ? » : une carte du Cimetière à désigner.
    expect(getCardDefinition("tu-viens-jouer").abilities?.some((a) => a.arrivalEffect)).toBe(true);
  });

  it("sans rien à faire (condition manquée), ni fenêtre ni réserve", () => {
    const { state } = poser("poisson-lanterne", {}, "calme");
    expect(state.pendingReaction).toBeUndefined();
    expect(state.deferredArrivals).toBeUndefined();
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
