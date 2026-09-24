/**
 * La Verrière — Pique à Glace : une capacité de Navire CIBLÉE en un
 * seul geste (`ShipActivatableAbility.targeting: "anyTarget"`).
 *
 * « Une fois par tour, pendant une Phase principale, dépensez 1 Raison :
 * infligez 1 dégât à n'importe quelle cible — une unité ou une Structure,
 * alliée ou adverse, ou un Navire, le vôtre compris. »
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

function verreState(p1: Partial<PlayerState> = {}, p2: Partial<PlayerState> = {}, overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [
      testPlayer("p1", { shipId: "la-verriere", reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-brise-lames", ...p2 }),
    ],
    ...overrides,
  });
}

const pique = (target: { targetInstanceId?: string; targetPlayerId?: string }) =>
  ({ type: "activateShipAbility", playerId: "p1", ...target }) as const;

describe("La Verrière — Pique à Glace", () => {
  it("frappe une unité adverse, même derrière une Garde : c'est un effet, pas une attaque", () => {
    const garde = instance("le-dernier-rempart", "p2");
    const cible = instance("marin-des-jetees", "p2");
    const result = dispatch(verreState({}, { board: [garde, cible] }), pique({ targetInstanceId: cible.instanceId }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getPlayer(result.state, "p1").reason).toBe(9);
    expect(getPlayer(result.state, "p2").board.find((u) => u.instanceId === cible.instanceId)?.damageMarked).toBe(1);
  });

  it("frappe ses propres unités et Structures", () => {
    const mienne = instance("marin-des-jetees", "p1");
    const structure = instance("caisses-arrimees", "p1");
    const surUnite = dispatch(verreState({ board: [mienne, structure] }), pique({ targetInstanceId: mienne.instanceId }));
    expect(surUnite.ok).toBe(true);
    if (!surUnite.ok) return;
    expect(getPlayer(surUnite.state, "p1").board.find((u) => u.instanceId === mienne.instanceId)?.damageMarked).toBe(1);

    const surStructure = dispatch(verreState({ board: [structure] }), pique({ targetInstanceId: structure.instanceId }));
    expect(surStructure.ok).toBe(true);
    if (!surStructure.ok) return;
    expect(getPlayer(surStructure.state, "p1").board[0]?.damageMarked).toBe(1);
  });

  it("frappe l'un ou l'autre Navire, le sien compris", () => {
    const state = verreState();
    const adverse = dispatch(state, pique({ targetPlayerId: "p2" }));
    expect(adverse.ok).toBe(true);
    if (!adverse.ok) return;
    expect(getPlayer(adverse.state, "p2").anchor).toBe(getPlayer(state, "p2").anchor - 1);
    expect(getPlayer(adverse.state, "p1").anchor).toBe(getPlayer(state, "p1").anchor);

    const sienne = dispatch(state, pique({ targetPlayerId: "p1" }));
    expect(sienne.ok).toBe(true);
    if (!sienne.ok) return;
    expect(getPlayer(sienne.state, "p1").anchor).toBe(getPlayer(state, "p1").anchor - 1);
    expect(getPlayer(sienne.state, "p2").anchor).toBe(getPlayer(state, "p2").anchor);
  });

  it("exige exactement une cible, dotée de Résistance", () => {
    const objet = instance("thermos-du-dernier-quart", "p2");
    const unite = instance("marin-des-jetees", "p2");
    const state = verreState({}, { board: [objet, unite] });
    expect(dispatch(state, pique({})).ok).toBe(false);
    expect(dispatch(state, pique({ targetInstanceId: objet.instanceId })).ok).toBe(false);
    expect(dispatch(state, pique({ targetInstanceId: unite.instanceId, targetPlayerId: "p2" })).ok).toBe(false);
  });

  it("une fois par tour, en Phase principale seulement", () => {
    const first = dispatch(verreState(), pique({ targetPlayerId: "p2" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(dispatch(first.state, pique({ targetPlayerId: "p2" })).ok).toBe(false);
    expect(dispatch(verreState({}, {}, { phase: "combatPhase" }), pique({ targetPlayerId: "p2" })).ok).toBe(false);
  });

  it("une capacité non ciblée refuse une cible", () => {
    const state = testGameState({
      players: [testPlayer("p1", { shipId: "la-religieuse" }), testPlayer("p2")],
    });
    expect(dispatch(state, { type: "activateShipAbility", playerId: "p1", targetPlayerId: "p2" }).ok).toBe(false);
  });

  it("le bot se voit proposer chaque cible légale, et aucune activation sans cible", () => {
    const mienne = instance("marin-des-jetees", "p1");
    const objet = instance("thermos-du-dernier-quart", "p2");
    const adverse = instance("marin-des-jetees", "p2");
    const actions = enumerateCandidateActions(verreState({ board: [mienne] }, { board: [objet, adverse] }), "p1").filter(
      (a) => a.type === "activateShipAbility"
    );
    expect(actions).toHaveLength(4);
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetPlayerId: "p1" }),
        expect.objectContaining({ targetPlayerId: "p2" }),
        expect.objectContaining({ targetInstanceId: mienne.instanceId }),
        expect.objectContaining({ targetInstanceId: adverse.instanceId }),
      ])
    );
  });
});
