/**
 * Audit du catalogue, seconde passe (2026-09-16) : les dix cartes qui
 * demandaient de nouvelles primitives — Contrecoup, taxe de Bris, report de
 * Marée, choix au Sabordage, passage immédiat, Sabordage forcé, « seule
 * Créature », Pied marin temporaire — et les textes réécrits (Théâtre,
 * Rappel du Public, Arlecchino abyssal).
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { previewHandBreakReason } from "@/game/actions/breakObject";
import { graveyardChoicesForBreak } from "@/game/effects/graveyardChoices";
import { getCardDefinition } from "@/game/cards/sets/core";
import { processDeaths } from "@/game/state/processDeaths";
import { processTrigger } from "@/game/triggers/triggerBus";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import { assertUnitCanAttack, hasEffectiveKeyword, hasKeywordInContext, KEYWORD_PIED_MARIN } from "@/game/rules/validation";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

const STRUCTURE = "le-trone-de-bouchon"; // Structure toujours visible, sans capacité
const OBJET = "cartes-des-courants"; // Objet coût 2, sans cible ni Raison en jeu

function filler(ownerId: string) {
  return [instance("marin-des-jetees", ownerId), instance("marin-des-jetees", ownerId)];
}
function board(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!.board;
}
function player(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!;
}
function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
}
function candidates(state: GameState) {
  const pending = state.pendingReaction;
  if (!pending) return [];
  return eligibleCandidatesFor(state, pending.events, pending.awaitingPlayerId, pending.turnNumber, pending.usedCandidateKeys);
}

describe("Cylindre flottant — Contrecoup", () => {
  it("SUSPEND l'attaque et propose le piège, sans rien appliquer d'office", () => {
    const attacker = instance("baleine-aux-cicatrices-blanches", "p1"); // 5 Puissance
    const cylindre = instance("cylindre-flottant", "p2"); // visible en Houle
    const cible = instance("murene-aveugle", "p1"); // le permanent adverse à frapper
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [attacker, cible], anchor: 20 }),
        testPlayer("p2", { board: [cylindre], anchor: 20 }),
      ],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    ok(declaree);
    // Rien n'est encore arrivé : l'attaque attend la réponse du défenseur.
    expect(declaree.state.pendingAttack).toBeDefined();
    expect(declaree.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    expect(player(declaree.state, "p2").anchor).toBe(20);
    expect(board(declaree.state, "p2")).toHaveLength(1);
  });

  it("activé, il annule les dégâts, frappe le permanent désigné, et se détruit", () => {
    const attacker = instance("baleine-aux-cicatrices-blanches", "p1"); // 5 Puissance
    const cylindre = instance("cylindre-flottant", "p2");
    const cible = instance("murene-aveugle", "p1");
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [attacker, cible], anchor: 20 }),
        testPlayer("p2", { board: [cylindre], anchor: 20 }),
      ],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    ok(declaree);
    const active = activateReactionFor(declaree.state, "cylindre-flottant", cible.instanceId);
    ok(active);

    expect(player(active.state, "p2").anchor).toBe(20); // coque intacte
    expect(active.events.some((e) => e.type === "ATTACK_INTERCEPTED")).toBe(true);
    // L'attaque reprend et se termine : plus rien en suspens.
    expect(active.state.pendingAttack).toBeUndefined();
    // Le Cylindre s'est détruit, et la cible a pris les 5 Puissance.
    expect(board(active.state, "p2")).toHaveLength(0);
    expect(board(active.state, "p1").some((u) => u.instanceId === cible.instanceId)).toBe(false);
  });

  it("passé, l'attaque reprend et porte normalement", () => {
    const attacker = instance("baleine-aux-cicatrices-blanches", "p1"); // 5 Puissance
    const cylindre = instance("cylindre-flottant", "p2");
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [attacker], anchor: 20 }), testPlayer("p2", { board: [cylindre], anchor: 20 })],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    ok(declaree);
    const passe = dispatch(declaree.state, { type: "passReaction", playerId: "p2" });
    ok(passe);

    expect(player(passe.state, "p2").anchor).toBe(15); // les 5 dégâts portent
    expect(passe.state.pendingAttack).toBeUndefined();
    expect(board(passe.state, "p2")).toHaveLength(1); // le Cylindre reste en jeu
  });

  it("ne fait rien tant qu'il est invisible (Calme)", () => {
    const attacker = instance("baleine-aux-cicatrices-blanches", "p1");
    const cylindre = instance("cylindre-flottant", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker], anchor: 20 }), testPlayer("p2", { board: [cylindre], anchor: 20 })],
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    ok(result);
    expect(player(result.state, "p2").anchor).toBe(15);
    expect(player(result.state, "p1").anchor).toBe(20);
    expect(board(result.state, "p2")).toHaveLength(1);
  });
});

describe("Cloche d'Alerte — taxe sur le Bris adverse", () => {
  it("le premier Bris adverse du tour coûte 1 Raison de plus, depuis le plateau comme depuis la main", () => {
    const cloche = instance("cloche-dalerte", "p2"); // visible en Calme
    const onBoard = instance(OBJET, "p1");
    const inHand = instance(OBJET, "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [onBoard], hand: [inHand], reason: 6 }), testPlayer("p2", { board: [cloche] })],
    });

    // Depuis la main : demi-coût (1) + taxe (1) = 2, annoncé tel quel à l'UI.
    expect(previewHandBreakReason(state, "p1", inHand.instanceId)?.cost).toBe(2);

    const first = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: onBoard.instanceId });
    ok(first);
    expect(player(first.state, "p1").reason).toBe(5); // Bris du plateau : gratuit + taxe 1

    // La Cloche est consommée pour le tour : le second Bris ne paie que son demi-coût.
    expect(previewHandBreakReason(first.state, "p1", inHand.instanceId)?.cost).toBe(1);
    const second = dispatch(first.state, { type: "breakObject", playerId: "p1", instanceId: inHand.instanceId, fromHand: true });
    ok(second);
    expect(player(second.state, "p1").reason).toBe(4);
  });

  it("ne taxe pas son propre contrôleur", () => {
    const cloche = instance("cloche-dalerte", "p1");
    const onBoard = instance(OBJET, "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [cloche, onBoard], reason: 6 }), testPlayer("p2")] });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: onBoard.instanceId });
    ok(result);
    expect(player(result.state, "p1").reason).toBe(6);
  });
});

describe("Ancre de Dérive — report des effets de Marée", () => {
  it("au changement de Marée, se Saborde et reporte les dégâts de la nouvelle Marée à la fin du tour en cours", () => {
    const ancre = instance("ancre-de-derive", "p1"); // visible en Houle et Tempête
    const state = testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
      // p2 : L'Errant, sans résistance à la Tempête (1 dégât par tour).
      players: [testPlayer("p1", { board: [ancre], deck: filler("p1") }), testPlayer("p2", { shipId: "lerrant", deck: filler("p2"), anchor: 20 })],
    });
    const entered = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(entered);
    expect(entered.state.environment.tideState).toBe("tempete");
    expect(player(entered.state, "p2").anchor).toBe(20); // reporté
    expect(entered.state.environment.deferredTideEffects?.tideState).toBe("tempete");
    expect(board(entered.state, "p1")).toHaveLength(0);
    expect(player(entered.state, "p1").graveyard.find((u) => u.instanceId === ancre.instanceId)?.graveyardCause).toBe("scuttled");

    // Fin du tour en cours (celui de p2) : les effets reportés s'appliquent
    // (-1), puis le tour suivant commence en Tempête et inflige son propre
    // dégât de tour (-1) — comme sans Ancre, un tour plus tard.
    const ended = dispatch(entered.state, { type: "endTurn", playerId: "p2" });
    ok(ended);
    expect(ended.state.environment.deferredTideEffects).toBeUndefined();
    expect(player(ended.state, "p2").anchor).toBe(18);
    expect(ended.events.filter((e) => e.type === "DAMAGE" && e.targetPlayerId === "p2")).toHaveLength(2);
  });

  it("sans Ancre, les dégâts de la nouvelle Marée s'appliquent immédiatement", () => {
    const state = testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
      players: [testPlayer("p1", { deck: filler("p1") }), testPlayer("p2", { shipId: "lerrant", deck: filler("p2"), anchor: 20 })],
    });
    const entered = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(entered);
    expect(player(entered.state, "p2").anchor).toBe(19);
  });
});

describe("Horloge de Marée — choix au Sabordage", () => {
  it("ouvre un choix entre réduire de 2 tours et augmenter d'1 tour, puis résout l'option désignée", () => {
    const horloge = instance("horloge-de-maree", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [horloge] }), testPlayer("p2")],
    });
    const saborded = dispatch(state, { type: "saborder", playerId: "p1", instanceId: horloge.instanceId });
    ok(saborded);
    expect(saborded.state.environment.tideRemainingTurns).toBe(4); // rien ne s'est encore résolu
    const choice = saborded.state.pendingChoice;
    expect(choice?.kind).toBe("abilityOption");
    if (choice?.kind !== "abilityOption") return;
    expect(choice.playerId).toBe("p1");
    expect(choice.abilityIndexes).toEqual([0, 1]);

    // Toute autre action est bloquée tant que le choix est ouvert.
    expect(dispatch(saborded.state, { type: "endTurn", playerId: "p1" }).ok).toBe(false);

    const extended = dispatch(saborded.state, { type: "resolveChoice", playerId: "p1", choice: { abilityIndex: 1 } });
    ok(extended);
    expect(extended.state.environment.tideRemainingTurns).toBe(5);
    expect(extended.state.pendingChoice).toBeUndefined();

    const reduced = dispatch(saborded.state, { type: "resolveChoice", playerId: "p1", choice: { abilityIndex: 0 } });
    ok(reduced);
    expect(reduced.state.environment.tideRemainingTurns).toBe(2);

    // Une option hors du groupe est refusée.
    expect(dispatch(saborded.state, { type: "resolveChoice", playerId: "p1", choice: { abilityIndex: 5 } }).ok).toBe(false);
    expect(dispatch(saborded.state, { type: "resolveChoice", playerId: "p1", choice: "reasonLoss" }).ok).toBe(false);
  });
});

describe("Régulateur de Courant — passage immédiat", () => {
  it("si la réduction fait tomber la durée à 0, la Marée passe immédiatement à l'état suivant", () => {
    const regulateur = instance("regulateur-de-courant", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
      players: [testPlayer("p1", { board: [regulateur] }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: regulateur.instanceId });
    ok(result);
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.events.some((e) => e.type === "TIDE_ADVANCED" && e.stateChanged)).toBe(true);
  });

  it("sinon, réduit simplement la durée d'1 tour", () => {
    const regulateur = instance("regulateur-de-courant", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [regulateur] }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: regulateur.instanceId });
    ok(result);
    expect(result.state.environment.tideState).toBe("houle");
    expect(result.state.environment.tideRemainingTurns).toBe(2);
  });
});

describe("Levier de Lest — Sabordage conjoint d'une Structure", () => {
  it("exige de Saborder une de ses Structures : sans cible légale, le Bris est refusé", () => {
    const levier = instance("levier-de-lest", "p1");
    const structure = instance(STRUCTURE, "p1");
    const creature = instance("requin-balafre", "p1");
    const enemyStructure = instance(STRUCTURE, "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [levier, structure, creature], reason: 5, anchor: 20 }),
        testPlayer("p2", { board: [enemyStructure] }),
      ],
    });

    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: levier.instanceId }).ok).toBe(false);
    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: levier.instanceId, targetInstanceId: creature.instanceId }).ok).toBe(false);
    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: levier.instanceId, targetInstanceId: enemyStructure.instanceId }).ok).toBe(false);

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: levier.instanceId, targetInstanceId: structure.instanceId });
    ok(result);
    expect(board(result.state, "p1").map((u) => u.instanceId)).toEqual([creature.instanceId]);
    expect(player(result.state, "p1").graveyard.find((u) => u.instanceId === structure.instanceId)?.graveyardCause).toBe("scuttled");
    expect(player(result.state, "p1").reason).toBe(6);
    expect(player(result.state, "p1").anchor).toBe(21);
    expect(result.events.some((e) => e.type === "SABORDED" && e.instanceId === structure.instanceId)).toBe(true);
  });

  it("le Sabordage forcé réveille les observateurs (Plongeur des Épaves)", () => {
    const levier = instance("levier-de-lest", "p1");
    const structure = instance(STRUCTURE, "p1");
    const plongeur = instance("plongeur-des-epaves", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [levier, structure, plongeur], reason: 5 }), testPlayer("p2")] });
    const broken = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: levier.instanceId, targetInstanceId: structure.instanceId });
    ok(broken);
    expect(player(broken.state, "p1").reason).toBe(6); // +1 du Levier
    // Le Plongeur PROPOSE sa Raison : le Sabordage forcé ouvre bien sa fenêtre.
    const result = activateReactionFor(broken.state, "plongeur-des-epaves");
    ok(result);
    expect(player(result.state, "p1").reason).toBe(7);
  });
});

describe("Méduse des Lanternes — devient votre seule Créature", () => {
  it("récupère 1 Raison quand l'autre Créature quitte le board, pas quand un Marin part", () => {
    const meduse = instance("meduse-des-lanternes", "p1");
    const other = instance("requin-balafre", "p1");
    const marin = instance("marin-des-jetees", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [meduse, other, marin], reason: 5 }), testPlayer("p2")] });

    const marinGone = dispatch(state, { type: "saborder", playerId: "p1", instanceId: marin.instanceId });
    ok(marinGone);
    expect(player(marinGone.state, "p1").reason).toBe(5); // deux Créatures restent

    const alone = dispatch(marinGone.state, { type: "saborder", playerId: "p1", instanceId: other.instanceId });
    ok(alone);
    expect(player(alone.state, "p1").reason).toBe(6);
  });

  it("se déclenche aussi quand elle arrive seule sur un plateau sans Créature", () => {
    const meduse = instance("meduse-des-lanternes", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [meduse], reason: 5 }), testPlayer("p2")] });
    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: meduse.instanceId });
    ok(played);
    expect(player(played.state, "p1").reason).toBe(5 - 2 + 1);
  });
});

describe("Arlecchino, Celui derrière le Masque — +2 / +2 quand il renvoie une Marionnette", () => {
  it("renvoyer une autre Marionnette alliée lui donne +2 / +2 jusqu'à votre prochain tour", () => {
    const arlecchino = instance("arlecchino-celui-derriere-le-masque-abyssal", "p1");
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [arlecchino], board: [pulcinella], reason: 10 }), testPlayer("p2")] });
    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: arlecchino.instanceId });
    ok(played);
    const candidate = candidates(played.state).find((c) => c.cardId === arlecchino.cardId);
    expect(candidate).toBeDefined();
    const activated = dispatch(played.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: arlecchino.instanceId,
      abilityIndex: candidate!.abilityIndex,
      targetInstanceId: pulcinella.instanceId,
    });
    ok(activated);
    expect(player(activated.state, "p1").hand.some((c) => c.cardId === "pulcinella-gonfle")).toBe(true);
    const unit = board(activated.state, "p1").find((u) => u.instanceId === arlecchino.instanceId)!;
    expect(computeEffectiveStats(unit, "calme")).toMatchObject({ attack: 6, health: 6 });
  });
});

describe("P'tite Fesse, Grand Rêve abyssale — Pied marin jusqu'à la fin du tour", () => {
  it("peut attaquer le tour de son arrivée après le gain de Puissance d'un autre Cra-Poiscail, puis perd le mot-clé", () => {
    const fesse = instance("ptite-fesse-grand-reve-abyssal", "p1", { summoningSick: true });
    const ally = instance("tetard-fesse", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [fesse, ally], deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })] });
    expect(assertUnitCanAttack(state, "p1", fesse.instanceId).ok).toBe(false);

    const triggered = processTrigger(state, { trigger: "onPowerGained", playerId: "p1", cardId: ally.cardId, sourceInstanceId: ally.instanceId }, 1);
    const p1 = player(triggered.state, "p1");
    const unit = p1.board.find((u) => u.instanceId === fesse.instanceId)!;
    expect(hasEffectiveKeyword(triggered.state, p1, unit, KEYWORD_PIED_MARIN)).toBe(true);
    expect(assertUnitCanAttack(triggered.state, "p1", fesse.instanceId).ok).toBe(true);
    expect(computeEffectiveStats(unit, "calme").attack).toBe(4);

    // Fin du tour : le modificateur tombe, le mot-clé avec lui.
    const ended = dispatch(triggered.state, { type: "endTurn", playerId: "p1" });
    ok(ended);
    const after = player(ended.state, "p1");
    expect(hasEffectiveKeyword(ended.state, after, after.board.find((u) => u.instanceId === fesse.instanceId)!, KEYWORD_PIED_MARIN)).toBe(false);
  });
});

describe("Théâtre Englouti et Cra-Poiscail — écarts relevés le 17/09/2026", () => {
  it("Pantalone Sans-Sou : rembourse 1 Raison au premier Bris depuis la MAIN, une fois par tour, jamais sur un Bris du plateau", () => {
    const setup = (withPantalone: boolean) => {
      const first = instance(OBJET, "p1");
      const second = instance(OBJET, "p1");
      const onBoard = instance(OBJET, "p1");
      const board = withPantalone ? [instance("pantalone-sans-sou", "p1"), onBoard] : [onBoard];
      return {
        first,
        second,
        onBoard,
        state: testGameState({ players: [testPlayer("p1", { board, hand: [first, second], reason: 6 }), testPlayer("p2")] }),
      };
    };

    const withP = setup(true);
    const without = setup(false);
    const a = dispatch(withP.state, { type: "breakObject", playerId: "p1", instanceId: withP.first.instanceId, fromHand: true });
    const b = dispatch(without.state, { type: "breakObject", playerId: "p1", instanceId: without.first.instanceId, fromHand: true });
    ok(a);
    ok(b);
    expect(player(a.state, "p1").reason).toBe(player(b.state, "p1").reason + 1);

    // Une fois par tour : le second Bris depuis la main ne rembourse plus.
    const second = dispatch(a.state, { type: "breakObject", playerId: "p1", instanceId: withP.second.instanceId, fromHand: true });
    ok(second);
    expect(player(second.state, "p1").reason).toBe(player(a.state, "p1").reason - 1);

    // Un Bris depuis le PLATEAU ne rembourse rien (sinon les Objets posés seraient gratuits).
    const boardCase = setup(true);
    const fromBoard = dispatch(boardCase.state, { type: "breakObject", playerId: "p1", instanceId: boardCase.onBoard.instanceId });
    ok(fromBoard);
    expect(player(fromBoard.state, "p1").reason).toBe(6);
  });

  it("Pulcinella Gonflé : mort, le joueur désigne une Créature ennemie à blesser, jamais un Marin", () => {
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const marin = instance("marin-des-jetees", "p2");
    const creature = instance("requin-balafre", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { board: [pulcinella] }), testPlayer("p2", { board: [marin, creature] })],
    });
    // Pulcinella meurt d'une action du joueur : c'est `dispatch` qui ouvre
    // la fenêtre, et la cible est désignée depuis le cimetière.
    const dead = dispatch({ ...state, phase: "mainPhase" }, { type: "saborder", playerId: "p1", instanceId: pulcinella.instanceId });
    ok(dead);
    expect(board(dead.state, "p1")).toHaveLength(0);
    const result = activateReactionFor(dead.state, "pulcinella-gonfle", creature.instanceId);
    ok(result);
    expect(board(result.state, "p2").find((u) => u.instanceId === marin.instanceId)!.damageMarked).toBe(0);
    expect(board(result.state, "p2").find((u) => u.instanceId === creature.instanceId)!.damageMarked).toBe(1);
  });

  it("Rappel du Public : ne propose que des Marionnettes du Cimetière, et refuse une autre carte", () => {
    const rappel = instance("rappel-du-public", "p1");
    const marionnette = instance("pulcinella-gonfle", "p1");
    const autre = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [rappel], graveyard: [autre, marionnette], reason: 5 }), testPlayer("p2")],
    });

    const choices = graveyardChoicesForBreak(state, "p1", getCardDefinition(rappel.cardId));
    expect(choices.map((c) => c.instanceId)).toEqual([marionnette.instanceId]);

    expect(
      dispatch(state, { type: "breakObject", playerId: "p1", instanceId: rappel.instanceId, chosenGraveyardInstanceId: autre.instanceId }).ok
    ).toBe(false);

    const result = dispatch(state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: rappel.instanceId,
      chosenGraveyardInstanceId: marionnette.instanceId,
    });
    ok(result);
    expect(player(result.state, "p1").hand.map((c) => c.instanceId)).toEqual([marionnette.instanceId]);
  });

  it("La Quête du Grand Nénuphar : une attaque sans Destrier ne consomme pas le « une fois par tour »", () => {
    const quete = instance("la-quete-du-grand-nenuphar", "p1");
    const chevalier = instance("chevalier-cra-poiscail", "p1");
    const withoutDestrier = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [quete, chevalier], reason: 5 }), testPlayer("p2")],
    });
    const noPayout = dispatch(withoutDestrier, { type: "attack", playerId: "p1", attackerInstanceId: chevalier.instanceId });
    ok(noPayout);
    expect(player(noPayout.state, "p1").reason).toBe(5);
    // Le drapeau reste vierge : la condition n'était pas remplie.
    const queteAfter = board(noPayout.state, "p1").find((u) => u.instanceId === quete.instanceId)!;
    expect(queteAfter.oncePerTurnFlags?.queteChevalierAttack).toBeUndefined();

    const withDestrier = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [quete, chevalier, instance("destrier-du-grand-etang", "p1")], reason: 5 }),
        testPlayer("p2"),
      ],
    });
    const payout = dispatch(withDestrier, { type: "attack", playerId: "p1", attackerInstanceId: chevalier.instanceId });
    ok(payout);
    expect(player(payout.state, "p1").reason).toBe(6);
  });
});

describe("écarts moteur corrigés le 17/09/2026", () => {
  it("le bonus d'un Équipement disparaît avec lui", () => {
    const porteur = instance("requin-balafre", "p1"); // 4/2
    const harpon = instance("harpon-de-pont", "p1", { attachedToInstanceId: porteur.instanceId, damageMarked: 5 });
    const state = testGameState({ players: [testPlayer("p1", { board: [porteur, harpon] }), testPlayer("p2")] });
    const aura = (s: GameState) => {
      const owner = player(s, "p1");
      const unit = owner.board.find((u) => u.instanceId === porteur.instanceId)!;
      return computeEffectiveStats(unit, s.environment.tideState, {
        controllerBoard: owner.board,
        controllerReason: owner.reason,
        tideOrientation: s.environment.tideOrientation,
      }).attack;
    };
    expect(aura(state)).toBe(5); // 4 + 1 tant que le Harpon est attaché

    // Le Harpon meurt de ses propres dégâts : le porteur perd le bonus.
    const after = processDeaths(state, 1);
    expect(board(after.state, "p1").some((u) => u.instanceId === harpon.instanceId)).toBe(false);
    expect(aura(after.state)).toBe(4);
  });

  it("l'effet destroy passe par la voie de mort : onDeath et substitution s'appliquent", () => {
    // Plaque de Fortune sauve son porteur d'une destruction par effet.
    const porteur = instance("requin-balafre", "p1");
    const plaque = instance("plaque-de-fortune", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({ players: [testPlayer("p1", { board: [porteur, plaque] }), testPlayer("p2", { reason: 5 })] });
    const marked = {
      ...state,
      players: [
        { ...player(state, "p1"), board: [{ ...porteur, pendingRemoval: "destroyed" as const }, plaque] },
        player(state, "p2"),
      ] as GameState["players"],
    };
    const result = processDeaths(marked, 1);
    expect(board(result.state, "p1").some((u) => u.instanceId === porteur.instanceId)).toBe(true);
    expect(board(result.state, "p1").some((u) => u.instanceId === plaque.instanceId)).toBe(false);

    // Un Sabordage, lui, est un coût consenti : la Plaque ne l'esquive pas.
    const scuttled = {
      ...state,
      players: [
        { ...player(state, "p1"), board: [{ ...porteur, pendingRemoval: "scuttled" as const }, plaque] },
        player(state, "p2"),
      ] as GameState["players"],
    };
    const sabordeResult = processDeaths(scuttled, 1);
    expect(board(sabordeResult.state, "p1").some((u) => u.instanceId === porteur.instanceId)).toBe(false);
    expect(sabordeResult.events.some((e) => e.type === "SABORDED")).toBe(true);
  });

  it("Cage de Flottaison ne réduit que les dégâts d'une Créature, pas ceux d'un Marin", () => {
    const setup = (attackerId: string) => {
      const attacker = instance(attackerId, "p1");
      const cage = instance("cage-de-flottaison", "p2");
      return {
        attacker,
        state: testGameState({
          phase: "combatPhase",
          players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [cage], anchor: 20 })],
        }),
      };
    };
    const byCreature = setup("requin-balafre"); // Créature 4 Puissance
    const creatureResult = dispatch(byCreature.state, { type: "attack", playerId: "p1", attackerInstanceId: byCreature.attacker.instanceId });
    ok(creatureResult);
    expect(player(creatureResult.state, "p2").anchor).toBe(17); // 20 - (4 - 1)

    const bySailor = setup("harponneur-du-dernier-quai"); // Marin 3 Puissance
    const sailorResult = dispatch(bySailor.state, { type: "attack", playerId: "p1", attackerInstanceId: bySailor.attacker.instanceId });
    ok(sailorResult);
    expect(player(sailorResult.state, "p2").anchor).toBe(17); // 20 - 3, sans réduction
  });

  it("une Structure posée dans un état où elle est déjà visible déclenche son apparition", () => {
    const epave = instance("epave-engloutie", "p1"); // visible en Abysses, +2 Raison à l'apparition
    const state = testGameState({
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3, tideOrientation: "descendante" }),
      players: [testPlayer("p1", { hand: [epave], reason: 5 }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: epave.instanceId });
    ok(result);
    expect(result.events.some((e) => e.type === "STRUCTURE_REVEALED")).toBe(true);
    expect(player(result.state, "p1").reason).toBe(5 - 3 + 2); // coût 3, puis +2 Raison
  });

  it("la Baleine aux Cicatrices Blanches encaisse aussi le dégât de MALADE", () => {
    const baleine = instance("baleine-aux-cicatrices-blanches", "p1", { statuses: ["malade"] });
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 5 }),
      players: [testPlayer("p1", { board: [baleine], deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })],
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(board(result.state, "p1").find((u) => u.instanceId === baleine.instanceId)!.damageMarked).toBe(0);
  });
});

describe("variante Abyssale séparée du sous-type (17/09/2026)", () => {
  it("les Abyssales du Théâtre sont des Marionnettes, donc vues par leur troupe", () => {
    for (const id of ["arlecchino-celui-derriere-le-masque-abyssal", "le-regisseur-des-profondeurs-abyssal"]) {
      const def = getCardDefinition(id);
      expect(def.subtype).toBe("marionnette");
      expect(def.variant).toBe("abyssale");
    }

    // Le Théâtre Englouti rend 1 Raison quand une Marionnette alliée revient
    // en main : l'Arlecchino Abyssal en est une, il doit compter.
    const theatre = instance("le-theatre-englouti", "p1");
    const arlecchino = instance("arlecchino-celui-derriere-le-masque-abyssal", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [theatre, arlecchino], reason: 5 }), testPlayer("p2")] });
    const returned = processTrigger(
      state,
      { trigger: "onReturnedToHand", playerId: "p1", cardId: arlecchino.cardId, sourceInstanceId: arlecchino.instanceId },
      1
    );
    expect(player(returned.state, "p1").reason).toBe(6);
  });
});

describe("mots-clés effectifs pour l'affichage (17/09/2026)", () => {
  it("un Garde conditionnel est rapporté à partir du seul contexte de plateau", () => {
    const chose = instance("chose-des-hauts-fonds", "p1"); // Garde tant que Raison <= 5
    const context = (reason: number) => ({ tideState: "calme" as const, controllerBoard: [chose], controllerReason: reason });

    expect(hasKeywordInContext(chose, "garde", context(5))).toBe(true);
    expect(hasKeywordInContext(chose, "garde", context(6))).toBe(false);
    // Le mot-clé n'est pas imprimé : c'est précisément ce que l'affichage
    // ratait en ne lisant que `keywords`.
    expect(getCardDefinition(chose.cardId).keywords ?? []).not.toContain("garde");
  });

  it("un Garde transmis par un Équipement est rapporté aussi", () => {
    const porteur = instance("requin-balafre", "p1");
    const chaine = instance("chaine-de-fer-noir", "p1", { attachedToInstanceId: porteur.instanceId });
    expect(
      hasKeywordInContext(porteur, "garde", { tideState: "calme", controllerBoard: [porteur, chaine], controllerReason: 10 })
    ).toBe(true);
  });
});
