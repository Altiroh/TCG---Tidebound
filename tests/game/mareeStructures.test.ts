import { describe, expect, it } from "vitest";
import { applyTideTurnEffects } from "@/game/environment/resolveEnvironment";
import { dispatch } from "@/game/engine";
import { RULES } from "@/game/rules/constants";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LA MARÉE ABÎME AUSSI CE QUI EST POSÉ (22/09/2026).
 *
 * Jusqu'ici la mer ne s'en prenait qu'aux coques et aux équipages : une
 * Structure ne craignait rien de la Tempête, ce qui rendait « Tenir la
 * ligne » (Brise-Lames) littéralement sans objet — elle protégeait d'un
 * danger qui n'existait pas. Ces tests vérifient les deux moitiés : la
 * Tempête ronge les Structures, et la capacité les en protège.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

const board = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.board;

/** Une Structure (Résistance 3) et un Objet (sans Résistance) chez p1. */
function tableExposee(tideState: "calme" | "houle" | "tempete" | "abysses"): {
  state: GameState;
  structure: string;
  objet: string;
} {
  const structure = instance("epaves-accrochees", "p1", { turnsRemaining: 4 });
  const objet = instance("treuil-rouille", "p1", { turnsRemaining: 4 });
  return {
    structure: structure.instanceId,
    objet: objet.instanceId,
    state: testGameState({
      environment: testEnvironment({ tideState }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [structure, objet] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    }),
  };
}

describe("dégâts de Marée sur les Structures", () => {
  it("la Tempête marque les Structures, et seulement elles", () => {
    const { state, structure, objet } = tableExposee("tempete");
    const result = applyTideTurnEffects(state, "houle", "tempete", RULES.TIDE_BASE_INTENSITY, state.turnNumber);

    const apres = board(result.state, "p1");
    const marquee = apres.find((u) => u.instanceId === structure)!;
    expect(marquee.damageMarked).toBe(RULES.TIDE_STRUCTURE_DAMAGE.tempete);
    // Imputés à la MARÉE : c'est ce qui les rend couverts par
    // `protectFromDestruction` et correctement comptés au banc d'essai.
    expect(marquee.lastDamageCause).toBe("tide");

    // Un Objet n'a pas de Résistance : il ne s'encaisse pas.
    expect(apres.find((u) => u.instanceId === objet)!.damageMarked).toBe(0);
  });

  it("les autres états de Marée laissent les Structures tranquilles", () => {
    for (const etat of ["calme", "houle", "abysses"] as const) {
      const { state, structure } = tableExposee(etat);
      const result = applyTideTurnEffects(state, etat, etat, RULES.TIDE_BASE_INTENSITY, state.turnNumber);
      expect(board(result.state, "p1").find((u) => u.instanceId === structure)!.damageMarked, etat).toBe(0);
    }
  });

  it("l'Intensité multiplie les dégâts, comme pour le reste de la Marée", () => {
    const { state, structure } = tableExposee("tempete");
    const result = applyTideTurnEffects(state, "tempete", "tempete", 2, state.turnNumber);
    expect(board(result.state, "p1").find((u) => u.instanceId === structure)!.damageMarked).toBe(
      (RULES.TIDE_STRUCTURE_DAMAGE.tempete ?? 0) * 2
    );
  });

  it("à force, la Tempête emporte la Structure — et c'est une destruction par la MARÉE", () => {
    const { state, structure } = tableExposee("tempete");
    // Une Résistance de 3, déjà entamée : le prochain coup de Tempête est fatal.
    const entamee: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1"
          ? { ...p, board: p.board.map((u) => (u.instanceId === structure ? { ...u, damageMarked: 2 } : u)) }
          : p
      ) as GameState["players"],
    };
    const result = applyTideTurnEffects(entamee, "tempete", "tempete", RULES.TIDE_BASE_INTENSITY, entamee.turnNumber);
    const morte = board(result.state, "p1").find((u) => u.instanceId === structure)!;
    expect(morte.damageMarked).toBeGreaterThanOrEqual(3);
    expect(morte.lastDamageCause).toBe("tide");
  });
});

