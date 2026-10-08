import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, answerHandDiscard, instance, pendingCandidates, testEnvironment, testGameState, testPlayer, enFinDeTour } from "./testHelpers";

/**
 * PONT DE VERRE — « La première fois pendant chacun de vos tours qu'une unité
 * que vous contrôlez survit à des dégâts infligés par l'un de vos effets,
 * restaurez 1 Résistance à une autre unité que vous contrôlez. »
 *
 * Retours de partie réelle (24/09/2026) : le Pont restait muet alors que la
 * condition était remplie, et se dérèglait quand un autre déclenchement
 * tombait au même moment. Les causes, toutes dans le moteur :
 *
 *   - un CHOIX ouvert par la même action (le soin du Verrier de Pont, la
 *     défausse de la Vigie aux Fissures) empêchait la fenêtre de réaction de
 *     s'ouvrir, et les déclencheurs de l'action étaient perdus pour de bon ;
 *   - une fenêtre de SAUVETAGE (Porte-Éclats) reportait « qui a survécu » à
 *     sa reprise… en oubliant les coups encaissés avant elle ;
 *   - un coup MORTEL porté par une réaction (Jusqu'à ce que ça casse) passait
 *     pour une survie : la passe de morts n'avait pas encore eu lieu.
 *
 * Tout se joue par `dispatch`, comme en partie.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const puissance = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id)).attack;
};
const proposees = (state: GameState) => pendingCandidates(state).map((c) => c.cardId);

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
  });
}

/** Passe toutes les fenêtres encore ouvertes, comme un joueur qui n'active plus rien. */
function toutPasser(state: GameState): GameState {
  let courant = state;
  while (courant.pendingReaction) {
    const r = dispatch(courant, { type: "passReaction", playerId: courant.pendingReaction.awaitingPlayerId });
    ok(r);
    courant = r.state;
  }
  return courant;
}

describe("Pont de Verre : la survie est bien repérée", () => {
  it("entre en jeu pour 4 tours", () => {
    const pont = instance("pont-de-verre", "p1");
    const r = dispatch(table({ hand: [pont] }), { type: "playCard", playerId: "p1", instanceId: pont.instanceId });
    ok(r);
    expect(unite(r.state, pont.instanceId)?.turnsRemaining).toBe(4);
  });

  it("Verrier de Pont blesse un allié qui survit : le Pont se propose une fois le soin du Verrier choisi", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const verrier = instance("verrier-de-pont", "p1");
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 2 });
    const r = dispatch(table({ board: [pont, verrier, matelot, blesse] }), {
      type: "activateAbility",
      playerId: "p1",
      sourceInstanceId: verrier.instanceId,
      targetInstanceId: matelot.instanceId,
    });
    ok(r);
    // Le Verrier demande d'abord à qui restaurer SA Résistance…
    expect(r.state.pendingChoice?.kind).toBe("pickUnits");
    const soinVerrier = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [blesse.instanceId] } });
    ok(soinVerrier);
    expect(unite(soinVerrier.state, blesse.instanceId)!.damageMarked).toBe(1);
    // …puis le Pont, qui a vu le Matelot survivre au coup du Verrier.
    expect(proposees(soinVerrier.state)).toContain("pont-de-verre");
    // Le survivant n'est pas « une autre unité ».
    expect(activateReactionFor(soinVerrier.state, "pont-de-verre", matelot.instanceId).ok).toBe(false);
    const soinPont = activateReactionFor(soinVerrier.state, "pont-de-verre", blesse.instanceId);
    ok(soinPont);
    expect(unite(soinPont.state, blesse.instanceId)!.damageMarked).toBe(0);
  });

  it("une seule fois pendant chacun de vos tours", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 2 });
    const e1 = instance("eclat-de-bouteille", "p1");
    const e2 = instance("eclat-de-bouteille", "p1");
    const r1 = dispatch(table({ board: [pont, matelot, blesse, e1, e2] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: e1.instanceId,
      targetInstanceId: matelot.instanceId,
    });
    ok(r1);
    const soin = activateReactionFor(r1.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    const etat = toutPasser(soin.state);
    const r2 = dispatch(etat, { type: "breakObject", playerId: "p1", instanceId: e2.instanceId, targetInstanceId: matelot.instanceId });
    ok(r2);
    expect(proposees(r2.state)).not.toContain("pont-de-verre");
  });
});

