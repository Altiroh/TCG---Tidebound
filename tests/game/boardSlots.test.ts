import { describe, expect, it } from "vitest";
import { boardSlotLayout, chooseBoardSlot, dispatch, type GameState } from "@/game";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

// Emplacements du rang (08/10/2026) : le joueur pose sa carte où il veut,
// cases vides comprises, et elle y reste. Le Brise-Lames des tests a 6 cases.
function avecMain(hand: ReturnType<typeof instance>[], board: ReturnType<typeof instance>[] = []): GameState {
  return testGameState({ players: [testPlayer("p1", { hand, board }), testPlayer("p2", { shipId: "le-goliath" })] });
}

function poser(state: GameState, instanceId: string, boardSlot?: number): GameState {
  const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId, boardSlot });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const rang = (state: GameState) => boardSlotLayout(state.players[0].board, 6).map((card) => card?.instanceId);

describe("emplacements du rang", () => {
  it("une carte se pose tout à droite d'un rang vide, et y reste", () => {
    const a = instance("crabe-de-fer", "p1");
    const b = instance("crabe-de-fer", "p1");
    let state = poser(avecMain([a, b]), a.instanceId, 5);
    expect(rang(state)).toEqual([undefined, undefined, undefined, undefined, undefined, a.instanceId]);

    // Sans case choisie : la première libre.
    state = poser(state, b.instanceId);
    expect(rang(state)).toEqual([b.instanceId, undefined, undefined, undefined, undefined, a.instanceId]);

    // La voisine de gauche part : la carte de droite ne glisse pas.
    const sansB: GameState = { ...state, players: [{ ...state.players[0], board: state.players[0].board.filter((u) => u.instanceId !== b.instanceId) }, state.players[1]] };
    expect(rang(sansB)[5]).toBe(a.instanceId);
  });

  it("une case déjà prise ou hors du rang vaut « première libre »", () => {
    const posee = instance("crabe-de-fer", "p1", { slot: 2 });
    const a = instance("crabe-de-fer", "p1");
    const b = instance("crabe-de-fer", "p1");
    let state = poser(avecMain([a, b], [posee]), a.instanceId, 2);
    expect(rang(state).slice(0, 3)).toEqual([a.instanceId, undefined, posee.instanceId]);
    state = poser(state, b.instanceId, 9);
    expect(rang(state)[1]).toBe(b.instanceId);
  });

  it("une carte revenue en main ne garde pas son ancienne case", () => {
    const revenue = instance("crabe-de-fer", "p1", { slot: 4 });
    const state = poser(avecMain([revenue]), revenue.instanceId);
    expect(rang(state)[0]).toBe(revenue.instanceId);
  });

  it("une carte arrivée sans case comble la première case libre", () => {
    const fixe = { slot: 0 };
    const libre = {};
    expect(boardSlotLayout([libre, fixe], 3)).toEqual([fixe, libre, undefined]);
    // Deux cartes sur la même case : la seconde se range ailleurs, rien ne disparaît.
    const doublon = { slot: 0 };
    expect(boardSlotLayout([fixe, doublon], 2)).toEqual([fixe, doublon]);
  });

  it("un Équipement sans case choisie se range au plus près de son porteur", () => {
    expect(chooseBoardSlot([{ slot: 3 }], 6, undefined, 3)).toBe(4);
    expect(chooseBoardSlot([{ slot: 3 }, { slot: 4 }], 6, undefined, 3)).toBe(2);
  });
});
