import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getShipDefinition } from "@/game/environment/shipData";
import { shipAbilityView } from "@/game/state/shipAbility";
import {
  cardGameKey,
  oncePerGameAvailable,
  oncePerGameUses,
  shipAbilityGameKey,
  withOncePerGameUse,
} from "@/game/state/oncePerGame";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer, enFinDeTour } from "./testHelpers";

/**
 * FRÉQUENCE « UNE FOIS PAR PARTIE » et ses trois premiers usages :
 * Tenir la ligne (Brise-Lames), Changer de cap (L'Errant), Virage court
 * (Le Courlis).
 *
 * Ce qui est vérifié ici n'est pas « la capacité fait ce qu'elle dit »
 * seulement, mais surtout que la réserve vit DANS L'ÉTAT : c'est ce qui la
 * rend autoritaire côté serveur et insensible à une reconnexion.
 */

function ok(result: ReturnType<typeof dispatch>): asserts result is Extract<ReturnType<typeof dispatch>, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
}

describe("primitive « une fois par partie »", () => {
  it("compte les usages par clé, sans jamais se réarmer", () => {
    const player = testPlayer("p1");
    expect(oncePerGameUses(player, "k")).toBe(0);
    expect(oncePerGameAvailable(player, "k")).toBe(true);

    const once = withOncePerGameUse(player, "k");
    expect(oncePerGameUses(once, "k")).toBe(1);
    expect(oncePerGameAvailable(once, "k")).toBe(false);
    // Une réserve de DEUX reste ouverte : le compteur n'est pas un booléen.
    expect(oncePerGameAvailable(once, "k", 2)).toBe(true);

    // Une autre clé n'est pas touchée : c'est ce qui la rend réutilisable
    // par plusieurs capacités, et plus tard par des cartes.
    expect(oncePerGameUses(once, "autre")).toBe(0);
    expect(shipAbilityGameKey("le-brise-lames", "Tenir la ligne")).not.toBe(cardGameKey("le-seau", "Tenir la ligne"));
  });

  it("est portée par l'état, donc elle survit à une sérialisation (reconnexion)", () => {
    const state = testGameState({
      players: [testPlayer("p1", { shipId: "le-brise-lames" }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const used = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(used);

    // Exactement ce que fait le serveur : l'état part en base en JSON et
    // revient tel quel (`match_states`). Rien de la réserve ne doit se
    // perdre en route.
    const reloaded: GameState = JSON.parse(JSON.stringify(used.state));
    expect(getPlayer(reloaded, "p1").oncePerGameUses).toEqual({
      [shipAbilityGameKey("le-brise-lames", "Tenir la ligne")]: 1,
    });
    // Un tour plus tard : le compteur du TOUR est périmé, seule la réserve
    // de partie peut encore refuser — et c'est bien elle qui répond.
    const again = dispatch({ ...reloaded, turnNumber: reloaded.turnNumber + 2 }, { type: "activateShipAbility", playerId: "p1" });
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.error).toContain("cette partie");
  });
});

describe("Le Brise-Lames — Tenir la ligne", () => {
  /** Une Structure du Brise-Lames que la Marée détruit dès qu'elle atteint les Abysses. */
  function withDoomedStructure(): { state: GameState; structureId: string } {
    // On simule la destruction environnementale par des dégâts de Marée
    // mortels, la voie que le moteur impute à la Marée.
    const structure = { ...instance("le-role-dequipage", "p1"), damageMarked: 0, lastDamageCause: "tide" as const };
    return {
      structureId: structure.instanceId,
      state: testGameState({
        players: [
          testPlayer("p1", { shipId: "le-brise-lames", board: [structure] }),
          testPlayer("p2", { shipId: "le-goliath" }),
        ],
      }),
    };
  }

  it("s'active une fois, et pas deux", () => {
    const { state } = withDoomedStructure();
    const first = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(first);
    expect(getPlayer(first.state, "p1").destructionProtections).toHaveLength(1);
    expect(getPlayer(first.state, "p1").destructionProtections![0]).toMatchObject({
      causes: ["tide"],
      cardTypes: ["structure"],
      expiresAfterTurn: state.turnNumber,
    });

    // Même tour : c'est la limite du tour qui refuse.
    const second = dispatch(first.state, { type: "activateShipAbility", playerId: "p1" });
    expect(second.ok).toBe(false);
    expect(shipAbilityView(first.state, "p1")!.activationBlockedBy).toContain("ce tour-ci");

    // Deux tours plus tard, la limite du tour ne dit plus rien : c'est la
    // réserve de partie qui tient, et elle ne se réarme jamais.
    const plusTard: GameState = { ...first.state, turnNumber: first.state.turnNumber + 2 };
    expect(dispatch(plusTard, { type: "activateShipAbility", playerId: "p1" }).ok).toBe(false);
    expect(shipAbilityView(plusTard, "p1")!.activationBlockedBy).toContain("cette partie");
  });

  it("empêche la Marée de détruire une Structure, sans protéger le reste", () => {
    const { state, structureId } = withDoomedStructure();
    const protege = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(protege);

    // Dégâts mortels imputés à la Marée : sans protection la Structure part.
    const blesser = (base: GameState): GameState => ({
      ...base,
      players: base.players.map((p) =>
        p.id === "p1"
          ? { ...p, board: p.board.map((u) => (u.instanceId === structureId ? { ...u, damageMarked: 99, lastDamageCause: "tide" as const } : u)) }
          : p
      ) as GameState["players"],
    });

    const sansProtection = dispatch(blesser(state), { type: "advancePhase", playerId: "p1" });
    ok(sansProtection);
    expect(getPlayer(sansProtection.state, "p1").board).toHaveLength(0);

    const avecProtection = dispatch(blesser(protege.state), { type: "advancePhase", playerId: "p1" });
    ok(avecProtection);
    expect(getPlayer(avecProtection.state, "p1").board).toHaveLength(1);
  });

  it("ne protège pas d'une destruction qui n'est pas environnementale", () => {
    const { state, structureId } = withDoomedStructure();
    const protege = dispatch(state, { type: "activateShipAbility", playerId: "p1" });
    ok(protege);

    // Même carte, même dégâts, mais imputés à un EFFET : la protection ne
    // nomme que la Marée, elle ne doit rien faire ici.
    const parEffet: GameState = {
      ...protege.state,
      players: protege.state.players.map((p) =>
        p.id === "p1"
          ? { ...p, board: p.board.map((u) => (u.instanceId === structureId ? { ...u, damageMarked: 99, lastDamageCause: "effect" as const } : u)) }
          : p
      ) as GameState["players"],
    };
    const result = dispatch(parEffet, { type: "advancePhase", playerId: "p1" });
    ok(result);
    expect(getPlayer(result.state, "p1").board).toHaveLength(0);
  });
});

describe("capacités de Navire et changement de Marée", () => {
  /**
   * Fin du tour de p1 avec une Marée sur le point de changer d'état : c'est
   * cette annonce qui ouvre la fenêtre.
   */
  function atTideChange(shipOfP2: string): GameState {
    return testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 1, tideOrientation: "montante" }),
      players: [
        testPlayer("p1", { shipId: "le-goliath", deck: [instance("marin-des-jetees", "p1")] }),
        testPlayer("p2", { shipId: shipOfP2, deck: [instance("marin-des-jetees", "p2")] }),
      ],
    });
  }

  it("aucun Navire n'ouvre plus de fenêtre au changement de Marée (08/10/2026)", () => {
    for (const ship of ["lerrant", "le-courlis"]) {
      const annonce = dispatch(enFinDeTour(atTideChange(ship)), { type: "endTurn", playerId: "p1" });
      ok(annonce);
      expect(annonce.state.pendingReaction, ship).toBeUndefined();
      expect(annonce.state.pendingTideStep, ship).toBeUndefined();
    }
  });

  it("les cinq Navires du roster portent leur capacité, et aucune ne reste en texte seul", () => {
    // `capacityText` — le champ « texte seul, rien n'est appliqué » — ne
    // doit plus servir : une capacité non câblée ne se verrait plus.
    for (const shipId of ["le-courlis", "lerrant", "le-brise-lames", "le-goliath", "la-religieuse"]) {
      expect(getShipDefinition(shipId).activatableAbility, shipId).toBeDefined();
      expect(getShipDefinition(shipId).capacityText, shipId).toBeUndefined();
    }
    // Seules celles qui le disent portent une limite de partie : Réparation
    // d'urgence est un robinet, pas un coup d'éclat.
    expect(getShipDefinition("la-religieuse").activatableAbility!.activationsPerGame).toBeUndefined();
    expect(getShipDefinition("lerrant").activatableAbility!.activationsPerGame).toBe(1);
  });
});

