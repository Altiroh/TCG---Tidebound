import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { processTrigger } from "@/game/triggers/triggerBus";
import type { GameState, PlayerState } from "@/game/state/types";
import { activateReactionFor, answerHandDiscard, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Revue cartes ↔ moteur, phase 2 : écarts restants des Lots 01 à 09 et du
 * Lot 12 (rapports B1, B2, B4). Chaque bloc joue la carte via `dispatch` et
 * vérifie l'effet observable, avec le cas qui était faux avant.
 */

const p = (state: GameState, id: string): PlayerState => state.players.find((x) => x.id === id)!;
const unit = (state: GameState, instanceId: string) =>
  state.players.flatMap((x) => x.board).find((u) => u.instanceId === instanceId);

function ok(result: ReturnType<typeof dispatch>): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("Cylindre flottant (visible) : « dégâts directs d'une attaque », pas d'un tir de Navire", () => {
  it("n'est pas proposé contre un tir du Goliath", () => {
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const cible = instance("murene-aveugle", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { shipId: "le-goliath", reason: 10, board: [cible] }), testPlayer("p2", { board: [cylindre] })],
    });
    const armed = { ...ok(dispatch(state, { type: "activateShipAbility", playerId: "p1" })), phase: "combatPhase" as const };
    const tir = ok(dispatch(armed, { type: "fireShipAbility", playerId: "p1" }));
    expect(pendingCandidates(tir).some((c) => c.cardId === "cylindre-flottant")).toBe(false);
    expect(unit(tir, cylindre.instanceId)).toBeDefined();
  });

  it("reste proposé contre l'attaque directe d'une unité", () => {
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const brute = instance("murene-aveugle", "p1");
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [brute] }), testPlayer("p2", { board: [cylindre] })],
    });
    const declared = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId }));
    expect(pendingCandidates(declared).some((c) => c.cardId === "cylindre-flottant")).toBe(true);
  });
});

describe("Cloche d'Alerte : le Bris d'un Objet réactif est taxé, et bloqué s'il est impayable", () => {
  function attaque(p2Reason: number, p2: Partial<PlayerState>) {
    const cloche = instance("cloche-dalerte", "p1", { turnsRemaining: 3 }); // visible en Calme
    const brute = instance("murene-aveugle", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [cloche, brute] }), testPlayer("p2", { shipId: "le-goliath", reason: p2Reason, ...p2 })],
    });
    return { cloche, state: ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId })) };
  }

  it("Harpon à Ressort posé : son Bris en réaction coûte 1 Raison de taxe, et la Cloche est consommée", () => {
    const harpon = instance("harpon-a-ressort", "p2");
    const { cloche, state } = attaque(5, { board: [harpon] });
    const candidat = pendingCandidates(state).find((c) => c.cardId === "harpon-a-ressort")!;
    // Avant : 0 — le Bris réactif échappait à la Cloche.
    expect(candidat.reasonCost).toBe(1);
    const apres = ok(activateReactionFor(state, "harpon-a-ressort"));
    expect(p(apres, "p2").reason).toBe(4);
    expect(unit(apres, cloche.instanceId)!.oncePerTurnFlags).toBeDefined();
  });

  it("depuis la main : coût du Bris depuis la main + taxe", () => {
    const harpon = instance("harpon-a-ressort", "p2");
    const { state } = attaque(5, { hand: [harpon] });
    const candidat = pendingCandidates(state).find((c) => c.cardId === "harpon-a-ressort")!;
    expect(candidat.reasonCost).toBe(3);
  });

  it("sans Raison pour payer la taxe, le Harpon ne peut pas être Brisé", () => {
    const harpon = instance("harpon-a-ressort", "p2");
    const { state } = attaque(0, { board: [harpon] });
    expect(pendingCandidates(state).some((c) => c.cardId === "harpon-a-ressort")).toBe(false);
  });
});

describe("Guetteur Méfiant : « une UNITÉ de votre choix »", () => {
  it("une Structure n'est pas une cible légale, une unité adverse si", () => {
    const guetteur = instance("guetteur-mefiant", "p1");
    const structure = instance("horloge-de-maree", "p2", { turnsRemaining: 3 });
    const adverse = instance("matelot-du-sans-nom", "p2");
    const carte = instance("murene-aveugle", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [guetteur], hand: [carte] }), testPlayer("p2", { shipId: "le-goliath", board: [structure, adverse] })],
    });
    const joue = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId }));
    expect(activateReactionFor(joue, "guetteur-mefiant", structure.instanceId).ok).toBe(false);
    const frappe = ok(activateReactionFor(joue, "guetteur-mefiant", adverse.instanceId));
    expect(unit(frappe, adverse.instanceId)!.damageMarked).toBe(2);
  });
});

