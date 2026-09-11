import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
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
    expect(result.events.some((e) => e.type === "SUMMON")).toBe(true);
  });

  it("refuse de jouer une carte si la Raison est insuffisante", () => {
    const card = instance("loeil-sous-la-mer", "p1"); // coût 5
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 2 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("permet de jouer plusieurs cartes dans le même tour tant que la Raison le permet (pas de limite d'action)", () => {
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
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    const p1 = secondResult.state.players[0];
    expect(p1.board).toHaveLength(2);
    expect(p1.reason).toBe(7); // 10 - 1 - 2
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

  it("un onPlayEffect ciblé (chosenUnit) s'applique bien à l'unité choisie", () => {
    const harpoon = instance("harpon-de-pont", "p1"); // Équipez un Marin/Créature : +1 Puissance permanent
    const target = instance("murene-aveugle", "p1"); // 3/1 de base
    const state = testGameState({
      players: [testPlayer("p1", { hand: [harpoon], board: [target], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: harpoon.instanceId,
      targetInstanceId: target.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const buffedUnit = result.state.players[0].board.find((u) => u.instanceId === target.instanceId);
    expect(computeEffectiveStats(buffedUnit!, "calme").attack).toBe(4);
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

  it("Marin des Jetées : Marée Montante donne +1 Résistance temporaire (pas de gain de Raison)", () => {
    const card = instance("marin-des-jetees", "p1"); // coût 1, 1/2 de base
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(4); // seulement le coût, pas de gain de Raison
    const unit = result.state.players[0].board[0]!;
    expect(computeEffectiveStats(unit, "calme").health).toBe(3); // 2 de base +1
  });

  it("Marin des Jetées : Marée Descendante récupère 1 Raison (pas de bonus de Résistance)", () => {
    const card = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 5 - 1 (coût) + 1 (effet) = 5.
    expect(result.state.players[0].reason).toBe(5);
    const unit = result.state.players[0].board[0]!;
    expect(computeEffectiveStats(unit, "calme").health).toBe(2); // pas de bonus
  });

  it("Mousse du Premier Quart récupère 1 Raison si sa Raison est strictement inférieure à celle de l'adversaire", () => {
    const card = instance("mousse-du-premier-quart", "p1"); // coût 1
    const behind = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2", { reason: 8 })],
    });
    const behindResult = dispatch(behind, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(behindResult.ok).toBe(true);
    if (behindResult.ok) expect(behindResult.state.players[0].reason).toBe(5); // 5 - 1 (coût) + 1 (effet) = 5

    const card2 = instance("mousse-du-premier-quart", "p1");
    const ahead = testGameState({
      players: [testPlayer("p1", { hand: [card2], reason: 8 }), testPlayer("p2", { reason: 5 })],
    });
    const aheadResult = dispatch(ahead, { type: "playCard", playerId: "p1", instanceId: card2.instanceId });
    expect(aheadResult.ok).toBe(true);
    if (aheadResult.ok) expect(aheadResult.state.players[0].reason).toBe(7); // seulement le coût, pas de gain
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
  it("détruit son propre permanent, déclenche onSaborde, et permet de continuer à jouer dans le même tour", () => {
    const structure = instance("caisses-arrimees", "p1"); // Sabordage : récupérez 2 Ancrage
    const card = instance("marin-des-jetees", "p1"); // coût 1
    const state = testGameState({
      players: [testPlayer("p1", { board: [structure], hand: [card], reason: 10, anchor: 20 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: structure.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard).toHaveLength(1);
    expect(p1.graveyard[0]?.graveyardCause).toBe("scuttled");
    expect(p1.anchor).toBe(22);
    expect(result.events.some((e) => e.type === "SABORDED")).toBe(true);

    // Le Sabordage n'est pas une action limitée : rejouer une carte le
    // même tour doit toujours être accepté (Notion "Moteur de partie" :
    // "Saborder — action de jeu, pas fin de tour").
    const followUp = dispatch(result.state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(followUp.ok).toBe(true);
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

  it("un combat unité contre unité est MUTUEL : le défenseur riposte avec sa Puissance effective", () => {
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
    // Le défenseur (1 PV) meurt sous 4 dégâts ; l'attaquant (2 PV) riposté
    // meurt aussi sous les 3 dégâts de retour (combat mutuel, "trade").
    expect(result.state.players[1].board).toHaveLength(0);
    expect(result.state.players[0].board).toHaveLength(0);
  });

  it("la riposte ne dépasse pas la Puissance effective du défenseur : l'attaquant survit s'il a assez de Résistance", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const defender = instance("poisson-lanterne", "p2"); // 1/1
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
    expect(result.state.players[1].board).toHaveLength(0); // défenseur mort (1 PV < 4 dégâts)
    const survivor = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    expect(survivor?.damageMarked).toBe(1); // riposte de 1 (Puissance du défenseur), 2 PV encaisse largement
  });

  it("un permanent sans Puissance (Structure/Objet) ne riposte pas", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const structure = instance("caisses-arrimees", "p2"); // pas d'attaque
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [structure] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    expect(survivor?.damageMarked).toBe(0);
  });

  it("une attaque directe contre le Navire adverse n'inflige toujours aucun dégât en retour", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    expect(survivor?.damageMarked).toBe(0);
  });

  it("Garde : une attaque directe visant le Navire est refusée tant qu'un porteur de Garde est en jeu", () => {
    const guard = instance("crabe-de-fer", "p2"); // porte "garde" (sauf pendant Calme, cf. son propre test dédié)
    const attacker = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard] })],
      environment: testEnvironment({ tideState: "houle" }),
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

  it("Garde conditionnel : Crabe de Fer perd Garde pendant Calme, l'attaque directe passe", () => {
    const guard = instance("crabe-de-fer", "p2");
    const attacker = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard] })],
      // testGameState() par défaut est en Calme.
    });

    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(direct.ok).toBe(true);
  });

  it("Garde dynamique : Chose des Hauts-Fonds n'obtient Garde que si son contrôleur a 5 Raison ou moins", () => {
    const guard = instance("chose-des-hauts-fonds", "p2");
    const attacker = instance("requin-balafre", "p1");
    const highReason = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard], reason: 6 })],
    });
    expect(dispatch(highReason, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId }).ok).toBe(true);

    const lowReason = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [instance("requin-balafre", "p1")] }), testPlayer("p2", { board: [instance("chose-des-hauts-fonds", "p2")], reason: 5 })],
    });
    const lowAttacker = lowReason.players[0].board[0]!;
    expect(dispatch(lowReason, { type: "attack", playerId: "p1", attackerInstanceId: lowAttacker.instanceId }).ok).toBe(false);
  });

  it("Contournement de Garde : Raie des Fosses attaque directement pendant Abysses malgré un porteur de Garde", () => {
    const guard = instance("crabe-de-fer", "p2");
    const attacker = instance("raie-des-fosses", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard] })],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(direct.ok).toBe(true);
  });

  it("Sans contournement, Raie des Fosses reste soumise à Garde en dehors d'Abysses", () => {
    const guard = instance("crabe-de-fer", "p2");
    const attacker = instance("raie-des-fosses", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [guard] })],
      environment: testEnvironment({ tideState: "houle" }),
    });

    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(direct.ok).toBe(false);
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

  it("dégèle les unités du joueur qui redevient actif", () => {
    const frozenUnit = instance("murene-aveugle", "p2", { summoningSick: true, hasAttackedThisTurn: true });
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [frozenUnit] })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unit = result.state.players[1].board[0];
    expect(unit?.summoningSick).toBe(false);
    expect(unit?.hasAttackedThisTurn).toBe(false);
  });

  it("perd 1 Ancrage si SA Raison est à 0 à la fin de SON tour (pas celle du joueur qui devient actif)", () => {
    const state = testGameState({
      players: [testPlayer("p1", { reason: 0, anchor: 18 }), testPlayer("p2", { reason: 5, anchor: 20 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 termine son tour à 0 Raison : il perd l'Ancrage, pas p2.
    expect(result.state.players[0].anchor).toBe(17);
    expect(result.state.players[1].anchor).toBe(20);
  });

  it("ne perd pas d'Ancrage si la Raison du joueur qui devient actif est à 0 (seule SA propre fin de tour compte)", () => {
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { reason: 0, anchor: 18 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p2 devient actif à 0 Raison : la régénération de +1 s'applique
    // normalement, sans perte d'Ancrage (ce n'est pas la fin de SON tour).
    expect(result.state.players[1].anchor).toBe(18);
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
    const attacker = instance("loeil-sous-la-mer-abyssal", "p1"); // 5/7
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

describe("engine.dispatch - playCard : effet conditionnel à la Marée (Poisson-Lanterne)", () => {
  it("récupère 1 Raison à l'arrivée en jeu si la Marée est Tempête", () => {
    const card = instance("poisson-lanterne", "p1"); // coût 1
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 3 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "tempete" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 - 1 (coût) + 1 (effet) = 3.
    expect(result.state.players[0].reason).toBe(3);
  });

  it("ne récupère rien si la Marée n'est pas Tempête/Abysses", () => {
    const card = instance("poisson-lanterne", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 3 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(2);
  });
});

describe("engine.dispatch - playCard : attache d'Équipement", () => {
  it("s'attache à une cible légale et applique son bonus", () => {
    const equip = instance("harpon-de-pont", "p1"); // Équipez un Marin/Créature : +1 Puissance
    const target = instance("murene-aveugle", "p1"); // 3/1
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [target], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: target.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const equipOnBoard = result.state.players[0].board.find((u) => u.cardId === "harpon-de-pont");
    expect(equipOnBoard?.attachedToInstanceId).toBe(target.instanceId);
  });

  it("refuse une cible d'un type interdit (Harpon de Pont ne peut pas équiper une Structure)", () => {
    const equip = instance("harpon-de-pont", "p1");
    const structure = instance("caisses-arrimees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [structure], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(false);
  });

  it("respecte la restriction plus étroite d'un Équipement donné (Treuil Rouillé : Structure uniquement)", () => {
    const equip = instance("treuil-rouille", "p1");
    const creature = instance("murene-aveugle", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [creature], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: creature.instanceId,
    });

    expect(result.ok).toBe(false);
  });

  it("refuse de cibler un permanent déjà équipé par un autre Équipement", () => {
    const firstEquip = instance("harpon-de-pont", "p1");
    const target = instance("murene-aveugle", "p1");
    const secondEquip = instance("harpon-de-pont", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [secondEquip], board: [{ ...firstEquip, attachedToInstanceId: target.instanceId }, target], reason: 5 }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: secondEquip.instanceId,
      targetInstanceId: target.instanceId,
    });

    expect(result.ok).toBe(false);
  });

  it("refuse de cibler un autre Équipement", () => {
    const firstEquip = instance("harpon-de-pont", "p1");
    const secondEquip = instance("plaque-de-fortune", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [secondEquip], board: [firstEquip], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: secondEquip.instanceId,
      targetInstanceId: firstEquip.instanceId,
    });

    expect(result.ok).toBe(false);
  });

  it("se joue sans cible si aucun permanent équipable n'est sur le plateau (\"si possible\")", () => {
    const equip = instance("plaque-de-fortune", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: equip.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const equipOnBoard = result.state.players[0].board.find((u) => u.cardId === "plaque-de-fortune");
    expect(equipOnBoard?.attachedToInstanceId).toBeUndefined();
  });

  it("exige une cible si au moins un permanent équipable existe", () => {
    const equip = instance("plaque-de-fortune", "p1");
    const target = instance("murene-aveugle", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [target], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: equip.instanceId });

    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - Équipement : substitution de destruction (Plaque de Fortune)", () => {
  it("détruit la Plaque de Fortune à la place du permanent équipé, qui survit avec -1 Résistance permanent", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const target = instance("vieux-loup-de-mer", "p2"); // 2/4
    const equip = instance("plaque-de-fortune", "p2", { attachedToInstanceId: target.instanceId });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [target, equip] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: target.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p2 = result.state.players[1];
    // L'Équipement est détruit à la place de la cible.
    expect(p2.board.some((u) => u.instanceId === equip.instanceId)).toBe(false);
    expect(p2.graveyard.some((c) => c.instanceId === equip.instanceId)).toBe(true);
    // La cible survit, malus permanent de Résistance appliqué.
    const survivor = p2.board.find((u) => u.instanceId === target.instanceId);
    expect(survivor).toBeDefined();
    expect(computeEffectiveStats(survivor!, "calme").health).toBe(3); // 4 - 1
    expect(survivor!.damageMarked).toBeLessThan(3);
  });

  it("ne se déclenche qu'une fois : sans Plaque de Fortune en jeu, un permanent déjà affaibli meurt normalement", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    // Simule un survivant d'une substitution précédente : malus permanent déjà posé, Plaque déjà consommée (absente du plateau).
    const weakened = instance("vieux-loup-de-mer", "p2", {
      damageMarked: 2,
      modifiers: [{ id: "mod_test", source: "plaque-de-fortune", attack: 0, health: -1, duration: "permanent" }],
    });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [weakened] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: weakened.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].board).toHaveLength(0); // mort normalement, plus de Plaque pour la sauver
  });
});

describe("engine.dispatch - playCard : effets conditionnels à l'orientation (Marin aux Yeux Rouges Abyssal)", () => {
  it("inflige 1 perte de Raison supplémentaire à l'adversaire si l'orientation est montante", () => {
    const card = instance("marin-aux-yeux-rouges-abyssal", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2", { reason: 5 })],
      environment: testEnvironment({ tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Coût 3 (5→2), puis -1 de base pour les deux (p1:1, p2:4), puis -1
    // supplémentaire pour l'adversaire car montante (p2:3).
    expect(result.state.players[0].reason).toBe(1);
    expect(result.state.players[1].reason).toBe(3);
  });

  it("récupère 1 Raison pour le contrôleur si l'orientation est descendante, sans surcoût pour l'adversaire", () => {
    const card = instance("marin-aux-yeux-rouges-abyssal", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2", { reason: 5 })],
      environment: testEnvironment({ tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Coût 3 (5→2), puis -1 de base pour les deux (p1:1, p2:4), puis +1 pour
    // le contrôleur car descendante (p1:2). p2 ne subit que la perte de base.
    expect(result.state.players[0].reason).toBe(2);
    expect(result.state.players[1].reason).toBe(4);
  });
});

describe("engine.dispatch - endTurn : capacité de début de tour conditionnelle (Bouée de Dérive)", () => {
  it("récupère 1 Raison au début du tour si visible et orientation descendante", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 5 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "calme", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // +1 régénération normale de début de tour, +1 capacité de Bouée de Dérive.
    expect(result.state.players[1].reason).toBe(7);
  });

  it("ne récupère pas de Raison si l'orientation est montante", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 5 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "calme", tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(6); // seulement la régénération normale
  });

  it("ne récupère pas de Raison si elle est actuellement invisible (Tempête)", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 5 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "tempete", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(6); // seulement la régénération normale, Bouée invisible pendant Tempête
  });
});

describe("engine.dispatch - bonusDamageVsTargetType", () => {
  it("Barracuda des Hauts-Fonds inflige +1 dégât en attaquant une Structure", () => {
    const attacker = instance("barracuda-des-hauts-fonds", "p1"); // 3/2
    const structure = instance("cage-de-flottaison", "p2"); // pas d'attaque, 5 PV
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [structure] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[1].board.find((u) => u.instanceId === structure.instanceId);
    expect(survivor?.damageMarked).toBe(4); // 3 Puissance + 1 bonus vs Structure
  });

  it("n'ajoute pas de bonus quand la cible n'est pas du type visé", () => {
    const attacker = instance("barracuda-des-hauts-fonds", "p1"); // 3/2
    const defender = instance("murene-aveugle", "p2"); // 3/1, Créature
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
    expect(result.state.players[1].board).toHaveLength(0); // 3 dégâts (sans bonus) suffisent déjà à tuer 1 PV
  });

  it("Corde de Remorquage donne son bonus vs Structure à l'unité équipée (pas seulement à elle-même)", () => {
    const marin = instance("marin-des-jetees", "p1"); // 1/2
    const equip = instance("corde-de-remorquage", "p1", { attachedToInstanceId: marin.instanceId });
    const structure = instance("cage-de-flottaison", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [marin, equip] }), testPlayer("p2", { board: [structure] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: marin.instanceId,
      defenderInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[1].board.find((u) => u.instanceId === structure.instanceId);
    expect(survivor?.damageMarked).toBe(2); // 1 Puissance + 1 bonus via l'Équipement attaché
  });

  it("le bonus vs Structure ne s'ajoute jamais à la riposte de l'attaquant", () => {
    const attacker = instance("poisson-scie-gris", "p1"); // 3/3
    const defender = instance("vieux-loup-de-mer", "p2"); // 2/4, Marin (pas une Structure)
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
    const attackerAfter = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    expect(attackerAfter?.damageMarked).toBe(2); // riposte = 2 Puissance du défenseur, pas affectée par le bonus
  });
});

describe("engine.dispatch - playCard : restriction de Raison du contrôleur", () => {
  it("Ce Qui Suit le Navire ne peut être joué qu'avec 5 Raison ou moins", () => {
    const card = instance("ce-qui-suit-le-navire", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 6 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Ce Qui Suit le Navire se joue normalement avec 5 Raison ou moins", () => {
    const card = instance("ce-qui-suit-le-navire", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
  });

  it("la variante Abyssale exige EXACTEMENT 5 Raison, pas moins", () => {
    const card = instance("ce-qui-suit-le-navire-abyssal", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2")],
    });

    const tooLow = dispatch(
      { ...state, players: [testPlayer("p1", { hand: [card], reason: 4 }), testPlayer("p2")] },
      { type: "playCard", playerId: "p1", instanceId: card.instanceId }
    );
    expect(tooLow.ok).toBe(false);

    const exact = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(exact.ok).toBe(true);
  });
});

describe("engine.dispatch - Choppe ! : coût dynamique et bris restreint à Calme", () => {
  it("coûte son prix normal (1 Raison) en dehors de Calme", () => {
    const card = instance("chope", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 3 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(2);
  });

  it("coûte 0 Raison pendant Calme", () => {
    const card = instance("chope", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 3 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(3);
  });

  it("ne peut être brisé que pendant Calme", () => {
    const card = instance("chope", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [card] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle" }),
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });

  it("se brise normalement pendant Calme et rend 2 Raison", () => {
    const card = instance("chope", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [card], reason: 2 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(4);
  });
});