describe("Pont de Verre face à un autre déclenchement simultané", () => {
  it("la défausse de la Vigie aux Fissures, sur la même survie, ne fait pas perdre le Pont", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const vigie = instance("vigie-aux-fissures", "p1");
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 2 });
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = dispatch(
      table({ board: [pont, vigie, matelot, blesse, eclat], deck: [instance("matelot-fele", "p1")], hand: [instance("matelot-fele", "p1")] }),
      { type: "breakObject", playerId: "p1", instanceId: eclat.instanceId, targetInstanceId: matelot.instanceId }
    );
    ok(r);
    // La Vigie (automatique) a pioché : elle attend sa défausse.
    expect(r.state.pendingChoice?.kind).toBe("handDiscard");
    const defausse = answerHandDiscard(r.state);
    ok(defausse);
    expect(proposees(defausse.state)).toEqual(["pont-de-verre"]);
    const soin = activateReactionFor(defausse.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(1);
    expect(soin.state.pendingReaction).toBeUndefined();
    // La partie reprend son cours normal.
    const fin = dispatch(enFinDeTour(soin.state), { type: "endTurn", playerId: "p1" });
    ok(fin);
  });

  it("Porte-Éclats refusé : l'autre unité qui a survécu au même Bris déclenche encore le Pont (et progresse)", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const porte = instance("porte-eclats", "p1");
    const condamne = instance("matelot-fele", "p1", { damageMarked: 2 });
    const survivant = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const objet = instance("trinquer-trop-fort", "p1");
    const r = dispatch(table({ board: [pont, porte, condamne, survivant, blesse, objet] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: objet.instanceId,
    });
    ok(r);
    const coups = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [condamne.instanceId, survivant.instanceId] } });
    ok(coups);
    // Fenêtre de sauvetage d'abord : on ne sait pas encore qui survit.
    expect(proposees(coups.state)).toEqual(["porte-eclats"]);
    const refus = dispatch(coups.state, { type: "passReaction", playerId: "p1" });
    ok(refus);
    expect(unite(refus.state, condamne.instanceId)).toBeUndefined();
    // Le survivant a bien survécu : sa propre capacité, puis le Pont.
    expect(puissance(refus.state, survivant.instanceId)).toBe(2);
    expect(proposees(refus.state)).toContain("pont-de-verre");
    const soin = activateReactionFor(refus.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(0);
  });

  it("Porte-Éclats accepté : l'unité sauvée a survécu, elle aussi, et progresse", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const porte = instance("porte-eclats", "p1");
    const condamne = instance("matelot-fele", "p1", { damageMarked: 2 });
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = dispatch(table({ board: [pont, porte, condamne, blesse, eclat] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: eclat.instanceId,
      targetInstanceId: condamne.instanceId,
    });
    ok(r);
    const sauve = activateReactionFor(r.state, "porte-eclats");
    ok(sauve);
    expect(proposees(sauve.state)).toContain("pont-de-verre");
    const soin = activateReactionFor(sauve.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    expect(soin.state.pendingReaction).toBeUndefined();
    expect(soin.state.pendingDestruction).toBeUndefined();
    expect(unite(soin.state, condamne.instanceId)).toBeDefined();
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(0);
    // Le Matelot a survécu au coup de l'Éclat : +1 Puissance, comme ailleurs.
    expect(puissance(soin.state, condamne.instanceId)).toBe(2);
  });

  it("Jusqu'à ce que ça casse : le coup de trop qui TUE n'est pas une survie, le Pont reste muet", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    const matelot = instance("matelot-fele", "p1", { damageMarked: 1 });
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const adverse = instance("matelot-fele", "p2");
    const state = testGameState({ ...table({ board: [pont, anomalie, matelot, blesse] }, { board: [adverse] }), phase: "combatPhase" });
    // Riposte de 1 : le Matelot survit au COMBAT — pas à l'un de vos effets.
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: matelot.instanceId, defenderInstanceId: adverse.instanceId });
    ok(r);
    expect(unite(r.state, matelot.instanceId)!.damageMarked).toBe(2);
    expect(proposees(r.state)).toEqual(["jusqua-ce-que-ca-casse"]);
    // Le coup supplémentaire vient bien de votre effet… mais il l'achève.
    const encore = activateReactionFor(r.state, "jusqua-ce-que-ca-casse");
    ok(encore);
    expect(unite(encore.state, matelot.instanceId)).toBeUndefined();
    expect(proposees(encore.state)).not.toContain("pont-de-verre");
  });

  it("Jusqu'à ce que ça casse : si l'unité tient au coup de trop, le Pont se propose dans la même chaîne", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const adverse = instance("matelot-fele", "p2");
    const state = testGameState({ ...table({ board: [pont, anomalie, matelot, blesse] }, { board: [adverse] }), phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: matelot.instanceId, defenderInstanceId: adverse.instanceId });
    ok(r);
    const encore = activateReactionFor(r.state, "jusqua-ce-que-ca-casse");
    ok(encore);
    expect(unite(encore.state, matelot.instanceId)!.damageMarked).toBe(2);
    const soin = activateReactionFor(encore.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(0);
  });
});
