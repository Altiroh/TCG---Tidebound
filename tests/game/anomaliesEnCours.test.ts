import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { eligibleChosenUnits } from "@/game/effects/chosenTargets";
import { resolveEffect } from "@/game/effects/resolveEffect";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * EFFETS EN COURS (décision du 05/10/2026) : une Anomalie se joue comme un
 * bris. Celle dont le texte dure reste active, mais n'est pas un permanent :
 * pas de Slot, personne ne la désigne ni ne la touche.
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

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
  });
}

/** Ferme les fenêtres de réaction encore ouvertes (en passant). */
function passerFenetres(state: GameState): GameState {
  let s = state;
  while (s.pendingReaction) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

describe("Anomalie durable : effet en cours, pas un permanent", () => {
  // Le Brise-Lames, Navire des tests : 6 emplacements.
  const plein = () => Array.from({ length: 6 }, () => instance("crabe-de-fer", "p1"));

  it("se joue plateau plein, et ne prend aucun Slot", () => {
    const anomalie = instance("le-fond-vous-regarde", "p1");
    const r = dispatch(table({ board: plein(), hand: [anomalie] }), { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    ok(r);
    expect(unite(r.state, anomalie.instanceId)).toBeDefined();

    // Cinq unités + l'Anomalie : la sixième se pose encore.
    const cinq = plein().slice(0, 5);
    const sixieme = instance("crabe-de-fer", "p1");
    const avecAnomalie = table({ board: [...cinq, instance("le-fond-vous-regarde", "p1", { turnsRemaining: 2 })], hand: [sixieme] });
    const pose = dispatch(avecAnomalie, { type: "playCard", playerId: "p1", instanceId: sixieme.instanceId });
    ok(pose);
  });

  it("ne se désigne pas et n'est pas touchée par « toutes les unités »", () => {
    const anomalie = instance("le-fond-vous-regarde", "p1", { turnsRemaining: 2 });
    const crabe = instance("crabe-de-fer", "p1");
    const state = table({ board: [crabe, anomalie] });
    const designables = eligibleChosenUnits(state, { kind: "chosenUnit", among: { sameController: false } }, "p1").map((c) => c.unit.instanceId);
    expect(designables).toContain(crabe.instanceId);
    expect(designables).not.toContain(anomalie.instanceId);

    const frappe = resolveEffect(state, { type: "destroy", target: { kind: "allUnits" } }, { controllerId: "p2", turnNumber: state.turnNumber });
    expect(unite(frappe.state, anomalie.instanceId)?.pendingRemoval).toBeUndefined();
    expect(unite(frappe.state, crabe.instanceId)?.pendingRemoval).toBeDefined();
  });
});

describe("Jusqu'à ce que ça casse : à la pose, puis à chaque survie", () => {
  it("à la pose, propose les unités déjà blessées ce tour-ci, et ne les reprend pas ensuite", () => {
    const matelot = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const eclat2 = instance("eclat-de-bouteille", "p1");
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    let state = table({ board: [matelot, eclat, eclat2], hand: [anomalie] });

    // Le Matelot survit à un premier dégât ce tour-ci : +1 Puissance.
    const coup = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: eclat.instanceId, targetInstanceId: matelot.instanceId });
    ok(coup);
    state = passerFenetres(coup.state);
    expect(puissance(state, matelot.instanceId)).toBe(2);

    // La pose propose le Matelot (blessé ce tour-ci).
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    ok(pose);
    const choix = pose.state.pendingChoice;
    expect(choix?.kind).toBe("pickUnits");
    if (choix?.kind !== "pickUnits") return;
    expect(choix.among).toEqual([matelot.instanceId]);

    const applique = dispatch(pose.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [matelot.instanceId] } });
    ok(applique);
    state = applique.state;
    expect(unite(state, matelot.instanceId)!.damageMarked).toBe(2);
    // Il survit encore : son effet de survie se redéclenche (+1 de plus).
    expect(puissance(state, matelot.instanceId)).toBe(3);
    // Il a eu son tour : l'Anomalie ne lui propose pas un second dégât.
    expect(pendingCandidates(state).map((c) => c.cardId)).not.toContain("jusqua-ce-que-ca-casse");

    // Et plus tard dans le tour non plus.
    state = passerFenetres(state);
    const encore = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: eclat2.instanceId, targetInstanceId: matelot.instanceId });
    ok(encore);
    expect(pendingCandidates(encore.state).map((c) => c.cardId)).not.toContain("jusqua-ce-que-ca-casse");
  });

  it("une unité laissée de côté à la pose garde son tour pour plus tard", () => {
    const matelot = instance("matelot-fele", "p1", { damageMarked: 1 });
    const autre = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    // Blessé, mais pas CE tour-ci : la pose ne le propose pas.
    const pose = dispatch(table({ board: [matelot, autre, eclat], hand: [anomalie] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: anomalie.instanceId,
    });
    ok(pose);
    expect(pose.state.pendingChoice).toBeUndefined();

    const coup = dispatch(passerFenetres(pose.state), { type: "breakObject", playerId: "p1", instanceId: eclat.instanceId, targetInstanceId: autre.instanceId });
    ok(coup);
    expect(pendingCandidates(coup.state).map((c) => c.cardId)).toContain("jusqua-ce-que-ca-casse");
  });
});