describe("« La première fois à chaque tour … vous pouvez » : refuser consomme l'occasion du tour", () => {
  it("Guetteur Méfiant refusé sur la première carte jouée n'est pas reproposé sur la seconde", () => {
    const guetteur = instance("guetteur-mefiant", "p1");
    const a = instance("murene-aveugle", "p1");
    const b = instance("poisson-aux-dents-de-verre", "p1");
    const cible = instance("matelot-du-sans-nom", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { board: [guetteur], hand: [a, b] }), testPlayer("p2", { shipId: "le-goliath", board: [cible] })],
    });
    const premiere = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: a.instanceId }));
    expect(pendingCandidates(premiere).some((c) => c.cardId === "guetteur-mefiant")).toBe(true);
    const refuse = ok(dispatch(premiere, { type: "passReaction", playerId: "p1" }));
    const seconde = ok(dispatch(refuse, { type: "playCard", playerId: "p1", instanceId: b.instanceId }));
    // Avant : la fenêtre se rouvrait — « une fois par tour », pas « la première fois ».
    expect(pendingCandidates(seconde).some((c) => c.cardId === "guetteur-mefiant")).toBe(false);
  });
});

describe("Épave à Fleur d'Eau : défausser D'ABORD, piocher ensuite", () => {
  it("la carte défaussée est choisie avant la pioche", () => {
    const epave = instance("epave-a-fleur-deau", "p1");
    const garde = instance("murene-aveugle", "p1");
    const pioche = instance("requin-balafre", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { hand: [epave, garde], deck: [pioche] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const pose = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: epave.instanceId }));
    const active = ok(activateReactionFor(pose, "epave-a-fleur-deau"));
    // La défausse est demandée alors que la pioche n'a pas encore eu lieu.
    expect(active.pendingChoice?.kind).toBe("handDiscard");
    expect(p(active, "p1").hand.map((c) => c.instanceId)).toEqual([garde.instanceId]);
    const fini = ok(answerHandDiscard(active, [garde.instanceId]));
    expect(p(fini, "p1").hand.map((c) => c.cardId)).toEqual(["requin-balafre"]);
  });

  it("main vide : rien à défausser, la capacité ne se propose pas", () => {
    const epave = instance("epave-a-fleur-deau", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { hand: [epave], deck: [instance("requin-balafre", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const pose = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: epave.instanceId }));
    expect(pendingCandidates(pose).some((c) => c.cardId === "epave-a-fleur-deau")).toBe(false);
  });
});

describe("Treuil Rouillé : « quitte le board » couvre le renvoi en main", () => {
  it("la Structure équipée renvoyée en main fait piocher", () => {
    const theatre = instance("le-theatre-englouti", "p1", { turnsRemaining: 4 });
    const treuil = instance("treuil-rouille", "p1", { attachedToInstanceId: theatre.instanceId });
    const clochette = instance("la-clochette-du-rappel", "p1");
    const pioche = instance("requin-balafre", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [theatre, treuil, clochette], deck: [pioche] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: clochette.instanceId, targetInstanceId: theatre.instanceId }));
    const main = p(after, "p1").hand.map((c) => c.cardId);
    expect(main).toContain("le-theatre-englouti");
    expect(main).toContain("requin-balafre");
  });
});

describe("Lanterne aux Verres Noirs : pas d'option « réduire » à vide", () => {
  function entame(tideRemainingTurns: number) {
    const marin = instance("matelot-du-sans-nom", "p2");
    const lanterne = instance("lanterne-aux-verres-noirs", "p2", { attachedToInstanceId: marin.instanceId });
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns }),
      players: [
        testPlayer("p1", { deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath", board: [marin, lanterne], deck: [instance("murene-aveugle", "p2")] }),
      ],
    });
    return ok(dispatch(state, { type: "endTurn", playerId: "p1" }));
  }
  const options = (state: GameState) => pendingCandidates(state).filter((c) => c.cardId === "lanterne-aux-verres-noirs").map((c) => c.abilityIndex);

  it("Marée à son dernier tour : seule l'inversion se propose", () => {
    // Tour 2 : pas de décompte de Marée (il a lieu à chaque tour de table).
    const state = entame(1);
    expect(state.environment.tideRemainingTurns).toBe(1);
    expect(options(state)).toEqual([1]);
  });

  it("Marée qui dure encore : les deux options se proposent", () => {
    const state = entame(2);
    expect(options(state)).toEqual([0, 1]);
  });
});

describe("Contremaître des Amarres : une Structure toujours visible devient visible en arrivant", () => {
  it("Horloge de Marée posée par l'adversaire perd 1 Résistance", () => {
    const contremaitre = instance("contremaitre-des-amarres", "p2");
    const horloge = instance("horloge-de-maree", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [horloge] }), testPlayer("p2", { shipId: "le-goliath", board: [contremaitre] })],
    });
    const after = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: horloge.instanceId }));
    expect(unit(after, horloge.instanceId)!.damageMarked).toBe(1);
  });
});

