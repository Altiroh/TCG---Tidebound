import { describe, expect, it } from "vitest";
import { CARD_DATABASE, eligibleChosenUnits, type CardDefinition } from "@/game";
import { legalTargetsFor } from "@/features/match/table/legalTargets";
import { phaseButtonFor } from "@/features/match/table/tableLabels";
import { instance, testGameState, testPlayer } from "../game/testHelpers";

/**
 * `legalTargetsFor` : les cartes qui s'éclairent pendant un ciblage, et les
 * SEULES qu'un toucher désigne — toucher une autre carte l'affiche en grand
 * au lieu de lancer un geste que le moteur refuserait (audit mobile du 30/09).
 */
describe("legalTargetsFor", () => {
  it("sans ciblage, rien à éclairer", () => {
    expect(legalTargetsFor(testGameState(), "p1", null)).toBeNull();
  });

  it("un Équipement vise les seuls porteurs possibles de son joueur", () => {
    const harpon = instance("harpon-de-pont", "p1"); // Équipez un Marin ou une Créature
    const murene = instance("murene-aveugle", "p1");
    const trone = instance("le-trone-de-bouchon", "p1"); // une Structure : pas un porteur
    const adverse = instance("murene-aveugle", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [harpon], board: [murene, trone] }), testPlayer("p2", { board: [adverse] })],
    });
    const targets = legalTargetsFor(state, "p1", { kind: "playCard", sourceInstanceId: harpon.instanceId });
    expect(targets && [...targets]).toEqual([murene.instanceId]);
  });

  it("une attaque vise les unités adverses, jamais les siennes", () => {
    const mine = instance("murene-aveugle", "p1");
    const theirs = instance("murene-aveugle", "p2");
    const state = testGameState({ players: [testPlayer("p1", { board: [mine] }), testPlayer("p2", { board: [theirs] })] });
    const targets = legalTargetsFor(state, "p1", { kind: "attack", sourceInstanceId: mine.instanceId });
    expect(targets && [...targets]).toEqual([theirs.instanceId]);
  });

  it("une capacité de Navire ciblée vise tout ce qui a une Résistance, des deux côtés", () => {
    const mine = instance("murene-aveugle", "p1");
    const theirs = instance("murene-aveugle", "p2");
    const state = testGameState({ players: [testPlayer("p1", { board: [mine] }), testPlayer("p2", { board: [theirs] })] });
    const targets = legalTargetsFor(state, "p1", { kind: "shipTarget" });
    expect(targets && [...targets].sort()).toEqual([mine.instanceId, theirs.instanceId].sort());
  });

  it("une carte source introuvable : le conteneur tranche seul", () => {
    expect(legalTargetsFor(testGameState(), "p1", { kind: "playCard", sourceInstanceId: "absente" })).toBeNull();
  });

  // Les autres genres suivent le filtre du moteur : chaque carte du
  // catalogue qui en porte un est vérifiée contre `eligibleChosenUnits`.
  const chosen = (effects: CardDefinition["onBreakEffects"]) => (effects ?? []).filter((e) => e.target.kind === "chosenUnit");
  const board = () => [instance("murene-aveugle", "p1"), instance("harpon-de-pont", "p1"), instance("murene-aveugle", "p2")];

  it("un Bris ciblé suit le filtre de son effet", () => {
    const defs = [...CARD_DATABASE.values()].filter((def) => def.type === "objet" && chosen(def.onBreakEffects).length === 1);
    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      const objet = instance(def.id, "p1");
      const [a, b, c] = board();
      const state = testGameState({ players: [testPlayer("p1", { board: [a!, b!, objet] }), testPlayer("p2", { board: [c!] })] });
      const expected = eligibleChosenUnits(state, chosen(def.onBreakEffects)[0]!.target, "p1", objet.instanceId).map((x) => x.unit.instanceId);
      const targets = legalTargetsFor(state, "p1", { kind: "break", sourceInstanceId: objet.instanceId });
      expect([...(targets ?? [])].sort(), def.id).toEqual(expected.sort());
    }
  });

  it("une réaction ciblée suit le filtre de SA capacité (`abilityIndex`)", () => {
    const cases = [...CARD_DATABASE.values()].flatMap((def) =>
      (def.abilities ?? []).flatMap((ability, index) => (chosen(ability.effects).length === 1 ? [{ def, index, ability }] : []))
    );
    expect(cases.length).toBeGreaterThan(0);
    for (const { def, index, ability } of cases) {
      const source = instance(def.id, "p1");
      const [a, b, c] = board();
      const state = testGameState({ players: [testPlayer("p1", { board: [a!, b!, source] }), testPlayer("p2", { board: [c!] })] });
      const expected = eligibleChosenUnits(state, chosen(ability.effects)[0]!.target, "p1", source.instanceId).map((x) => x.unit.instanceId);
      const targets = legalTargetsFor(state, "p1", { kind: "reaction", sourceInstanceId: source.instanceId, abilityIndex: index });
      expect([...(targets ?? [])].sort(), `${def.id}#${index}`).toEqual(expected.sort());
    }
  });
});

describe("phaseButtonFor", () => {
  it("en Phase de combat, « Fin de tour » est proposé à côté de la Phase principale 2", () => {
    const button = phaseButtonFor({ isMyTurn: true, phase: "combatPhase" });
    expect(button.action).toBe("advance");
    expect(button.secondary).toEqual({ label: "Fin de tour", action: "endTurn" });
  });

  it("ailleurs, un seul bouton", () => {
    expect(phaseButtonFor({ isMyTurn: true, phase: "mainPhase" }).secondary).toBeUndefined();
    expect(phaseButtonFor({ isMyTurn: true, phase: "mainPhase2" }).secondary).toBeUndefined();
    expect(phaseButtonFor({ isMyTurn: false, phase: "combatPhase" }).secondary).toBeUndefined();
  });
});
