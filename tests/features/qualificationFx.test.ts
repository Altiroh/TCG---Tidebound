import { describe, expect, it } from "vitest";
import { dispatch, type CardInstance, type CardQualification, type GameState } from "@/game";
import { declareLeadMs, qualificationFxFrom, qualificationInterim, qualificationSteps, qualificationTimeline, qualificationVolley } from "@/features/match/qualificationFxData";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * MISE EN SCÈNE DES QUALIFICATIONS (commit « New effect », 12/10/2026) :
 * la spé. s'active après l'attaque, puis son effet part en SORT du porteur.
 */

function avec(unit: CardInstance, ...qualifications: CardQualification[]): CardInstance {
  return { ...unit, modifiers: [...unit.modifiers, { id: `q_${unit.instanceId}`, source: "unknown", attack: 0, health: 0, duration: "permanent", qualifications }] };
}
function table(mine: CardInstance[], theirs: CardInstance[]): GameState {
  return { ...testGameState({ players: [testPlayer("p1", { board: mine, anchor: 20 }), testPlayer("p2", { shipId: "le-goliath", board: theirs, reason: 5 })] }), phase: "combatPhase" };
}
function play(state: GameState, attacker: string, defender?: string) {
  const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker, defenderInstanceId: defender });
  if (!r.ok) throw new Error(r.error);
  const events = r.state.eventLog.slice(state.eventLog.length);
  return { live: r.state, events, fx: events.flatMap((e) => qualificationFxFrom(e) ?? []) };
}

describe("qualifications en scène", () => {
  it("Brèche, Sangsue et Ponction : une activation, puis un sort de dégâts, un soin et un malus de Raison", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "breche" }, { id: "sangsue" }, { id: "ponction", value: 1 });
    const cible = instance("murene-aveugle", "p2");
    const before = table([a], [cible]);
    const { live, fx, events } = play(before, a.instanceId, cible.instanceId);
    // Leurs effets sont marqués : ils ne jouent pas avec le coup.
    expect(events.filter((e) => e.byQualification).map((e) => e.type)).toEqual(expect.arrayContaining(["DAMAGE", "HEAL", "REASON_CHANGED"]));
    // Une étape par spé., dans l'ordre : jamais toutes en même temps.
    expect(qualificationSteps(fx, "after").map((s) => s.qualification)).toEqual(["breche", "ponction", "sangsue"]);
    let id = 10;
    const timeline = qualificationTimeline(before, live, fx, 3, 1000, () => id++);
    for (let i = 1; i < timeline.steps.length; i += 1) expect(timeline.steps[i]!.atMs).toBeGreaterThanOrEqual(timeline.steps[i - 1]!.doneMs);
    // Le plateau suit : après la Brèche, le Navire adverse a encaissé ; la Raison, pas encore.
    const apresBreche = timeline.displays[1]!.held;
    expect(apresBreche.players[1].anchor).toBe(live.players[1].anchor);
    expect(apresBreche.players[1].reason).toBe(before.players[1].reason);
    expect(apresBreche.players[0].anchor).toBe(before.players[0].anchor);
    const volley = qualificationVolley(fx, before, live, 1, 1000)!;
    expect(volley.shots.map((s) => [s.look, s.to])).toEqual([
      ["magic", { kind: "ship", id: "p2" }],
      ["drain", { kind: "ship", id: "p2" }],
    ]);
    expect(volley.heals).toEqual([{ to: { kind: "ship", id: "p1" }, amount: 3, source: { from: { kind: "unit", id: a.instanceId }, originPlayerId: "p1" } }]);
    expect(volley.reason).toEqual([expect.objectContaining({ playerId: "p2", amount: -1 })]);
    // Pendant le sort, les Navires et la Raison sont encore ceux d'avant.
    const interim = qualificationInterim(before, live, fx, volley, 3);
    expect(interim.players.map((p) => [p.anchor, p.reason])).toEqual(before.players.map((p) => [p.anchor, p.reason]));
  });

  it("Coup de grâce : la cible reste, blessée, le temps de l'activation ; Carnage s'active sans sort", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "coup-de-grace" }, { id: "carnage" });
    const cible = instance("matelot-du-sans-nom", "p2"); // 4 Résistance : 3 dégâts ne suffisent pas, le Coup de grâce achève
    const before = table([a], [cible]);
    const { live, fx } = play(before, a.instanceId, cible.instanceId);
    expect(live.players[1].board).toHaveLength(0);
    expect(qualificationVolley(fx, before, live, 1, 0)).toBeNull();
    const interim = qualificationInterim(before, live, fx, null, 3);
    expect(interim.players[1].board.map((u) => [u.instanceId, u.damageMarked])).toEqual([[cible.instanceId, 3]]);
  });

  it("Éclaboussure : un sort par voisin ; Entaille : un malus sur la cible, retiré de l'affichage le temps du sort", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "eclaboussure", value: 1 }, { id: "entaille", value: 1 });
    const [g, m, d] = [instance("charpentier-de-bord", "p2"), instance("le-naufrage-impossible", "p2"), instance("charpentier-de-bord", "p2")];
    const before = table([a], [g, m, d]);
    const { live, fx } = play(before, a.instanceId, m.instanceId);
    const volley = qualificationVolley(fx, before, live, 1, 0)!;
    expect(volley.shots.map((s) => s.to)).toEqual([
      { kind: "unit", id: g.instanceId },
      { kind: "unit", id: d.instanceId },
    ]);
    expect(volley.buffs.map((b) => [b.targetInstanceId, b.attack, b.loss])).toEqual(
      expect.arrayContaining([[m.instanceId, -1, true]])
    );
    const interim = qualificationInterim(before, live, fx, volley, 3);
    const cible = interim.players[1].board.find((u) => u.instanceId === m.instanceId)!;
    expect(cible.modifiers.some((mod) => mod.id.startsWith("entaille_"))).toBe(false);
    expect(cible.damageMarked).toBe(3);
  });

  it("Rafale s'active avant que l'attaquant ne parte", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "rafale" });
    let s = play(table([a], []), a.instanceId).live;
    const second = play(s, a.instanceId);
    s = second.live;
    expect(qualificationSteps(second.fx, "declare").map((st) => st.qualification)).toEqual(["rafale"]);
    expect(declareLeadMs(second.fx)).toBeGreaterThan(0);
  });
});
