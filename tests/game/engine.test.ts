import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";
import type { GameState } from "@/game/state/types";

describe("engine.dispatch - phases", () => {
  it("refuse d'attaquer en Phase principale, autorise après `advancePhase`", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20 })],
    });

    const tooEarly = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(tooEarly.ok).toBe(false);

    const advanced = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    expect(advanced.state.phase).toBe("combatPhase");

    const attack = dispatch(advanced.state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(attack.ok).toBe(true);
  });

  it("refuse de jouer une carte/Saborder une fois en Phase de combat", () => {
    const card = instance("marin-des-jetees", "p1");
    const unit = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { hand: [card], board: [unit], reason: 10 }), testPlayer("p2")],
    });

    const playResult = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(playResult.ok).toBe(false);

    const saborderResult = dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId });
    expect(saborderResult.ok).toBe(false);
  });

  it("refuse `advancePhase` hors Phase principale ou pour un joueur non actif", () => {
    const state = testGameState({ phase: "combatPhase" });
    const wrongPhase = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(wrongPhase.ok).toBe(false);

    const mainPhaseState = testGameState({ phase: "mainPhase" });
    const wrongPlayer = dispatch(mainPhaseState, { type: "advancePhase", playerId: "p2" });
    expect(wrongPlayer.ok).toBe(false);
  });

  it("chaque nouveau tour recommence en Phase principale", () => {
    const state = testGameState({ phase: "combatPhase" });
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe("mainPhase");
  });
});

