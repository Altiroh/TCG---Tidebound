import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";
import type { GameState } from "@/game/state/types";

describe("engine.dispatch - playCard", () => {
  it("joue une créature : paie le coût en Raison, la place sur le plateau avec la maladie d'invocation", () => {
    const card = instance("lancier-cotier", "p1"); // coût 2, 2/2
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [card], reason: 5, reasonMax: 10 }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.hand).toHaveLength(0);
    expect(p1.board).toHaveLength(1);
    expect(p1.board[0]?.summoningSick).toBe(true);
    expect(p1.reason).toBe(3);
    expect(p1.hasUsedMainActionThisTurn).toBe(true);
    expect(result.events.some((e) => e.type === "SUMMON")).toBe(true);
  });

  it("refuse de jouer une carte si la Raison est insuffisante", () => {
    const card = instance("leviathan-abyssal", "p1"); // coût 6
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 2 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("refuse une seconde carte/action principale dans le même tour", () => {
    const first = instance("recrue-des-marees", "p1"); // coût 1
    const second = instance("lancier-cotier", "p1"); // coût 2
    const state = testGameState({
      players: [testPlayer("p1", { hand: [first, second], reason: 10 }), testPlayer("p2")],
    });

    const firstResult = dispatch(state, { type: "playCard", playerId: "p1", instanceId: first.instanceId });
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;

    const secondResult = dispatch(firstResult.state, {
      type: "playCard",
      playerId: "p1",
      instanceId: second.instanceId,
    });
    expect(secondResult.ok).toBe(false);
  });

  it("une Action de dégâts inflige bien des dégâts à la cible choisie", () => {
    const action = instance("vague-destructrice", "p1"); // coût 2, 3 dégâts
    const enemyUnit = instance("lancier-cotier", "p2"); // 2/2
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [action], reason: 5 }),
        testPlayer("p2", { board: [enemyUnit] }),
      ],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: action.instanceId,
      targetInstanceId: enemyUnit.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 dégâts >= 2 PV : l'unité meurt et part au cimetière.
    const p2 = result.state.players[1];
    expect(p2.board).toHaveLength(0);
    expect(p2.graveyard).toHaveLength(1);
    expect(result.events.some((e) => e.type === "DESTROY")).toBe(true);
  });

  it("un onPlayEffect de pioche ajoute bien une carte à la main", () => {
    const veteran = instance("veterane-des-brisants", "p1"); // à l'arrivée : piochez 1
    const deckCard = instance("recrue-des-marees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [veteran], deck: [deckCard], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: veteran.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.hand).toHaveLength(1);
    expect(p1.deck).toHaveLength(0);
  });
});

