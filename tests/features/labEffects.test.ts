import { describe, expect, it } from "vitest";
import { applyLabEffect, LAB_EFFECTS } from "@/features/match/labEffects";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

const effect = (id: string) => LAB_EFFECTS.find((e) => e.id === id)!;

describe("labo — effets appliqués d'un clic sur les cartes", () => {
  const carte = instance("marin-des-jetees", "p1");
  const autre = instance("crabe-de-fer", "p2");
  const state = testGameState({ players: [testPlayer("p1", { board: [carte] }), testPlayer("p2", { board: [autre] })] });

  it("un état se pose, puis se retire au second clic — avec l'événement qu'une vraie carte émettrait", () => {
    const malade = applyLabEffect(state, effect("malade"), [carte.instanceId]);
    expect(malade.players[0].board[0]!.statuses).toEqual(["malade"]);
    expect(malade.eventLog.at(-1)).toMatchObject({ type: "STATUS_CHANGED", targetInstanceId: carte.instanceId, status: "malade", applied: true });
    const gueri = applyLabEffect(malade, effect("malade"), [carte.instanceId]);
    expect(gueri.players[0].board[0]!.statuses).toBeUndefined();
  });

  it("seules les cibles changent", () => {
    const after = applyLabEffect(state, effect("buff"), [carte.instanceId]);
    expect(after.players[0].board[0]!.modifiers).toHaveLength(1);
    expect(after.players[1].board[0]).toBe(state.players[1].board[0]);
    expect(after.eventLog.at(-1)).toMatchObject({ type: "BUFF_APPLIED", attack: 1, health: 1 });
  });

  it("un mot-clé de labo se bascule", () => {
    const garde = applyLabEffect(state, effect("garde"), [carte.instanceId]);
    expect(garde.players[0].board[0]!.modifiers[0]!.keywords).toEqual(["garde"]);
    expect(applyLabEffect(garde, effect("garde"), [carte.instanceId]).players[0].board[0]!.modifiers).toHaveLength(0);
  });

  it("dégât puis soin : la Résistance perdue revient, et « remettre à neuf » efface tout", () => {
    let s = applyLabEffect(state, effect("degat"), [carte.instanceId]);
    expect(s.players[0].board[0]!.damageMarked).toBe(1);
    s = applyLabEffect(s, effect("soin"), [carte.instanceId]);
    expect(s.players[0].board[0]!.damageMarked).toBe(0);
    s = applyLabEffect(applyLabEffect(s, effect("mort"), [carte.instanceId]), effect("remise"), [carte.instanceId]);
    expect(s.players[0].board[0]!).toMatchObject({ damageMarked: 0, modifiers: [], markers: undefined });
  });
});