describe("« +1 Puissance contre une Structure » : la Puissance déclarée, pas un bonus de dégâts", () => {
  it("Barracuda qui attaque une Structure déclare 4 de Puissance et lui inflige 4", () => {
    const barracuda = instance("barracuda-des-hauts-fonds", "p1");
    const cible = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const harpon = instance("harpon-a-ressort", "p2"); // ouvre une fenêtre : on y lit la Puissance déclarée
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [barracuda] }), testPlayer("p2", { shipId: "le-goliath", board: [cible, harpon], reason: 0 })],
    });
    const declared = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: barracuda.instanceId, defenderInstanceId: cible.instanceId }));
    // Avant : 3 — le +1 n'existait qu'au moment des dégâts.
    expect(declared.pendingAttack?.attackerPower).toBe(4);
    const after = ok(dispatch(declared, { type: "passReaction", playerId: "p2" }));
    expect(unit(after, cible.instanceId)!.damageMarked).toBe(4);
  });

  it("Corde de Remorquage : même lecture pour le Marin équipé", () => {
    const marin = instance("matelot-du-sans-nom", "p1");
    const corde = instance("corde-de-remorquage", "p1", { attachedToInstanceId: marin.instanceId });
    const cible = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const harpon = instance("harpon-a-ressort", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [marin, corde] }), testPlayer("p2", { shipId: "le-goliath", board: [cible, harpon], reason: 0 })],
    });
    const declared = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: marin.instanceId, defenderInstanceId: cible.instanceId }));
    expect(declared.pendingAttack?.attackerPower).toBe(4);
  });
});

describe("Albatros de Mauvais Temps : « +1 Puissance » en Tempête est une vraie Puissance", () => {
  it("affichée à 5, et sa riposte frappe pour 5", () => {
    const albatros = instance("albatros-de-mauvais-temps", "p2");
    const chose = instance("la-chose-qui-remonte", "p1"); // 5/5
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [chose] }), testPlayer("p2", { shipId: "le-goliath", board: [albatros] })],
    });
    expect(computeEffectiveStats(albatros, "tempete").attack).toBe(5);
    expect(computeEffectiveStats(albatros, "houle").attack).toBe(4);
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: chose.instanceId, defenderInstanceId: albatros.instanceId }));
    // Avant : riposte à 4, la Chose survivait.
    expect(unit(after, chose.instanceId)).toBeUndefined();
    expect(p(after, "p1").graveyard.some((c) => c.cardId === "la-chose-qui-remonte")).toBe(true);
  });
});

describe("Le Fond Vous Regarde : CHAQUE Anomalie impose son choix", () => {
  it("deux exemplaires en jeu : deux choix, l'un après l'autre", () => {
    const a = instance("le-fond-vous-regarde", "p1", { turnsRemaining: 2 });
    const b = instance("le-fond-vous-regarde", "p1", { turnsRemaining: 2 });
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [a, b], deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { deck: [instance("murene-aveugle", "p2")], reason: 10, anchor: 20 }),
      ],
    });
    const tour = ok(dispatch(state, { type: "endTurn", playerId: "p1" }));
    expect(tour.pendingChoice?.kind === "reasonOrAnchor" && tour.pendingChoice.sourceInstanceId).toBe(a.instanceId);
    const premier = ok(dispatch(tour, { type: "resolveChoice", playerId: "p2", choice: "anchorDamage" }));
    // Avant : une seule des deux cartes agissait.
    expect(premier.pendingChoice?.kind === "reasonOrAnchor" && premier.pendingChoice.sourceInstanceId).toBe(b.instanceId);
    const second = ok(dispatch(premier, { type: "resolveChoice", playerId: "p2", choice: "anchorDamage" }));
    expect(second.pendingChoice).toBeUndefined();
    expect(p(second, "p2").anchor).toBe(18);
  });
});

describe("Horloge de Marée : un choix déjà ouvert ne fait pas choisir le moteur", () => {
  it("le choix de l'Horloge attend son tour au lieu de résoudre la première option d'office", () => {
    const attente = { kind: "reasonOrAnchor" as const, playerId: "p1", sourceInstanceId: "x", reasonLossAmount: 1, anchorDamageAmount: 1, turnNumber: 1 };
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      pendingChoice: attente,
    });
    const after = processTrigger(state, { trigger: "onSaborde", playerId: "p1", cardId: "horloge-de-maree", sourceInstanceId: "horloge" }, 1).state;
    expect(after.pendingChoice).toEqual(attente);
    expect(after.environment.tideRemainingTurns).toBe(3);
    expect(after.pendingChoiceQueue?.[0]?.kind).toBe("abilityOption");
  });
});