describe.each([
  ["lerrant", "Changer de cap"],
  ["le-courlis", "Virage court"],
])("%s — %s, en Phase principale (08/10/2026)", (shipId, abilityName) => {
  function errantEnPhase(phase: GameState["phase"]): GameState {
    return testGameState({
      phase,
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 2, tideOrientation: "montante" }),
      players: [testPlayer("p1", { shipId }), testPlayer("p2", { shipId: "le-goliath" })],
    });
  }

  it("inverse l'orientation de la Marée, au choix du joueur, une fois par partie", () => {
    const active = dispatch(errantEnPhase("mainPhase"), { type: "activateShipAbility", playerId: "p1" });
    ok(active);
    expect(active.state.environment.tideOrientation).toBe("descendante");
    // La durée et l'état ne bougent pas : seul le sens change.
    expect(active.state.environment.tideState).toBe("houle");
    expect(active.state.environment.tideRemainingTurns).toBe(2);
    expect(getPlayer(active.state, "p1").oncePerGameUses).toEqual({ [shipAbilityGameKey(shipId, abilityName)]: 1 });

    const encore = dispatch({ ...active.state, turnNumber: active.state.turnNumber + 2 }, { type: "activateShipAbility", playerId: "p1" });
    expect(encore.ok).toBe(false);
  });

  it("s'active aussi en Phase principale 2, jamais en combat", () => {
    expect(dispatch(errantEnPhase("mainPhase2"), { type: "activateShipAbility", playerId: "p1" }).ok).toBe(true);
    expect(dispatch(errantEnPhase("combatPhase"), { type: "activateShipAbility", playerId: "p1" }).ok).toBe(false);
  });

  it("pas pendant le tour adverse", () => {
    const state = { ...errantEnPhase("mainPhase"), activePlayerId: "p2" as const, priorityPlayerId: "p2" as const };
    expect(dispatch(state, { type: "activateShipAbility", playerId: "p1" }).ok).toBe(false);
  });
});
