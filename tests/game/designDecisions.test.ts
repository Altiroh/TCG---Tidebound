/**
 * Décisions de design du 17/09/2026, une par bloc : chacune est ici pour
 * qu'un futur remaniement ne la reprenne pas silencieusement.
 *
 * 1. Une « Durée : N tours » sur une CARTE compte les tours de son
 *    contrôleur, pas les tours de table.
 * 2. « Les trois » d'un archétype acceptent la variante Abyssale.
 * 3. « La première fois que » sans « à chaque tour » : un seul usage pour
 *    toute la partie (Brise-Vague de Fortune).
 * 4. Un effet proposé peut toujours être REFUSÉ — fenêtre de réaction comme
 *    choix entre deux options. Une Anomalie qui IMPOSE un choix, non.
 * 5. Un Objet n'a PAS de Résistance (18/09/2026) : il ne s'attaque pas, ne
 *    s'encaisse pas et ne meurt pas de dégâts. Seuls Structures et
 *    Équipements en ont, en plus des unités.
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { consumeTideShipDamageShield } from "@/game/state/shields";
import { computeEffectiveStats } from "@/game/cards/stats";
import { CORE_SET } from "@/game/cards/sets/core";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { previewBreakReason } from "@/game/actions/breakObject";
import type { GameState } from "@/game/state/types";
import { instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

function ok(result: { ok: boolean; error?: string }): asserts result is { ok: true; state: GameState } & typeof result {
  if (!result.ok) throw new Error(result.error ?? "action refusée");
}
function board(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!.board;
}
function player(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!;
}
function filler(ownerId: string) {
  return [instance("marin-des-jetees", ownerId), instance("marin-des-jetees", ownerId), instance("marin-des-jetees", ownerId)];
}

describe("durée d'une carte : les tours de son contrôleur", () => {
  it("un permanent à durée 2 survit au tour de l'adversaire et ne perd un tour qu'au retour de son contrôleur", () => {
    // Le Rideau se Lève promet « à chacun de vos tours » sur 2 tours : la
    // promesse n'est tenable que si le décompte suit son contrôleur.
    const rideau = instance("le-rideau-se-leve", "p1", { turnsRemaining: 2 });
    let state: GameState = testGameState({
      players: [testPlayer("p1", { board: [rideau], deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })],
    });

    // Tour de p2 : le Rideau ne bouge pas.
    const toP2 = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(toP2);
    state = toP2.state;
    expect(board(state, "p1").find((u) => u.instanceId === rideau.instanceId)?.turnsRemaining).toBe(2);

    // Retour de p1 : un tour de moins, et la carte est toujours là.
    const backToP1 = dispatch(state, { type: "endTurn", playerId: "p2" });
    ok(backToP1);
    state = backToP1.state;
    expect(board(state, "p1").find((u) => u.instanceId === rideau.instanceId)?.turnsRemaining).toBe(1);

    // Deux de ses tours écoulés : elle quitte le plateau à l'entame du second.
    const toP2Again = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(toP2Again);
    const expired = dispatch(toP2Again.state, { type: "endTurn", playerId: "p2" });
    ok(expired);
    expect(board(expired.state, "p1").some((u) => u.instanceId === rideau.instanceId)).toBe(false);
    expect(player(expired.state, "p1").graveyard.some((u) => u.instanceId === rideau.instanceId)).toBe(true);
  });
});

describe("« les trois » acceptent la variante Abyssale", () => {
  const setup = (chevalierId: string) => {
    const chevalier = instance(chevalierId, "p1");
    const destrier = instance("destrier-du-grand-etang", "p1");
    const bourreau = instance("bourreau-cra-poiscail", "p1");
    const tournoi = instance("le-tournoi-du-grand-etang", "p1");
    return testGameState({
      players: [
        testPlayer("p1", { board: [chevalier, destrier, bourreau], hand: [tournoi], deck: filler("p1") }),
        testPlayer("p2"),
      ],
    });
  };
  const playTournoi = (state: GameState) => {
    const tournoi = player(state, "p1").hand[0]!;
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: tournoi.instanceId });
    ok(result);
    return result.state;
  };

  it("le Chevalier standard fait piocher", () => {
    const after = playTournoi(setup("chevalier-cra-poiscail"));
    expect(player(after, "p1").hand).toHaveLength(1); // la carte piochée
  });

  it("le Chevalier Abyssal aussi : la variante reste un Chevalier", () => {
    const after = playTournoi(setup("chevalier-cra-poiscail-abyssal"));
    expect(player(after, "p1").hand).toHaveLength(1);
    // Et le bonus va bien à la variante, comme avant la décision.
    const chevalier = board(after, "p1").find((u) => u.cardId === "chevalier-cra-poiscail-abyssal")!;
    expect(chevalier.modifiers.length).toBeGreaterThan(0);
  });

  it("sans Bourreau, personne ne pioche", () => {
    const chevalier = instance("chevalier-cra-poiscail-abyssal", "p1");
    const destrier = instance("destrier-du-grand-etang", "p1");
    const tournoi = instance("le-tournoi-du-grand-etang", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [chevalier, destrier], hand: [tournoi], deck: filler("p1") }),
        testPlayer("p2"),
      ],
    });
    expect(player(playTournoi(state), "p1").hand).toHaveLength(0);
  });
});

describe("Brise-Vague de Fortune : un seul usage pour toute la partie", () => {
  it("réduit une première fois, puis plus jamais — même au tour suivant", () => {
    const brise = instance("brise-vague-de-fortune", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "tempete" }),
      players: [testPlayer("p1", { board: [brise] }), testPlayer("p2")],
    });

    const first = consumeTideShipDamageShield(state, "p1", 1);
    expect(first.reduction).toBe(1);

    // Même tour : consommé.
    expect(consumeTideShipDamageShield(first.state, "p1", 1).reduction).toBe(0);
    // Tours suivants : « la première fois que » ne se réarme pas.
    expect(consumeTideShipDamageShield(first.state, "p1", 3).reduction).toBe(0);
    expect(consumeTideShipDamageShield(first.state, "p1", 99).reduction).toBe(0);
  });
});

describe("un effet proposé peut être refusé", () => {
  it("une réaction facultative : passer ferme la fenêtre sans rien appliquer", () => {
    const plongeur = instance("plongeur-des-epaves", "p1");
    const structure = instance("le-trone-de-bouchon", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [plongeur, structure], reason: 4 }), testPlayer("p2")],
    });
    const saborded = dispatch(state, { type: "saborder", playerId: "p1", instanceId: structure.instanceId });
    ok(saborded);
    expect(pendingCandidates(saborded.state).some((c) => c.cardId === "plongeur-des-epaves")).toBe(true);

    const passed = dispatch(saborded.state, { type: "passReaction", playerId: "p1" });
    ok(passed);
    expect(passed.state.pendingReaction).toBeUndefined();
    expect(player(passed.state, "p1").reason).toBe(4);
  });

  it("un choix entre deux capacités : « pass » n'en applique aucune", () => {
    const dottore = instance("il-dottore-des-noyes", "p1");
    const allie = instance("marin-des-jetees", "p1");
    const ennemi = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [dottore, allie], deck: filler("p1") }),
        testPlayer("p2", { board: [ennemi] }),
      ],
    });

    const withChoice: GameState = {
      ...state,
      pendingChoice: {
        kind: "abilityOption",
        playerId: "p1",
        sourceInstanceId: dottore.instanceId,
        cardId: "il-dottore-des-noyes",
        abilityIndexes: [0, 1],
        turnNumber: 1,
      },
    };
    const refused = dispatch(withChoice, { type: "resolveChoice", playerId: "p1", choice: "pass" });
    ok(refused);
    expect(refused.state.pendingChoice).toBeUndefined();
    expect(board(refused.state, "p1").find((u) => u.instanceId === allie.instanceId)!.modifiers).toHaveLength(0);
    expect(board(refused.state, "p2").find((u) => u.instanceId === ennemi.instanceId)!.modifiers).toHaveLength(0);
    expect(computeEffectiveStats(board(refused.state, "p2")[0]!, "calme").attack).toBe(
      computeEffectiveStats(ennemi, "calme").attack
    );
  });

  it("le choix IMPOSÉ d'une Anomalie, lui, refuse « pass »", () => {
    const state: GameState = {
      ...testGameState({ players: [testPlayer("p1", { reason: 6, anchor: 12 }), testPlayer("p2")] }),
      pendingChoice: {
        kind: "reasonOrAnchor",
        playerId: "p1",
        sourceInstanceId: "anomalie_test",
        reasonLossAmount: 2,
        anchorDamageAmount: 2,
        turnNumber: 1,
      },
    };
    const refused = dispatch(state, { type: "resolveChoice", playerId: "p1", choice: "pass" });
    expect(refused.ok).toBe(false);
    const chosen = dispatch(state, { type: "resolveChoice", playerId: "p1", choice: "reasonLoss" });
    ok(chosen);
    expect(player(chosen.state, "p1").reason).toBe(4);
  });
});

describe("un Objet n'a pas de Résistance", () => {
  it("aucun Objet du catalogue n'en déclare, contrairement aux Structures et Équipements", () => {
    const parType = (t: string) => CORE_SET.filter((def) => def.type === t);
    expect(parType("objet").filter((def) => def.health !== undefined)).toEqual([]);
    // Le pendant : ceux qui DOIVENT en avoir en ont bien.
    for (const t of ["structure", "equipement"]) {
      const sans = parType(t).filter((def) => def.health === undefined).map((def) => def.id);
      expect(sans, `${t} sans Résistance`).toEqual([]);
    }
  });

  it("ne peut pas être choisi comme cible d'attaque", () => {
    const attaquant = instance("marin-des-jetees", "p1", { summoningSick: false });
    const objet = instance("le-seau", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attaquant] }), testPlayer("p2", { board: [objet] })],
    });

    const refus = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: objet.instanceId,
    });
    expect(refus.ok).toBe(false);
  });

  it("survit à son arrivée et à un effet de dégâts de masse, là où une Structure encaisse", () => {
    // Sans garde-fou, `stats.health` retomberait à 0 et l'Objet mourrait
    // dès la première passe de `processDeaths`.
    const objet = instance("le-seau", "p2");
    const structure = instance("le-trone-de-bouchon", "p2");
    const source = instance("marin-des-jetees", "p1");
    let state: GameState = testGameState({
      players: [testPlayer("p1", { board: [source] }), testPlayer("p2", { board: [objet, structure] })],
    });

    const degats = resolveEffect(
      state,
      { type: "damage", target: { kind: "allEnemyUnits" }, amount: { kind: "flat", value: 2 } },
      { controllerId: "p1", turnNumber: state.turnNumber }
    );
    state = degats.state;

    const cibles = board(state, "p2");
    expect(cibles.find((u) => u.cardId === "le-seau")!.damageMarked).toBe(0);
    expect(cibles.find((u) => u.cardId === "le-trone-de-bouchon")!.damageMarked).toBe(2);
    // Et il est toujours là après la passe de sortie.
    const apres = dispatch(state, { type: "advancePhase", playerId: "p1" });
    ok(apres);
    expect(board(apres.state, "p2").some((u) => u.cardId === "le-seau")).toBe(true);
  });
});

describe("Cloche d'Alerte : la taxe peut rendre le Bris impossible", () => {
  function table(reason: number) {
    const objet = instance("le-seau", "p1");
    const cloche = instance("cloche-dalerte", "p2");
    return {
      objet,
      state: testGameState({
        environment: testEnvironment({ tideState: "calme" }), // la Cloche y est visible
        players: [testPlayer("p1", { board: [objet], reason }), testPlayer("p2", { board: [cloche] })],
      }),
    };
  }

  it("refuse le Bris quand la Raison ne couvre pas la taxe", () => {
    const { objet, state } = table(0);
    const refus = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    expect(refus.ok).toBe(false);
    // L'aperçu le dit AVANT la tentative.
    expect(previewBreakReason(state, "p1", objet.instanceId, false)!.allowed).toBe(false);
  });

  it("l'autorise dès que la Raison suffit, et prélève bien la taxe", () => {
    const { objet, state } = table(1);
    expect(previewBreakReason(state, "p1", objet.instanceId, false)!.allowed).toBe(true);
    const brise = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    ok(brise);
    expect(player(brise.state, "p1").reason).toBe(0);
  });

  it("sans Cloche adverse, un Bris à 0 Raison reste permis : le plancher est une règle de carte", () => {
    const objet = instance("le-seau", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [objet], reason: 0 }), testPlayer("p2")],
    });
    const brise = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    ok(brise);
  });
});