describe("engine.dispatch - saborder", () => {
  it("détruit son propre permanent et consomme l'action principale", () => {
    const unit = instance("lancier-cotier", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [unit] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard).toHaveLength(1);
    expect(p1.hasUsedMainActionThisTurn).toBe(true);
    expect(result.events.some((e) => e.type === "SABORDED")).toBe(true);
  });

  it("refuse de saborder une carte qui n'est pas sur son propre plateau", () => {
    const unit = instance("lancier-cotier", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [unit] })],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - attack", () => {
  it("une attaque directe inflige les dégâts au joueur adverse", () => {
    const attacker = instance("predateur-des-vagues", "p1"); // 4/3
    const state = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(16);
  });

  it("refuse d'attaquer avec une unité malade d'invocation", () => {
    const attacker = instance("predateur-des-vagues", "p1", { summoningSick: true });
    const state = testGameState({ players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2")] });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(false);
  });

  it("refuse une seconde attaque de la même unité dans le même tour", () => {
    const attacker = instance("predateur-des-vagues", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2")] });

    const first = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = dispatch(first.state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
    });
    expect(second.ok).toBe(false);
  });

  it("un combat unité contre unité n'inflige des dégâts qu'au défenseur (pas de riposte automatique)", () => {
    const attacker = instance("predateur-des-vagues", "p1"); // 4/3
    const defender = instance("lancier-cotier", "p2"); // 2/2
    const state = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [defender] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: defender.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Le défenseur (2 PV) meurt sous 4 dégâts ; l'attaquant ne subit AUCUN
    // dégât en retour (règle verrouillée : pas de riposte automatique).
    expect(result.state.players[1].board).toHaveLength(0);
    expect(result.state.players[0].board[0]?.damageMarked).toBe(0);
  });

  it("déclenche la capacité onDeath quand l'unité meurt au combat", () => {
    // Sentinelle du Récif (1/4) : à la mort, inflige 1 dégât au joueur adverse.
    const sentinel = instance("sentinelle-du-recif", "p2");
    const bigAttacker = instance("leviathan-abyssal", "p1"); // 6/6, tue la sentinelle (4 PV)
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [bigAttacker] }),
        testPlayer("p2", { board: [sentinel], anchor: 20 }),
      ],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: bigAttacker.instanceId,
      defenderInstanceId: sentinel.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // La sentinelle meurt et son onDeath inflige 1 dégât... à l'adversaire de
    // son contrôleur (p2), donc p1. p1 est sur Le Brise-Lames (24 Ancrage de
    // départ) : 24 - 1 = 23.
    expect(result.state.players[0].anchor).toBe(23);
  });

  it("Garde : une attaque directe visant le Navire est refusée tant qu'un porteur de Garde est en jeu", () => {
    const guard = instance("sentinelle-du-recif", "p2"); // porte le mot-clé "garde"
    const attacker = instance("predateur-des-vagues", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard] })],
    });

    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(direct.ok).toBe(false);

    const redirected = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: guard.instanceId,
    });
    expect(redirected.ok).toBe(true);
  });
});

describe("engine.dispatch - endTurn", () => {
  it("passe la main au joueur suivant, régénère 1 Raison et pioche", () => {
    const deckCard = instance("recrue-des-marees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { reasonMax: 10, reason: 5 }),
        testPlayer("p2", { reasonMax: 10, reason: 5, deck: [deckCard] }),
      ],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.activePlayerId).toBe("p2");
    expect(result.state.players[1].reason).toBe(6);
    expect(result.state.players[1].hand).toHaveLength(1);
    expect(result.state.turnNumber).toBe(2);
  });

  it("dégèle les unités et réinitialise l'action principale du joueur qui redevient actif", () => {
    const frozenUnit = instance("lancier-cotier", "p2", { summoningSick: true, hasAttackedThisTurn: true });
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [frozenUnit], hasUsedMainActionThisTurn: true })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unit = result.state.players[1].board[0];
    expect(unit?.summoningSick).toBe(false);
    expect(unit?.hasAttackedThisTurn).toBe(false);
    expect(result.state.players[1].hasUsedMainActionThisTurn).toBe(false);
  });

  it("perd 1 Ancrage si la Raison est à 0 au début du tour", () => {
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { reason: 0, anchor: 18 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(17);
    // La régénération de +1 Raison s'applique quand même après la perte d'Ancrage.
    expect(result.state.players[1].reason).toBe(1);
  });

  it("refuse de terminer le tour si ce n'est pas le tour du joueur", () => {
    const state = testGameState({ activePlayerId: "p1" });
    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - condition de victoire", () => {
  it("termine la partie quand un joueur tombe à 0 point d'Ancrage", () => {
    const attacker = instance("leviathan-abyssal", "p1"); // 6/6
    const state: GameState = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 5 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.status).toBe("finished");
    expect(result.state.winnerId).toBe("p1");
    expect(result.events.some((e) => e.type === "DESTROY" || e.type === "DAMAGE")).toBe(true);
  });

  it("Jugement de l'Océan : compare la Résilience quand un joueur pioche dans un deck vide", () => {
    const state = testGameState({
      players: [
        testPlayer("p1", { deck: [], anchor: 20, reason: 5 }),
        testPlayer("p2", { anchor: 10, reason: 2 }),
      ],
      activePlayerId: "p2",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 devient actif, pioche dans un deck vide : Résilience p1 (20+reason
    // régénérée) > Résilience p2 (10+2) => p1 gagne.
    expect(result.state.status).toBe("finished");
    expect(result.state.winnerId).toBe("p1");
    expect(result.events.some((e) => e.type === "OCEAN_JUDGMENT")).toBe(true);
  });
});