describe("Le Brise-Lames — Tenir la ligne protège enfin de quelque chose", () => {
  it("la Structure encaisse les dégâts mais ne part pas, tant que la capacité tient", () => {
    const { state, structure } = tableExposee("tempete");
    // Structure à un cheveu de la rupture.
    const fragile: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p1"
          ? { ...p, board: p.board.map((u) => (u.instanceId === structure ? { ...u, damageMarked: 2 } : u)) }
          : p
      ) as GameState["players"],
    };

    // Sans la capacité : la Tempête l'emporte à la première passe de morts.
    const sansProtection = dispatch(
      applyTideTurnEffects(fragile, "tempete", "tempete", 1, fragile.turnNumber).state,
      { type: "advancePhase", playerId: "p1" }
    );
    ok(sansProtection);
    expect(board(sansProtection.state, "p1").some((u) => u.instanceId === structure)).toBe(false);

    // Avec : elle reste, marquée. La protection fait gagner du temps, elle
    // ne soigne pas.
    const protege = dispatch(fragile, { type: "activateShipAbility", playerId: "p1" });
    ok(protege);
    const avecProtection = dispatch(
      applyTideTurnEffects(protege.state, "tempete", "tempete", 1, protege.state.turnNumber).state,
      { type: "advancePhase", playerId: "p1" }
    );
    ok(avecProtection);
    const survivante = board(avecProtection.state, "p1").find((u) => u.instanceId === structure);
    expect(survivante).toBeDefined();
    expect(survivante!.damageMarked).toBeGreaterThanOrEqual(3);
  });
});

describe("La Religieuse — Réparation d'urgence", () => {
  function religieuse(overrides: Partial<GameState> = {}): GameState {
    return testGameState({
      players: [
        testPlayer("p1", { shipId: "la-religieuse", anchor: 20, reason: 6, reasonMax: 10 }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
      ...overrides,
    });
  }

  it("échange 2 Raison contre 2 Ancrage", () => {
    const state = religieuse();
    const result = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(result);
    const apres = result.state.players.find((p) => p.id === "p1")!;
    expect(apres.reason).toBe(4);
    expect(apres.anchor).toBe(22);
  });

  it("une fois par tour, mais autant de tours qu'on veut — ce n'est pas une capacité de partie", () => {
    const state = religieuse();
    const premier = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(premier);
    expect(dispatch(premier.state, { type: "activateShipAbility", playerId: "p1" }).ok).toBe(false);

    // Deux tours plus tard, elle est de nouveau disponible : aucune réserve
    // de partie ne s'est consommée.
    const plusTard: GameState = { ...premier.state, turnNumber: premier.state.turnNumber + 2 };
    ok(dispatch(plusTard, { type: "activateShipAbility", playerId: "p1" }));
    expect(premier.state.players.find((p) => p.id === "p1")!.oncePerGameUses ?? {}).toEqual({});
  });

  it("le coût se paie même à découvert — il creuse la Déraison, comme toute perte de Raison", () => {
    const state = religieuse({
      players: [
        testPlayer("p1", { shipId: "la-religieuse", anchor: 20, reason: 1, reasonMax: 10 }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const result = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(result);
    const apres = result.state.players.find((p) => p.id === "p1")!;
    expect(apres.reason).toBe(-1);
    expect(apres.anchor).toBe(22);
  });

  it("l'Ancrage ne dépasse pas le maximum du Navire", () => {
    const ship = 30; // La Religieuse
    const state = religieuse({
      players: [
        testPlayer("p1", { shipId: "la-religieuse", anchor: ship - 1, reason: 6, reasonMax: 10 }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const result = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(result);
    expect(result.state.players.find((p) => p.id === "p1")!.anchor).toBeLessThanOrEqual(ship);
  });
});