describe("Régulateur de Courant : la Marée qui prend fin passe à la suivante, Maintien ou non", () => {
  it("un Maintien en attente n'empêche pas le passage", () => {
    const regulateur = instance("regulateur-de-courant", "p1", { turnsRemaining: 3 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, pendingTideModifiers: [{ kind: "maintain", remainingTriggers: 1 }] }),
      players: [testPlayer("p1", { board: [regulateur] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: regulateur.instanceId }));
    // Avant : la Marée restait en Houle, Maintien consommé.
    expect(after.environment.tideState).toBe("tempete");
    expect(after.environment.pendingTideModifiers).toEqual([{ kind: "maintain", remainingTriggers: 1 }]);
  });
});

describe("Compas aux Aiguilles Noires : avancez, PUIS perdez 1 Raison", () => {
  it("en Houle avec la Seconde au Visage Pâle : la perte a lieu en Tempête, où le bouclier la réduit", () => {
    const compas = instance("compas-aux-aiguilles-noires", "p1", { turnsRemaining: 4 });
    const seconde = instance("second-au-visage-pale", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [compas, seconde], reason: 5 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId }));
    expect(after.environment.tideState).toBe("tempete");
    // Avant : la perte passait en Houle, bouclier inactif → 4.
    expect(p(after, "p1").reason).toBe(5);
  });

  it("Sabordé en Abysses : ni avancée ni perte", () => {
    const compas = instance("compas-aux-aiguilles-noires", "p1", { turnsRemaining: 4 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 2, tideOrientation: "descendante" }),
      players: [testPlayer("p1", { board: [compas], reason: 5 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId }));
    expect(after.environment.tideState).toBe("abysses");
    expect(p(after, "p1").reason).toBe(5);
  });
});

describe("Bouée de Rappel : en Calme, la Marée ne recule pas — et rien d'autre ne bouge", () => {
  it("la durée du Calme n'est pas remise à neuf", () => {
    const bouee = instance("bouee-de-rappel", "p1", { turnsRemaining: 4 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 1 }),
      players: [testPlayer("p1", { board: [bouee] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: bouee.instanceId }));
    expect(after.environment.tideState).toBe("calme");
    expect(after.environment.tideRemainingTurns).toBe(1);
  });
});

describe("Sept Brasses Plus Bas : « augmentez de 1 tour sa durée RESTANTE »", () => {
  it("déjà en Abysses avec 1 tour restant : 2 tours, pas la durée par défaut + 1", () => {
    const sept = instance("sept-brasses-plus-bas", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 1, tideOrientation: "descendante" }),
      players: [testPlayer("p1", { hand: [sept], reason: 10 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: sept.instanceId }));
    expect(after.environment.tideState).toBe("abysses");
    expect(after.environment.tideRemainingTurns).toBe(2);
  });
});

describe("Wood Vy : la Structure PERD de la Résistance, puis en récupère 1", () => {
  it("dégâts de Marée en Tempête : le coup est consigné, puis rendu", () => {
    const wood = instance("wood-vy", "p2");
    const horloge = instance("horloge-de-maree", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 3 }),
      players: [
        testPlayer("p1", { deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath", board: [wood, horloge], deck: [instance("murene-aveugle", "p2")] }),
      ],
    });
    const after = ok(dispatch(state, { type: "endTurn", playerId: "p1" }));
    // Avant : la Marée ne consultait pas Wood Vy — 1 dégât marqué.
    expect(unit(after, horloge.instanceId)!.damageMarked).toBe(0);
    const log = after.eventLog.filter((e) => ("targetInstanceId" in e ? e.targetInstanceId : undefined) === horloge.instanceId);
    expect(log.map((e) => e.type)).toEqual(["DAMAGE", "HEAL"]);
  });

  it("dégâts de combat : le DAMAGE est émis en entier, la restauration suit", () => {
    const wood = instance("wood-vy", "p2");
    const horloge = instance("horloge-de-maree", "p2", { turnsRemaining: 3 });
    const guetteur = instance("guetteur-mefiant", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [guetteur] }), testPlayer("p2", { shipId: "le-goliath", board: [wood, horloge] })],
    });
    const declared = ok(dispatch({ ...state, phase: "combatPhase" }, { type: "attack", playerId: "p1", attackerInstanceId: guetteur.instanceId, defenderInstanceId: horloge.instanceId }));
    const after = declared.pendingReaction ? ok(dispatch(declared, { type: "passReaction", playerId: declared.pendingReaction.awaitingPlayerId })) : declared;
    expect(unit(after, horloge.instanceId)!.damageMarked).toBe(1);
    const coups = after.eventLog.filter((e) => e.type === "DAMAGE" && e.targetInstanceId === horloge.instanceId);
    expect(coups.map((e) => (e.type === "DAMAGE" ? e.amount : 0))).toEqual([2]);
  });
});