describe("engine.dispatch - playCard", () => {
  it("joue une créature : paie le coût en Raison, la place sur le plateau avec la maladie d'invocation", () => {
    const card = instance("murene-aveugle", "p1"); // coût 2, 3/1
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
    const card = instance("loeil-sous-la-mer", "p1"); // coût 6
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 2 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("refuse une seconde carte/action principale dans le même tour", () => {
    const first = instance("marin-des-jetees", "p1"); // coût 1
    const second = instance("murene-aveugle", "p1"); // coût 2
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

  it("une carte ne peut être jouée que dans l'état de Marée requis (`requiresTideState`)", () => {
    const card = instance("la-chose-qui-remonte", "p1"); // ne peut être jouée que pendant Tempête/Abysses
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 10 }), testPlayer("p2")],
      // testGameState() par défaut est en Calme.
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("un onPlayEffect ciblé (chosenUnit) soigne bien l'unité choisie", () => {
    const carpenter = instance("charpentier-de-bord", "p1"); // à l'arrivée : la Structure choisie récupère 1 Résistance
    const structure = instance("caisses-arrimees", "p1", { damageMarked: 2 });
    const state = testGameState({
      players: [testPlayer("p1", { hand: [carpenter], board: [structure], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: carpenter.instanceId,
      targetInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const healedStructure = result.state.players[0].board.find((u) => u.instanceId === structure.instanceId);
    expect(healedStructure?.damageMarked).toBe(1);
  });

  it("un onPlayEffect inflige une perte de Raison aux deux joueurs", () => {
    const card = instance("marin-aux-yeux-rouges", "p1"); // à l'arrivée : chaque joueur perd 1 Raison
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2", { reason: 5 })],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 a payé 2 de coût (5 -> 3) puis perdu 1 de Raison via l'effet (-> 2).
    expect(result.state.players[0].reason).toBe(2);
    expect(result.state.players[1].reason).toBe(4);
  });
});

describe("engine.dispatch - breakObject", () => {
  it("brise un Objet contrôlé : résout onBreakEffects, l'envoie au cimetière, sans déclencher onDeath/onSaborde", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1"); // Brisez : récupérez 2 Raison
    const state = testGameState({
      players: [testPlayer("p1", { board: [thermos], reason: 3 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: thermos.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard).toHaveLength(1);
    expect(p1.reason).toBe(5);
    expect(p1.hasUsedMainActionThisTurn).toBe(true);
    expect(result.events.some((e) => e.type === "SABORDED")).toBe(false);
  });

  it("refuse de briser une carte qui n'est pas un Objet", () => {
    const structure = instance("caisses-arrimees", "p1"); // Structure, pas un Objet
    const state = testGameState({
      players: [testPlayer("p1", { board: [structure] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: structure.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - saborder", () => {
  it("détruit son propre permanent, consomme l'action principale et déclenche onSaborde", () => {
    const structure = instance("caisses-arrimees", "p1"); // Sabordage : récupérez 2 Ancrage
    const state = testGameState({
      players: [testPlayer("p1", { board: [structure], anchor: 20 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: structure.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard).toHaveLength(1);
    expect(p1.hasUsedMainActionThisTurn).toBe(true);
    expect(p1.anchor).toBe(22);
    expect(result.events.some((e) => e.type === "SABORDED")).toBe(true);
  });

  it("refuse de saborder une carte qui n'est pas sur son propre plateau", () => {
    const unit = instance("murene-aveugle", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [unit] })],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - attack", () => {
  it("une attaque directe inflige les dégâts au joueur adverse", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(16);
  });

  it("seuls les Marins et Créatures peuvent attaquer (pas une Structure/un Objet)", () => {
    const structure = instance("caisses-arrimees", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [structure] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: structure.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Coque légère (Le Courlis) : une attaque directe contre son Navire lui inflige +1 dégât", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [attacker] }),
        testPlayer("p2", { shipId: "le-courlis", anchor: 17 }),
      ],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 4 d'attaque + 1 de faiblesse "Coque légère" = 5 dégâts.
    expect(result.state.players[1].anchor).toBe(12);
  });

  it("refuse d'attaquer avec une unité malade d'invocation", () => {
    const attacker = instance("requin-balafre", "p1", { summoningSick: true });
    const state = testGameState({ phase: "combatPhase", players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2")] });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(false);
  });

  it("refuse une seconde attaque de la même unité dans le même tour", () => {
    const attacker = instance("requin-balafre", "p1");
    const state = testGameState({ phase: "combatPhase", players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2")] });

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
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const defender = instance("murene-aveugle", "p2"); // 3/1
    const state = testGameState({
      phase: "combatPhase",
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
    // Le défenseur (1 PV) meurt sous 4 dégâts ; l'attaquant ne subit AUCUN
    // dégât en retour (règle verrouillée : pas de riposte automatique).
    expect(result.state.players[1].board).toHaveLength(0);
    expect(result.state.players[0].board[0]?.damageMarked).toBe(0);
  });

  it("Garde : une attaque directe visant le Navire est refusée tant qu'un porteur de Garde est en jeu", () => {
    const guard = instance("crabe-de-fer", "p2"); // porte le mot-clé "garde"
    const attacker = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
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
    const deckCard = instance("marin-des-jetees", "p2");
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
    const frozenUnit = instance("murene-aveugle", "p2", { summoningSick: true, hasAttackedThisTurn: true });
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

  it("une Structure/un Objet à durée limitée expire (quitte le board) quand son compteur atteint 0", () => {
    const radeau = instance("radeau-de-fortune", "p2", { turnsRemaining: 1 }); // durée 3, onExpire : +1 Ancrage
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [radeau], anchor: 15 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p2 = result.state.players[1];
    expect(p2.board).toHaveLength(0);
    expect(p2.graveyard).toHaveLength(1);
    expect(p2.anchor).toBe(16);
  });
});

describe("engine.dispatch - condition de victoire", () => {
  it("termine la partie quand un joueur tombe à 0 point d'Ancrage", () => {
    const attacker = instance("loeil-sous-la-mer", "p1"); // 5/7
    const state: GameState = testGameState({
      phase: "combatPhase",
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

describe("engine.dispatch - endTurn : défausse forcée (RULES.MAX_HAND_SIZE)", () => {
  it("défausse les cartes excédentaires du joueur qui termine son tour, depuis le début de sa main", () => {
    const keepCard = instance("murene-aveugle", "p1");
    const discardedCard = instance("murene-aveugle", "p1");
    const hand = [discardedCard, ...Array.from({ length: 6 }, () => instance("murene-aveugle", "p1")), keepCard];
    const state = testGameState({
      players: [testPlayer("p1", { hand }), testPlayer("p2")],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toHaveLength(7);
    expect(p1.hand.some((c) => c.instanceId === discardedCard.instanceId)).toBe(false);
    expect(p1.hand.some((c) => c.instanceId === keepCard.instanceId)).toBe(true);
    expect(p1.graveyard.some((c) => c.instanceId === discardedCard.instanceId)).toBe(true);
    expect(
      result.events.some((e) => e.type === "CARD_MOVED" && e.instanceId === discardedCard.instanceId && e.toZone === "graveyard")
    ).toBe(true);
  });

  it("ne défausse rien si la main ne dépasse pas la limite", () => {
    const hand = Array.from({ length: 7 }, () => instance("murene-aveugle", "p1"));
    const state = testGameState({
      players: [testPlayer("p1", { hand }), testPlayer("p2")],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toHaveLength(7);
    expect(result.events.some((e) => e.type === "CARD_MOVED")).toBe(false);
  });
});
