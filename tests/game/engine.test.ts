import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { handBreakCost } from "@/game/actions/breakObject";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { canUnitAttack } from "@/game/rules/validation";
import { naturalReasonRecovery, reasonCeiling } from "@/game/state/reason";
import { instance, TEST_COQUE_LEGERE, testEnvironment, testGameState, testPlayer, withTestShip } from "./testHelpers";
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

  it("enchaîne Phase principale → Combat → Phase principale 2, et s'arrête là", () => {
    const toCombat = dispatch(testGameState({ phase: "mainPhase" }), { type: "advancePhase", playerId: "p1" });
    expect(toCombat.ok).toBe(true);
    if (!toCombat.ok) return;
    expect(toCombat.state.phase).toBe("combatPhase");

    const toMain2 = dispatch(toCombat.state, { type: "advancePhase", playerId: "p1" });
    expect(toMain2.ok).toBe(true);
    if (!toMain2.ok) return;
    expect(toMain2.state.phase).toBe("mainPhase2");

    // Rien après la Phase principale 2 : seul `endTurn` en sort.
    expect(dispatch(toMain2.state, { type: "advancePhase", playerId: "p1" }).ok).toBe(false);
  });

  it("refuse `advancePhase` pour un joueur non actif", () => {
    const mainPhaseState = testGameState({ phase: "mainPhase" });
    const wrongPlayer = dispatch(mainPhaseState, { type: "advancePhase", playerId: "p2" });
    expect(wrongPlayer.ok).toBe(false);
  });

  it("autorise poser / Saborder / Briser pendant la Phase principale 2", () => {
    const card = instance("murene-aveugle", "p1");
    const unit = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "mainPhase2",
      players: [testPlayer("p1", { hand: [card], board: [unit], reason: 10 }), testPlayer("p2")],
    });

    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId }).ok).toBe(true);
    expect(dispatch(state, { type: "saborder", playerId: "p1", instanceId: unit.instanceId }).ok).toBe(true);
    // Le combat, lui, reste enfermé dans sa propre phase.
    expect(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: unit.instanceId }).ok).toBe(false);
  });

  it("chaque nouveau tour recommence en Phase principale", () => {
    const state = testGameState({ phase: "mainPhase2" });
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

  it("Déraison : permet de jouer une carte plus chère que la Raison disponible, la Raison passe sous 0", () => {
    const card = instance("matelot-du-sans-nom", "p1"); // coût 3, sans effet
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 1, reasonMax: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(-2);
  });

  it("Déraison : aucun plancher — une carte se joue même quand elle creuse la dette bien au-delà de la Raison max", () => {
    const card = instance("matelot-du-sans-nom", "p1"); // coût 3, sans effet
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: -3, reasonMax: 4 }), testPlayer("p2")], // -3 - 3 = -6, une fois et demie la Raison max
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(-6);
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
    const owner = result.state.players[0];
    const buffedUnit = owner.board.find((u) => u.instanceId === target.instanceId);
    // Le bonus d'un Équipement est une AURA relue en direct : il faut le
    // contexte du plateau, comme partout dans le moteur (combat, morts, UI).
    expect(
      computeEffectiveStats(buffedUnit!, "calme", {
        controllerBoard: owner.board,
        controllerReason: owner.reason,
        tideOrientation: result.state.environment.tideOrientation,
      }).attack
    ).toBe(4);
  });

  it("un onPlayEffect inflige une perte de Raison aux deux joueurs", () => {
    // Marin aux Yeux Rouges ne cible plus que l'adversaire (21/09) : la
    // primitive `allPlayers` se teste désormais sur L'Œil Sous la Mer, qui
    // garde volontairement sa symétrie (deck construit pour la supporter).
    const card = instance("loeil-sous-la-mer", "p1"); // coût 5, Abysses only, chaque joueur perd 1 Raison
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 10 }), testPlayer("p2", { reason: 10 })],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // p1 a payé 5 de coût (10 -> 5) puis perdu 1 de Raison via l'effet (-> 4).
    expect(result.state.players[0].reason).toBe(4);
    expect(result.state.players[1].reason).toBe(9);
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

  it("Mousse du Premier Quart : la comparaison se fait APRÈS le paiement du coût", () => {
    // Le cas qui prête à confusion en partie : à égalité AVANT de jouer, le
    // coût creuse la Déraison et fait donc passer sous l'adversaire — la
    // carte se rembourse alors elle-même, et la Raison ne bouge pas.
    // Aucun plancher de Déraison (`assertCanPayCost`) : le coût se paie
    // même à 0.
    const card = instance("mousse-du-premier-quart", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 0 }), testPlayer("p2", { reason: 0 })],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(0); // 0 - 1 (coût) = -1, puis -1 < 0 → +1

    // À égalité APRÈS paiement (1 avant, adversaire à 0), rien ne se
    // déclenche : « inférieure » est strict.
    const egal = instance("mousse-du-premier-quart", "p1");
    const tie = testGameState({
      players: [testPlayer("p1", { hand: [egal], reason: 1 }), testPlayer("p2", { reason: 0 })],
    });
    const tieResult = dispatch(tie, { type: "playCard", playerId: "p1", instanceId: egal.instanceId });
    expect(tieResult.ok).toBe(true);
    if (tieResult.ok) expect(tieResult.state.players[0].reason).toBe(0);
  });
});

describe("engine.dispatch - breakObject", () => {
  it("brise un Objet contrôlé : résout onBreakEffects, l'envoie au cimetière, sans déclencher onDeath/onSaborde", () => {
    // Raison à 5 (> 3) pour rester sur le seul gain de base ici — le bonus
    // conditionnel "3 Raison ou moins" a son propre test dédié plus bas.
    const thermos = instance("thermos-du-dernier-quart", "p1"); // Brisez : récupérez 2 Raison
    const state = testGameState({
      players: [testPlayer("p1", { board: [thermos], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: thermos.instanceId });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard).toHaveLength(1);
    expect(p1.reason).toBe(7);
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

describe("engine.dispatch - breakObject depuis la main (règle prototype)", () => {
  it("coûte la moitié du coût imprimé arrondie au supérieur, minimum 1", () => {
    expect(handBreakCost(getCardDefinition("thermos-du-dernier-quart"))).toBe(1); // coût 2
    expect(handBreakCost(getCardDefinition("levier-de-lest"))).toBe(1); // coût 1
    expect(handBreakCost({ ...getCardDefinition("thermos-du-dernier-quart"), cost: 5 })).toBe(3);
    expect(handBreakCost({ ...getCardDefinition("thermos-du-dernier-quart"), cost: 0 })).toBe(1);
  });

  it("paie le coût, résout l'effet et envoie l'Objet en défausse sans occuper de Slot", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1"); // Brisez : récupérez 2 Raison
    const state = testGameState({
      players: [testPlayer("p1", { hand: [thermos], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: thermos.instanceId, fromHand: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.hand).toHaveLength(0);
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard.map((c) => c.instanceId)).toEqual([thermos.instanceId]);
    expect(p1.reason).toBe(6); // 5 - 1 (Bris depuis la main) + 2
    expect(result.events).toContainEqual(expect.objectContaining({ type: "CARD_MOVED", fromZone: "hand", toZone: "graveyard" }));
  });

  it("refuse une carte de la main qui n'est pas un Objet, et un Objet absent de la main", () => {
    const marin = instance("marin-des-jetees", "p1");
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [marin], board: [thermos], reason: 5 }), testPlayer("p2")],
    });

    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: marin.instanceId, fromHand: true }).ok).toBe(false);
    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: thermos.instanceId, fromHand: true }).ok).toBe(false);
  });

  it("respecte les conditions d'activation de l'Objet (ex: Marée requise)", () => {
    const choppe = instance("chope", "p1"); // Choppe ! : ne se brise que pendant Calme
    const state = testGameState({
      players: [testPlayer("p1", { hand: [choppe], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "tempete" }),
    });

    expect(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: choppe.instanceId, fromHand: true }).ok).toBe(false);
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

  it("faiblesse d'attaque directe (`directAttackWeakness`) : une attaque directe contre ce Navire lui inflige +1 dégât", () => {
    // Plus aucun Navire du roster ne la porte (Coque légère retirée du
    // Courlis le 24/09/2026) : la primitive s'éprouve sur un Navire fictif.
    withTestShip(TEST_COQUE_LEGERE, () => {
      const attacker = instance("requin-balafre", "p1"); // 4/2
      const state = testGameState({
        phase: "combatPhase",
        players: [
          testPlayer("p1", { board: [attacker] }),
          testPlayer("p2", { shipId: TEST_COQUE_LEGERE.id, anchor: 17 }),
        ],
      });

      const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // 4 d'attaque + 1 de faiblesse = 5 dégâts.
      expect(result.state.players[1].anchor).toBe(12);
    });
  });

  it("Le Courlis n'a plus Coque légère : une attaque directe lui inflige ses dégâts nus", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { shipId: "le-courlis", anchor: 17 })],
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(13);
  });

  it("refuse d'attaquer avec une unité malade d'invocation", () => {
    const attacker = instance("requin-balafre", "p1", { summoningSick: true });
    const state = testGameState({ phase: "combatPhase", players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2")] });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Pied marin : une unité fraîchement posée attaque — moteur, interface (`canUnitAttack`) et bot d'accord", () => {
    // Cra-Poiscail Messager porte « Pied marin » imprimé.
    const messager = instance("cra-poiscail-messager", "p1", { summoningSick: true });
    const requin = instance("requin-balafre", "p1", { summoningSick: true });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [messager, requin] }), testPlayer("p2")],
    });

    expect(canUnitAttack(state, "p1", messager.instanceId)).toBe(true);
    expect(canUnitAttack(state, "p1", requin.instanceId)).toBe(false);

    const attackers = enumerateCandidateActions(state, "p1").flatMap((a) => (a.type === "attack" ? [a.attackerInstanceId] : []));
    expect(attackers).toContain(messager.instanceId);
    expect(attackers).not.toContain(requin.instanceId);

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: messager.instanceId });
    expect(result.ok).toBe(true);
  });

  it("« Lorsqu'il attaque, +1 Puissance » compte dans CE coup (Sterne des Embruns)", () => {
    const sterne = instance("sterne-des-embruns", "p1", { summoningSick: true }); // 1/1, Pied marin
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [sterne] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: sterne.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(18);
    const strike = result.events.find((e) => e.type === "DAMAGE" && e.combat === "strike");
    expect(strike).toMatchObject({ targetPlayerId: "p2", amount: 2 });
  });

  it("piège et « Lorsqu'il attaque » se cumulent : la réduction du piège n'efface pas le bonus, ni l'inverse", () => {
    // Sterne des Embruns 1/1 (+1 Puissance lorsqu'elle attaque) contre un Filet à la Dérive visible
    // en Calme (-1 Puissance pour cette attaque) : 1 - 1 + 1 = 1 dégât.
    const sterne = instance("sterne-des-embruns", "p1");
    const filet = instance("filet-a-la-derive", "p2");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [sterne] }), testPlayer("p2", { anchor: 20, board: [filet] })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: sterne.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingReaction).toBeUndefined();
    expect(result.state.players[1].anchor).toBe(19);
  });

  it("riposte : le coup et la riposte sont marqués, chacun à sa place", () => {
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
    const damages = result.events.filter((e) => e.type === "DAMAGE");
    expect(damages.find((e) => e.combat === "strike")).toMatchObject({ targetInstanceId: defender.instanceId, amount: 4 });
    expect(damages.find((e) => e.combat === "retaliation")).toMatchObject({ targetInstanceId: attacker.instanceId, amount: 3 });
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
    const attacker = instance("murene-aveugle", "p1"); // 3/1, sans contrecoup propre
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
  it("passe la main au joueur suivant, lui rend la récupération naturelle (et non plus la totalité) et pioche", () => {
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
    expect(result.state.players[1].reason).toBe(7); // 5 + 2 : la Raison persiste, elle ne se remplit plus
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

  it("terminer son tour à exactement 0 Raison ne coûte plus d'Ancrage (règle remplacée par la Déraison)", () => {
    const state = testGameState({
      players: [testPlayer("p1", { reason: 0, anchor: 18 }), testPlayer("p2", { reason: 5, anchor: 20 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].anchor).toBe(18);
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
    // p2 devient actif à 0 Raison : 0 n'est pas une dette (il faut être SOUS 0), donc aucune perte d'Ancrage.
    expect(result.state.players[1].anchor).toBe(18);
    expect(result.state.players[1].reason).toBe(2); // 0 + récupération naturelle
  });

  it("Déraison CHOISIE : terminer son tour sous zéro coûte 1 Ancrage par point, et la Raison repart de 0", () => {
    const state = testGameState({
      players: [testPlayer("p1", { reason: -4, reasonMax: 10, anchor: 18 }), testPlayer("p2", { reason: 5, anchor: 20 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].anchor).toBe(14); // 18 - 4
    expect(result.state.players[0].reason).toBe(0);
    expect(result.state.players[1].anchor).toBe(20); // la dette de p1 ne touche jamais p2
    const settled = result.events.find((e) => e.type === "DERAISON_SETTLED");
    expect(settled).toMatchObject({ playerId: "p1", debt: 4, anchorDamage: 4 });
  });

  it("Déraison SUBIE : aucun Ancrage perdu — elle mange la récupération du tour, une seule fois", () => {
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { reason: -2, reasonMax: 10, anchor: 18 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Une dette qu'on n'a pas CHOISIE ne se paie pas en Ancrage : elle coûte
    // du revenu. La récupération de ce tour est amputée, l'ardoise effacée.
    expect(result.state.players[1].anchor).toBe(18);
    expect(result.state.players[1].reason).toBe(0);
  });

  it("Déraison SUBIE : le reliquat n'est jamais reporté — c'est ce qui empêche le verrou", () => {
    // -5 pour une récupération de 1 : le tour de revenu est perdu, mais le
    // joueur repart de 0 et NON de -4. Sans quoi des drains répétés le
    // laisseraient sous zéro indéfiniment, sans recours.
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { reason: -5, reasonMax: 10, anchor: 18 })],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(18);
    expect(result.state.players[1].reason).toBe(0);
  });

  it("la Raison PERSISTE d'un tour à l'autre et ne remonte que de la récupération naturelle", () => {
    // Courlis 12, courbe 15/30/45/60/75/90/100 → plafonds 2/4/6/8/9/11/12.
    // Le plafond ne fait RIEN monter : seule la récupération naturelle le
    // fait, et elle suit la partie (`REASON_RECOVERY_CURVE`) : +2 au 2e tour
    // du joueur, +3 aux 3e et 4e, +4 ensuite.
    const deck = (owner: string) => [1, 2, 3, 4, 5, 6].map(() => instance("marin-des-jetees", owner)); // deck vide = Jugement de l'Océan
    const state = testGameState({
      turnNumber: 2,
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [
        testPlayer("p1", { shipId: "le-courlis", reason: 2, reasonMax: 12, reasonCap: 2, deck: deck("p1") }),
        testPlayer("p2", { shipId: "le-courlis", reason: 1, reasonMax: 12, reasonCap: 2, deck: deck("p2") }),
      ],
    });

    // Le Courlis porte Virage court, qui s'active à l'annonce d'une Marée :
    // un changement d'état ouvre donc une fenêtre, et l'entame du tour
    // n'est finie qu'une fois qu'elle s'est refermée. Ce test-ci mesure la
    // Raison — il passe la fenêtre et laisse l'entame se terminer.
    const end = (s: GameState, playerId: string) => {
      const r = dispatch(s, { type: "endTurn", playerId });
      if (!r.ok) throw new Error(r.error);
      let after = r.state;
      while (after.pendingReaction) {
        const passe = dispatch(after, { type: "passReaction", playerId: after.pendingReaction.awaitingPlayerId });
        if (!passe.ok) throw new Error(passe.error);
        after = passe.state;
      }
      return after;
    };
    const withReason = (s: GameState, index: 0 | 1, reason: number): GameState => ({
      ...s,
      players: s.players.map((p, i) => (i === index ? { ...p, reason } : p)) as GameState["players"],
    });

    const t3 = end(state, "p2"); // 2e tour de p1
    expect(t3.players[0].reasonCap).toBe(4);
    expect(t3.players[0].reason).toBe(4); // 2 + 2, atteint le plafond sans le dépasser

    const t5 = end(end(t3, "p1"), "p2"); // 3e tour de p1
    expect(t5.players[0].reasonCap).toBe(6);
    expect(t5.players[0].reason).toBe(6); // 4 + 3, borné par le plafond

    // Le joueur qui a tout dépensé repart de la seule récupération, pas de
    // son plafond : c'est là que la remise à niveau faisait du début de
    // partie une course. Mais cette récupération GRANDIT : au 4e tour, on
    // ne vit plus à 2.
    const t7 = end(end(withReason(t5, 0, 0), "p1"), "p2"); // 4e tour de p1
    expect(t7.players[0].reason).toBe(3);

    // Et ce qui n'est pas dépensé reste acquis d'un tour à l'autre.
    const t9 = end(end(withReason(t7, 0, 5), "p1"), "p2"); // 5e tour de p1
    expect(t9.players[0].reason).toBe(9); // 5 + 4, pile au plafond du 5e tour
  });

  it("la récupération naturelle grandit avec la partie : 2, 2, 3, 3, puis 4 pour de bon", () => {
    // Retour de jeu du 24/09 : à +2 fixe, un joueur qui joue chaque tour vit
    // à 2 de Raison toute la partie, et une grosse carte coûte deux tours
    // sans rien poser.
    expect([1, 2, 3, 4, 5, 6, 12].map(naturalReasonRecovery)).toEqual([2, 2, 3, 3, 4, 4, 4]);
  });

  it("le plafond de début de partie borne les gains VENANT DES CARTES, sans jamais rogner l'acquis", () => {
    // Un deck de rampe ne doit pas pouvoir sauter la courbe. Le plafond du
    // 2e tour d'un Courlis est 4 : un gain de carte s'y arrête.
    const state = testGameState({
      players: [
        testPlayer("p1", { shipId: "le-courlis", reason: 3, reasonMax: 12, reasonCap: 4 }),
        testPlayer("p2"),
      ],
    });
    expect(reasonCeiling(state.players[0])).toBe(4);

    // À l'inverse, un joueur DÉJÀ au-dessus de son plafond (Abysses qui
    // abaissent sa Raison max, gain obtenu avant que la courbe ne descende)
    // ne se fait pas rogner au début de son tour.
    const riche = testGameState({
      turnNumber: 2,
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [
        testPlayer("p1", { shipId: "le-courlis", reason: 9, reasonMax: 12, reasonCap: 4, deck: [instance("marin-des-jetees", "p1")] }),
        testPlayer("p2", { deck: [instance("marin-des-jetees", "p2")] }),
      ],
    });
    const after = dispatch(riche, { type: "endTurn", playerId: "p2" });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.state.players[0].reason).toBe(9); // conservé, ni rogné ni augmenté
  });

  it("courbe de début de partie : le plafond du joueur qui termine son tour ne bouge pas (seul son propre début de tour le relève)", () => {
    const state = testGameState({
      players: [
        testPlayer("p1", { shipId: "le-courlis", reason: 2, reasonMax: 12, reasonCap: 3 }),
        testPlayer("p2", { deck: [instance("marin-des-jetees", "p2")] }),
      ],
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reasonCap).toBe(3);
    expect(result.state.players[0].reason).toBe(2);
  });

  it("Déraison : Pénitence (La Religieuse) réduit de 1 les dégâts de Déraison CHOISIE", () => {
    const state = testGameState({
      players: [testPlayer("p1", { shipId: "la-religieuse", reason: -3, reasonMax: 10, anchor: 20 }), testPlayer("p2")],
      activePlayerId: "p1",
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].anchor).toBe(18); // 20 - (3 - 1)
    expect(result.state.players[0].reason).toBe(0);
  });

  it("Déraison : une perte de Raison par effet continue de creuser une dette déjà profonde (aucun plancher)", () => {
    const marin = instance("marin-aux-yeux-rouges", "p1"); // "chaque joueur perd 1 Raison"
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [marin], reason: 10 }),
        testPlayer("p2", { shipId: "le-goliath", reason: -5, reasonMax: 10 }), // déjà à -50 % de sa Raison max
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: marin.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(-6);
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
  it("suspend la fin du tour sur un choix : c'est le joueur qui désigne les cartes à défausser", () => {
    const keepCard = instance("murene-aveugle", "p1");
    const discardedCard = instance("murene-aveugle", "p1");
    const hand = [keepCard, ...Array.from({ length: 6 }, () => instance("murene-aveugle", "p1")), discardedCard];
    const state = testGameState({
      players: [testPlayer("p1", { hand }), testPlayer("p2")],
      activePlayerId: "p1",
    });

    const paused = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;
    // Rien n'est parti tout seul, et le tour n'est pas encore passé.
    expect(paused.state.pendingChoice).toMatchObject({ kind: "handDiscard", playerId: "p1", count: 1, refusable: false, handLimit: true });
    expect(paused.state.activePlayerId).toBe("p1");
    expect(paused.state.players[0].hand).toHaveLength(8);
    // Tant que le choix est ouvert, rien d'autre ne passe.
    expect(dispatch(paused.state, { type: "endTurn", playerId: "p1" }).ok).toBe(false);
    // Et la défausse attend son compte exact : pas de refus.
    expect(dispatch(paused.state, { type: "resolveChoice", playerId: "p1", choice: "pass" }).ok).toBe(false);

    // Le joueur désigne la DERNIÈRE carte : c'est bien elle qui part.
    const result = dispatch(paused.state, { type: "resolveChoice", playerId: "p1", choice: { discardInstanceIds: [discardedCard.instanceId] } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toHaveLength(7);
    expect(p1.hand.some((c) => c.instanceId === discardedCard.instanceId)).toBe(false);
    expect(p1.hand.some((c) => c.instanceId === keepCard.instanceId)).toBe(true);
    expect(p1.graveyard.some((c) => c.instanceId === discardedCard.instanceId)).toBe(true);
    // Défausse de RÈGLE, pas d'effet : pas de marque « par un effet ».
    const moved = result.events.find((e) => e.type === "CARD_MOVED" && e.instanceId === discardedCard.instanceId);
    expect(moved).toMatchObject({ toZone: "graveyard" });
    expect((moved as { discardByEffect?: boolean }).discardByEffect).toBeUndefined();
    // Puis la fin du tour reprend : la main passe.
    expect(result.state.pendingChoice).toBeUndefined();
    expect(result.state.activePlayerId).toBe("p2");
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

  it("ne se joue pas si aucun permanent équipable n'est sur le plateau", () => {
    const equip = instance("plaque-de-fortune", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: equip.instanceId });

    expect(result.ok).toBe(false);
    // La carte reste en main : rien n'a été payé, rien n'est parti au Cimetière.
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("ne se joue pas si le seul porteur possible n'est pas du sous-type exigé (Doudou → unité Un Dead)", () => {
    const equip = instance("doudou", "p1");
    const vivant = instance("murene-aveugle", "p1"); // Créature, pas Un Dead
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [vivant], reason: 5 }), testPlayer("p2")],
    });

    const sansCible = dispatch(state, { type: "playCard", playerId: "p1", instanceId: equip.instanceId });
    expect(sansCible.ok).toBe(false);

    // Désigner quand même le vivant ne passe pas davantage.
    const surLeVivant = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: vivant.instanceId,
    });
    expect(surLeVivant.ok).toBe(false);
  });

  it("se joue sur une unité Un Dead, qui devient son porteur (Doudou)", () => {
    const equip = instance("doudou", "p1");
    const porteur = instance("encore-cinq-minutes", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [porteur], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: porteur.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pose = result.state.players[0].board.find((u) => u.cardId === "doudou");
    expect(pose?.attachedToInstanceId).toBe(porteur.instanceId);
  });

  it("exige une cible désignée si au moins un permanent équipable existe", () => {
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
    // Coût 3 (5→2), puis -1 pour le seul adversaire (p2:4), puis -1
    // supplémentaire car montante (p2:3). Le contrôleur ne perd plus rien
    // au-delà de son coût (21/09).
    expect(result.state.players[0].reason).toBe(2);
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
    // Coût 3 (5→2), puis -1 pour le seul adversaire (p2:4), puis +1 pour le
    // contrôleur car descendante (p1:3).
    expect(result.state.players[0].reason).toBe(3);
    expect(result.state.players[1].reason).toBe(4);
  });
});

describe("engine.dispatch - endTurn : capacité de début de tour conditionnelle (Bouée de Dérive)", () => {
  it("récupère 1 Raison au début du tour si visible et orientation descendante", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 3 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "calme", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 + 2 de récupération naturelle, puis +1 de la Bouée de Dérive.
    expect(result.state.players[1].reason).toBe(6);
  });

  it("ne récupère pas de Raison si l'orientation est montante", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 3 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "calme", tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(5); // récupération naturelle seule (3 + 2)
  });

  it("ne récupère pas de Raison si elle est actuellement invisible (Tempête)", () => {
    const bouee = instance("bouee-de-derive", "p2");
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2", { board: [bouee], reason: 3 })],
      activePlayerId: "p1",
      environment: testEnvironment({ tideState: "tempete", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(5); // récupération naturelle seule, Bouée invisible pendant Tempête
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

describe("engine.dispatch - attack : contrecoup sur attaque directe (selfDamageOnDirectAttack)", () => {
  it("Requin Balafré subit 1 dégât après une attaque directe réussie", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(16); // 4 dégâts au Navire
    const survivor = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    expect(survivor?.damageMarked).toBe(1); // contrecoup
  });

  it("ne s'applique pas à une attaque contre une unité (pas le Navire)", () => {
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
    const survivor = result.state.players[0].board.find((u) => u.instanceId === attacker.instanceId);
    // 1 dégât de riposte normale (Puissance du défenseur), mais PAS de contrecoup
    // supplémentaire : `selfDamageOnDirectAttack` ne s'applique qu'aux attaques
    // directes du Navire, jamais contre une unité.
    expect(survivor?.damageMarked).toBe(1);
  });

  it("Harpon de Pont transmet le contrecoup à l'unité équipée", () => {
    const marin = instance("marin-des-jetees", "p1"); // 1/2
    const equip = instance("harpon-de-pont", "p1", { attachedToInstanceId: marin.instanceId });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [marin, equip] }), testPlayer("p2", { anchor: 20 })],
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: marin.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === marin.instanceId);
    expect(survivor?.damageMarked).toBe(1); // contrecoup via l'Équipement
  });
});

describe("engine.dispatch - attack : perte de Raison adverse sur attaque directe (opponentReasonLossOnDirectAttack)", () => {
  it("Anguille des Profondeurs fait perdre 1 Raison supplémentaire à l'adversaire pendant Abysses", () => {
    const attacker = instance("anguille-des-profondeurs", "p1"); // 3/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20, reason: 5 })],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(4);
  });

  it("n'a aucun effet en dehors d'Abysses", () => {
    const attacker = instance("anguille-des-profondeurs", "p1"); // 3/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { anchor: 20, reason: 5 })],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].reason).toBe(5);
  });
});

describe("engine.dispatch - breakObject : bonus conditionnel de Raison (Thermos du Dernier Quart)", () => {
  it("rend 3 Raison au total si la Raison du contrôleur est à 3 ou moins avant le bris", () => {
    const card = instance("thermos-du-dernier-quart", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [card], reason: 3 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(6); // 3 + 1 (conditionnel) + 2 (base)
  });

  it("ne rend que le gain de base (2) au-delà de 3 Raison", () => {
    const card = instance("thermos-du-dernier-quart", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [card], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(7); // 5 + 2 (base uniquement)
  });
});

describe("engine.dispatch - capacités optionnelles via fenêtre de réaction (Cartographe du Large, Cloche du Grand Fond, Lanterne aux Verres Noirs)", () => {
  it("Cartographe du Large : ouvre une réaction à sa propre arrivée, inverse l'orientation si activée", () => {
    const card = instance("cartographe-du-large", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [card], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideOrientation: "montante" }),
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.pendingReaction?.awaitingPlayerId).toBe("p1");

    const activated = dispatch(played.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: card.instanceId,
      abilityIndex: 0,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.state.environment.tideOrientation).toBe("descendante");
    expect(activated.state.players[0].reason).toBe(2); // 5 - 2 (coût de pose) - 1 (coût de la réaction)
  });

  it("Cloche du Grand Fond : réaction à l'entrée en Abysses, prolonge la durée si activée", () => {
    const cloche = instance("cloche-du-grand-fond", "p1");
    const filler = instance("marin-des-jetees", "p2");
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair), la Marée progresse.
      // Navire "le-goliath" (pas de faiblesse de Raison propre à l'entrée en Abysses) pour isoler la mécanique testée.
      players: [testPlayer("p1", { shipId: "le-goliath", board: [cloche], reason: 5 }), testPlayer("p2", { deck: [filler] })],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const ended = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.environment.tideState).toBe("abysses");
    expect(ended.state.pendingReaction?.awaitingPlayerId).toBe("p1");

    const baseRemaining = ended.state.environment.tideRemainingTurns;
    const activated = dispatch(ended.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: cloche.instanceId,
      abilityIndex: 0,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.state.environment.tideRemainingTurns).toBe(baseRemaining + 1);
    expect(activated.state.players[0].reason).toBe(3); // 5 - 2 (coût de la réaction) — p1 termine son tour, ne régénère pas ici (c'est p2 qui devient actif)
  });

  it("Lanterne aux Verres Noirs : s'attache correctement et réduit la durée de Marée si activée à son début de tour", () => {
    const marin = instance("marin-des-jetees", "p1");
    const lanterne = instance("lanterne-aux-verres-noirs", "p1", { attachedToInstanceId: marin.instanceId });
    const filler = instance("marin-des-jetees", "p1");
    const state = testGameState({
      turnNumber: 1, // impair : le endTurn suivant amène turnNumber=2 (pair) — pas de tick naturel de Marée, la durée ne bouge que via la réaction testée.
      activePlayerId: "p2",
      players: [testPlayer("p1", { board: [marin, lanterne], reason: 5, deck: [filler] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 3 }),
    });

    const ended = dispatch(state, { type: "endTurn", playerId: "p2" });
    // Ce n'est PAS le tour de p1 qui redevient actif ici (p2 termine son
    // tour, p1 le devient) : startOfTurn de p1 doit bien se déclencher.
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.state.activePlayerId).toBe("p1");
    expect(ended.state.pendingReaction?.awaitingPlayerId).toBe("p1");

    const activated = dispatch(ended.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: lanterne.instanceId,
      abilityIndex: 0,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.state.environment.tideRemainingTurns).toBe(2); // 3 - 1
  });
});

describe("engine.dispatch - saborder : transitions de Marée forcées (Compas aux Aiguilles Noires, Bouée de Rappel)", () => {
  it("Compas aux Aiguilles Noires : avance immédiatement la Marée d'un état et coûte 1 Raison, pendant Houle/Tempête", () => {
    const compas = instance("compas-aux-aiguilles-noires", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [compas], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.state.players[0].reason).toBe(4);
  });

  it("Compas aux Aiguilles Noires : ne fait rien en dehors de Houle/Tempête", () => {
    const compas = instance("compas-aux-aiguilles-noires", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [compas], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme", tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("calme");
    expect(result.state.players[0].reason).toBe(5);
  });

  it("Bouée de Rappel : recule immédiatement la Marée d'un état", () => {
    const bouee = instance("bouee-de-rappel", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [bouee] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "abysses", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: bouee.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
  });

  it("Bouée de Rappel : ne recule jamais au-delà de Calme", () => {
    const bouee = instance("bouee-de-rappel", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [bouee] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme", tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: bouee.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("calme");
  });
});

describe("engine.dispatch - Équipement : correctifs d'attachement manquant (Corde de Remorquage, Treuil à Chair, Lampe de Pont Rouge, Kit de Calfatage, Masque de Plongée Fissuré, Chaîne de Fer Noir, Lanterne aux Verres Noirs)", () => {
  it.each([
    ["corde-de-remorquage", "marin-des-jetees"],
    ["treuil-a-chair", "murene-aveugle"],
    ["lampe-de-pont-rouge", "marin-des-jetees"],
    ["kit-de-calfatage", "caisses-arrimees"],
    ["masque-de-plongee-fissure", "marin-des-jetees"],
    ["chaine-de-fer-noir", "murene-aveugle"],
    ["lanterne-aux-verres-noirs", "marin-des-jetees"],
  ])("%s s'attache réellement à sa cible quand joué (attachedToInstanceId posé)", (equipId, targetId) => {
    const equip = instance(equipId, "p1");
    const target = instance(targetId, "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [equip], board: [target], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: equip.instanceId,
      targetInstanceId: target.instanceId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const equipOnBoard = result.state.players[0].board.find((u) => u.cardId === equipId);
    expect(equipOnBoard?.attachedToInstanceId).toBe(target.instanceId);
  });
});

describe("engine.dispatch - Chaîne de Fer Noir : octroi de Garde et perte de Raison à la destruction de l'unité équipée", () => {
  it("l'unité équipée obtient Garde tant que la Chaîne reste attachée", () => {
    const creature = instance("murene-aveugle", "p2"); // 3/1
    const chaine = instance("chaine-de-fer-noir", "p2", { attachedToInstanceId: creature.instanceId });
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [creature, chaine] })],
    });

    // Garde impose de cibler la porteuse : une attaque directe doit être refusée.
    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker.instanceId });
    expect(direct.ok).toBe(false);
  });

  it("son contrôleur perd 1 Raison quand l'unité équipée meurt au combat", () => {
    const creature = instance("murene-aveugle", "p2", { damageMarked: 0 }); // 3/1, sans Garde ici (pas ciblée pour ce test)
    const chaine = instance("chaine-de-fer-noir", "p2", { attachedToInstanceId: creature.instanceId });
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [creature, chaine], reason: 5 })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: creature.instanceId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].board.some((u) => u.instanceId === creature.instanceId)).toBe(false);
    expect(result.state.players[1].reason).toBe(4); // 5 - 1
  });
});

describe("engine.dispatch - Masque de Plongée Fissuré : perte de Raison à la sortie des Abysses", () => {
  it("son contrôleur perd 1 Raison quand la Marée quitte Abysses", () => {
    const marin = instance("marin-des-jetees", "p1");
    const masque = instance("masque-de-plongee-fissure", "p1", { attachedToInstanceId: marin.instanceId });
    const state = testGameState({
      turnNumber: 2,
      players: [testPlayer("p1", { board: [marin, masque], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 1, tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    // p1 termine SON tour ici (p2 devient actif et régénère, pas p1) : seule
    // la sortie d'Abysses affecte p1, -1 par rapport au départ (5).
    expect(result.state.players[0].reason).toBe(4);
  });

  it("ne perd rien tant qu'on reste en Abysses (pas de transition)", () => {
    const marin = instance("marin-des-jetees", "p1");
    const masque = instance("masque-de-plongee-fissure", "p1", { attachedToInstanceId: marin.instanceId });
    const state = testGameState({
      turnNumber: 2,
      players: [testPlayer("p1", { board: [marin, masque], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3, tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses");
    expect(result.state.players[0].reason).toBe(5); // p1 termine son tour, aucune transition : Raison inchangée
  });
});

describe("engine.dispatch - Épaves Accrochées : bonus de Résistance plafonné sur destruction d'une autre Structure", () => {
  it("gagne +1 Résistance quand une autre Structure du même contrôleur est détruite", () => {
    const epaves = instance("epaves-accrochees", "p1");
    const otherStructure = instance("caisses-arrimees", "p1", { damageMarked: 3 }); // 3 PV, va mourir
    const state = testGameState({
      players: [testPlayer("p1", { board: [epaves, otherStructure] }), testPlayer("p2")],
    });

    // N'importe quelle action déclenche `processDeaths` via le moteur (la Structure a déjà ses dégâts marqués) —
    // `advancePhase` est la plus neutre (pas de pioche, pas de coût, pas de dégel).
    const result = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === epaves.instanceId);
    expect(survivor?.modifiers).toHaveLength(1);
    expect(survivor?.modifiers[0]?.health).toBe(1);
  });

  it("ne dépasse jamais +2 (plafond `maxStacks`)", () => {
    const epaves = instance("epaves-accrochees", "p1", {
      modifiers: [
        { id: "mod_a", source: "epaves-accrochees", attack: 0, health: 1, duration: "permanent" },
        { id: "mod_b", source: "epaves-accrochees", attack: 0, health: 1, duration: "permanent" },
      ],
    });
    const otherStructure = instance("caisses-arrimees", "p1", { damageMarked: 3 });
    const state = testGameState({
      players: [testPlayer("p1", { board: [epaves, otherStructure] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === epaves.instanceId);
    expect(survivor?.modifiers).toHaveLength(2); // toujours plafonné à 2, pas de 3e stack
  });

  it("ne réagit pas à la destruction d'une unité qui n'est pas une Structure", () => {
    const epaves = instance("epaves-accrochees", "p1");
    const creature = instance("murene-aveugle", "p1", { damageMarked: 1 }); // 1 PV, va mourir
    const state = testGameState({
      players: [testPlayer("p1", { board: [epaves, creature] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const survivor = result.state.players[0].board.find((u) => u.instanceId === epaves.instanceId);
    expect(survivor?.modifiers).toHaveLength(0);
  });
});

describe("engine.dispatch - Harponneur du Dernier Quai : bonus de combat pendant Tempête + coût réactif après l'attaque", () => {
  it("gagne +1 Puissance pendant Tempête et coûte 1 Raison après l'attaque (directe)", () => {
    const harponneur = instance("harponneur-du-dernier-quai", "p1"); // 3/3
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [harponneur], reason: 5 }), testPlayer("p2", { anchor: 20 })],
      environment: testEnvironment({ tideState: "tempete" }),
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: harponneur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(16); // 20 - (3 + 1 bonus Tempête)
    expect(result.state.players[0].reason).toBe(4); // 5 - 1 (coût après attaque)
  });

  it("n'a pas le bonus de Puissance en dehors de Tempête, mais paie toujours le coût après l'attaque", () => {
    const harponneur = instance("harponneur-du-dernier-quai", "p1"); // 3/3
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [harponneur], reason: 5 }), testPlayer("p2", { anchor: 20 })],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: harponneur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].anchor).toBe(17); // 20 - 3 (pas de bonus)
    expect(result.state.players[0].reason).toBe(4); // 5 - 1
  });
});

describe("engine.dispatch - Boucliers réactifs 'une fois par tour' (Vieux Loup de Mer, Seconde au Visage Pâle)", () => {
  it("Vieux Loup de Mer réduit de 1 la première perte de Raison du tour, mais pas la seconde", () => {
    const vieuxLoup = instance("vieux-loup-de-mer", "p1"); // shield inconditionnel
    // Les deux pertes du tour sont ici les deux COÛTS payés : payer EST une
    // perte de Raison ("toute source confondue"), arbitrage conservé le 21/09.
    const marinA = instance("marin-aux-yeux-rouges", "p1"); // coût 2
    const marinB = instance("marin-aux-yeux-rouges", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [vieuxLoup], hand: [marinA, marinB], reason: 10 }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10 }),
      ],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: marinA.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // p1 : 10 - 1 (coût de 2 réduit par le bouclier, 1ère perte du tour) = 9.
    expect(first.state.players[0].reason).toBe(9);
    // p2 : pas de bouclier sur son plateau, perd normalement 1 Raison.
    expect(first.state.players[1].reason).toBe(9);

    const second = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: marinB.instanceId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Bouclier déjà consommé ce tour-ci : le second coût se paie intégralement.
    expect(second.state.players[0].reason).toBe(7); // 9 - 2 (coût plein)
    expect(second.state.players[1].reason).toBe(8); // 9 - 1
  });

  it("Seconde au Visage Pâle ne réduit la perte de Raison que pendant Tempête ou Abysses", () => {
    const second = instance("second-au-visage-pale", "p1");
    const marin = instance("marin-aux-yeux-rouges", "p1");
    const stateInTempete = testGameState({
      players: [
        testPlayer("p1", { board: [second], hand: [marin], reason: 10 }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10 }),
      ],
      environment: testEnvironment({ tideState: "tempete" }),
    });

    const inTempete = dispatch(stateInTempete, { type: "playCard", playerId: "p1", instanceId: marin.instanceId });
    expect(inTempete.ok).toBe(true);
    if (!inTempete.ok) return;
    expect(inTempete.state.players[0].reason).toBe(9); // 10 - 1 (coût de 2 réduit, bouclier actif en Tempête)

    const marinCalme = instance("marin-aux-yeux-rouges", "p1");
    const stateInCalme = testGameState({
      players: [
        testPlayer("p1", { board: [instance("second-au-visage-pale", "p1")], hand: [marinCalme], reason: 10 }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10 }),
      ],
      environment: testEnvironment({ tideState: "calme" }),
    });
    const inCalme = dispatch(stateInCalme, { type: "playCard", playerId: "p1", instanceId: marinCalme.instanceId });
    expect(inCalme.ok).toBe(true);
    if (!inCalme.ok) return;
    expect(inCalme.state.players[0].reason).toBe(8); // 10 - 2 (coût plein : bouclier inactif hors Tempête/Abysses)
  });

  it("Vieux Loup de Mer réduit le coût d'une carte, une seule fois par tour", () => {
    const vieuxLoup = instance("vieux-loup-de-mer", "p1");
    const cardA = instance("matelot-du-sans-nom", "p1"); // coût 3, sans effet
    const cardB = instance("matelot-du-sans-nom", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [vieuxLoup], hand: [cardA, cardB], reason: -3, reasonMax: 10 }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10 }),
      ],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardA.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.players[0].reason).toBe(-5); // -3 - (3 - 1)

    // Bouclier consommé : la seconde carte se paie plein tarif. Sans plancher
    // de Déraison, elle passe quand même — la dette se creuse simplement.
    const noShield = dispatch(
      { ...first.state, players: [{ ...first.state.players[0], reason: -3 }, first.state.players[1]] },
      { type: "playCard", playerId: "p1", instanceId: cardB.instanceId }
    );
    expect(noShield.ok).toBe(true);
    if (!noShield.ok) return;
    expect(noShield.state.players[0].reason).toBe(-6); // -3 - 3, sans réduction
  });
});

describe("engine.dispatch - Brise-Vague de Fortune : bouclier de dégâts de Marée au Navire (Tempête)", () => {
  it("réduit de 1 les dégâts de Marée subis par SON Navire pendant Tempête, sans affecter l'adversaire", () => {
    const briseVague = instance("brise-vague-de-fortune", "p1");
    const filler = instance("marin-aux-yeux-rouges", "p2");
    const state = testGameState({
      turnNumber: 1, // fin de tour -> newTurnNumber 2 (pair) : pas de tick de Marée, l'état Tempête configuré ci-dessous persiste.
      activePlayerId: "p1",
      priorityPlayerId: "p1",
      players: [
        testPlayer("p1", { shipId: "le-goliath", anchor: 20, board: [briseVague], reason: 5 }),
        testPlayer("p2", { shipId: "le-goliath", anchor: 20, deck: [filler], reason: 5 }),
      ],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 5 }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1 dégât d'Ancrage de Tempête, intégralement absorbé par le bouclier.
    expect(result.state.players[0].anchor).toBe(20);
    // p2 n'a pas de bouclier : subit normalement le dégât de Tempête.
    expect(result.state.players[1].anchor).toBe(19);
  });
});

describe("engine.dispatch - Cage de Flottaison : bouclier de dégâts DIRECTS au Navire (une fois par tour)", () => {
  it("réduit de 2 la première attaque directe du tour, pas la seconde", () => {
    const cage = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const attacker1 = instance("murene-aveugle", "p1"); // 3/1
    const attacker2 = instance("poisson-lanterne", "p1"); // 1/1
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [attacker1, attacker2] }),
        testPlayer("p2", { shipId: "le-goliath", anchor: 20, board: [cage] }),
      ],
    });

    const first = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker1.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.players[1].anchor).toBe(19); // 20 - (3 - 2 bouclier)

    const second = dispatch(first.state, { type: "attack", playerId: "p1", attackerInstanceId: attacker2.instanceId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.players[1].anchor).toBe(18); // 19 - 1 (bouclier déjà consommé ce tour-ci)
  });
});

describe("engine.dispatch - Le Filet qui Respire : anti-grosse menace (Puissance 4 ou plus)", () => {
  it("retire 2 Puissance à un attaquant de 4 ou plus, et ne touche pas un petit attaquant", () => {
    // Rework du 21/09 : un SEUIL le distingue du Filet à la Dérive, qui lui
    // freine le swarm sans condition. Visible en Tempête et Abysses.
    const filet = instance("le-filet-qui-respire", "p2", { turnsRemaining: 4 });
    const gros = instance("requin-balafre", "p1"); // 4 Puissance : au-dessus du seuil
    const petit = instance("murene-aveugle", "p1"); // 3 Puissance : en dessous
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [gros, petit] }),
        testPlayer("p2", { shipId: "le-goliath", anchor: 20, board: [filet] }),
      ],
    });

    const first = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: gros.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.players[1].anchor).toBe(18); // 20 - (4 - 2)

    const second = dispatch(first.state, { type: "attack", playerId: "p1", attackerInstanceId: petit.instanceId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.players[1].anchor).toBe(15); // 18 - 3 : sous le seuil, rien n'est retiré
  });
});

describe("engine.dispatch - Baleine aux Cicatrices Blanches : bouclier de dégâts de combat (attaque et défense)", () => {
  it("réduit de 1 les dégâts qu'elle subit en défense, sans affecter la riposte qu'elle inflige", () => {
    const attacker = instance("requin-balafre", "p1"); // 4/2
    const baleine = instance("baleine-aux-cicatrices-blanches", "p2"); // 5/6
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [baleine] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: baleine.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const baleineAfter = result.state.players[1].board.find((u) => u.instanceId === baleine.instanceId);
    expect(baleineAfter?.damageMarked).toBe(3); // 4 - 1 (bouclier)
    // Riposte inchangée (5 Puissance) : l'attaquant (2 PV) meurt.
    expect(result.state.players[0].board).toHaveLength(0);
  });

  it("réduit de 1 les dégâts de riposte qu'elle subit en tant qu'attaquante", () => {
    const baleine = instance("baleine-aux-cicatrices-blanches", "p1"); // 5/6
    const defender = instance("murene-aveugle", "p2"); // 3/1
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [baleine] }), testPlayer("p2", { board: [defender] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: baleine.instanceId,
      defenderInstanceId: defender.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[1].board).toHaveLength(0); // défenseur mort (1 PV < 5 dégâts)
    const baleineAfter = result.state.players[0].board.find((u) => u.instanceId === baleine.instanceId);
    expect(baleineAfter?.damageMarked).toBe(2); // 3 (Puissance du défenseur) - 1 (bouclier)
  });
});

describe("engine.dispatch - Wood Vy : restauration de Résistance d'une Structure alliée (une fois par tour)", () => {
  it("réduit de 1 les dégâts de combat subis par une Structure alliée", () => {
    const woodVy = instance("wood-vy", "p1");
    const structure = instance("caisses-arrimees", "p1"); // 3 PV, pas de bouclier propre
    const attacker = instance("murene-aveugle", "p2"); // 3/1
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [woodVy, structure] }), testPlayer("p2", { board: [attacker] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: structure.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const structureAfter = result.state.players[0].board.find((u) => u.instanceId === structure.instanceId);
    expect(structureAfter?.damageMarked).toBe(2); // 3 - 1 (restauration de Wood Vy)
    // La Structure n'a pas de Puissance : pas de riposte, l'attaquant reste indemne.
    const attackerAfter = result.state.players[1].board.find((u) => u.instanceId === attacker.instanceId);
    expect(attackerAfter?.damageMarked).toBe(0);
  });
});

describe("engine.dispatch - Auras/stats dynamiques (computeEffectiveStats étendu au plateau du contrôleur)", () => {
  it("Bernard-l'Ermite d'Acier gagne +1 Résistance tant qu'une Structure visible est contrôlée", () => {
    const bernard = instance("bernard-lermite-dacier", "p1"); // 1/3
    const structure = instance("caisses-arrimees", "p1"); // visible en Calme/Houle
    const attacker = instance("murene-aveugle", "p2"); // 3/1
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [bernard, structure] }), testPlayer("p2", { board: [attacker] })],
      environment: testEnvironment({ tideState: "calme" }),
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: bernard.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 PV (base) + 1 (Structure visible) = 4 : survit à 3 dégâts.
    const bernardAfter = result.state.players[0].board.find((u) => u.instanceId === bernard.instanceId);
    expect(bernardAfter?.damageMarked).toBe(3);
    // Riposte de Bernard (1 Puissance, non affectée par son propre bonus de Résistance) : la Murène (1 PV) meurt.
    expect(result.state.players[1].board).toHaveLength(0);
  });

  it("Bernard-l'Ermite d'Acier ne gagne rien si sa Structure n'est pas visible pendant la Marée courante", () => {
    const bernard = instance("bernard-lermite-dacier", "p1"); // 1/3
    const structure = instance("caisses-arrimees", "p1"); // visible en Calme/Houle uniquement
    const attacker = instance("murene-aveugle", "p2"); // 3/1
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [bernard, structure] }), testPlayer("p2", { board: [attacker] })],
      environment: testEnvironment({ tideState: "abysses" }), // Caisses Arrimées invisible ici
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: bernard.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 PV (base, sans bonus) : meurt exactement sous 3 dégâts (la Structure, elle, reste sur le plateau).
    expect(result.state.players[0].board.some((u) => u.instanceId === bernard.instanceId)).toBe(false);
  });

  it("Matelot Insomniaque gagne +1 Puissance tant que la Raison de son contrôleur est ≤ 4", () => {
    const matelot = instance("matelot-insomniaque", "p1"); // 2/3
    const lowReasonState = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [matelot], reason: 4 }), testPlayer("p2", { shipId: "le-goliath", anchor: 20 })],
    });
    const buffed = dispatch(lowReasonState, { type: "attack", playerId: "p1", attackerInstanceId: matelot.instanceId });
    expect(buffed.ok).toBe(true);
    if (!buffed.ok) return;
    expect(buffed.state.players[1].anchor).toBe(17); // 20 - (2 + 1 bonus)

    const highReasonState = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [instance("matelot-insomniaque", "p1")], reason: 5 }), testPlayer("p2", { shipId: "le-goliath", anchor: 20 })],
    });
    const attackerId = highReasonState.players[0].board[0]!.instanceId;
    const unbuffed = dispatch(highReasonState, { type: "attack", playerId: "p1", attackerInstanceId: attackerId });
    expect(unbuffed.ok).toBe(true);
    if (!unbuffed.ok) return;
    expect(unbuffed.state.players[1].anchor).toBe(18); // 20 - 2 (pas de bonus, Raison > 4)
  });

  it("Capitaine Sans Sommeil accorde +1 Résistance aux AUTRES Marins tant que sa Raison est ≤ 3, jamais à lui-même", () => {
    const capitaine = instance("capitaine-sans-sommeil", "p1"); // 3/5
    const autreMarin = instance("marin-des-jetees", "p1"); // 1/2
    const attacker = instance("plongeur-des-epaves", "p2"); // 2/2
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [capitaine, autreMarin], reason: 3 }), testPlayer("p2", { board: [attacker] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: autreMarin.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 PV (base) + 1 (aura de Capitaine Sans Sommeil, Raison ≤ 3) = 3 : survit à 2 dégâts.
    const autreMarinAfter = result.state.players[0].board.find((u) => u.instanceId === autreMarin.instanceId);
    expect(autreMarinAfter?.damageMarked).toBe(2);
    expect(result.state.players[0].board).toHaveLength(2); // les deux Marins survivent

    const stateAboveThreshold = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [
        testPlayer("p1", { board: [instance("capitaine-sans-sommeil", "p1"), instance("marin-des-jetees", "p1")], reason: 4 }),
        testPlayer("p2", { board: [instance("plongeur-des-epaves", "p2")] }),
      ],
    });
    const [capitaine2, autreMarin2] = stateAboveThreshold.players[0].board;
    const [attacker2] = stateAboveThreshold.players[1].board;
    const noBuff = dispatch(stateAboveThreshold, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker2!.instanceId,
      defenderInstanceId: autreMarin2!.instanceId,
    });
    expect(noBuff.ok).toBe(true);
    if (!noBuff.ok) return;
    // Raison > 3 : pas d'aura, 2 PV de base meurent exactement sous 2 dégâts.
    expect(noBuff.state.players[0].board.some((u) => u.instanceId === autreMarin2!.instanceId)).toBe(false);
    expect(noBuff.state.players[0].board.some((u) => u.instanceId === capitaine2!.instanceId)).toBe(true);
  });

  it("Lampe de Pont Rouge donne +1 Puissance et +1 Résistance à l'unité équipée pendant Houle ou Tempête", () => {
    const marin = instance("marin-des-jetees", "p1"); // 1/2
    const lampe = instance("lampe-de-pont-rouge", "p1", { attachedToInstanceId: marin.instanceId });
    const stateInHoule = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [marin, lampe] }), testPlayer("p2", { shipId: "le-goliath", anchor: 20 })],
      environment: testEnvironment({ tideState: "houle" }),
    });
    const buffed = dispatch(stateInHoule, { type: "attack", playerId: "p1", attackerInstanceId: marin.instanceId });
    expect(buffed.ok).toBe(true);
    if (!buffed.ok) return;
    expect(buffed.state.players[1].anchor).toBe(18); // 20 - (1 + 1 bonus)

    const marinCalme = instance("marin-des-jetees", "p1");
    const lampeCalme = instance("lampe-de-pont-rouge", "p1", { attachedToInstanceId: marinCalme.instanceId });
    const stateInCalme = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [marinCalme, lampeCalme] }), testPlayer("p2", { shipId: "le-goliath", anchor: 20 })],
      environment: testEnvironment({ tideState: "calme" }),
    });
    const unbuffed = dispatch(stateInCalme, { type: "attack", playerId: "p1", attackerInstanceId: marinCalme.instanceId });
    expect(unbuffed.ok).toBe(true);
    if (!unbuffed.ok) return;
    expect(unbuffed.state.players[1].anchor).toBe(19); // 20 - 1 (pas de bonus hors Houle/Tempête)
  });

  it("Masque de Plongée Fissuré donne +2 Résistance à l'unité équipée pendant Abysses uniquement", () => {
    const marin = instance("marin-des-jetees", "p1"); // 1/2
    const masque = instance("masque-de-plongee-fissure", "p1", { attachedToInstanceId: marin.instanceId });
    const attacker = instance("murene-aveugle", "p2"); // 3/1
    const stateInAbysses = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [marin, masque] }), testPlayer("p2", { board: [attacker] })],
      environment: testEnvironment({ tideState: "abysses" }),
    });

    const buffed = dispatch(stateInAbysses, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: marin.instanceId,
    });
    expect(buffed.ok).toBe(true);
    if (!buffed.ok) return;
    // 2 PV (base) + 2 (Abysses) = 4 : survit à 3 dégâts.
    const marinAfter = buffed.state.players[0].board.find((u) => u.instanceId === marin.instanceId);
    expect(marinAfter?.damageMarked).toBe(3);
    // Riposte du Marin (1 Puissance) : la Murène (1 PV) meurt.
    expect(buffed.state.players[1].board).toHaveLength(0);

    const marinCalme = instance("marin-des-jetees", "p1");
    const masqueCalme = instance("masque-de-plongee-fissure", "p1", { attachedToInstanceId: marinCalme.instanceId });
    const attackerCalme = instance("murene-aveugle", "p2");
    const stateInCalme = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [marinCalme, masqueCalme] }), testPlayer("p2", { board: [attackerCalme] })],
      environment: testEnvironment({ tideState: "calme" }),
    });
    const unbuffed = dispatch(stateInCalme, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attackerCalme.instanceId,
      defenderInstanceId: marinCalme.instanceId,
    });
    expect(unbuffed.ok).toBe(true);
    if (!unbuffed.ok) return;
    // Hors Abysses : 2 PV de base meurent exactement sous 3 dégâts.
    expect(unbuffed.state.players[0].board.some((u) => u.instanceId === marinCalme.instanceId)).toBe(false);
  });
});

describe("engine.dispatch - Guetteur de Brume : révèle une carte adverse la 1ère fois par tour qu'il réagit pendant votre tour", () => {
  it("se déclenche quand l'ADVERSAIRE active une réaction pendant le tour de son contrôleur", () => {
    const guetteurDeBrume = instance("guetteur-de-brume", "p1");
    const cible = instance("baleine-aux-cicatrices-blanches", "p1"); // 5/6, cible potentielle de la réaction
    const cardToPlay = instance("marin-des-jetees", "p1");
    const guetteurMefiant = instance("guetteur-mefiant", "p2");
    const carteMain = instance("marin-des-jetees", "p2"); // seule carte en main de p2 : révélation déterministe
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [guetteurDeBrume, cible], hand: [cardToPlay], reason: 5 }),
        testPlayer("p2", { board: [guetteurMefiant], hand: [carteMain], reason: 3 }),
      ],
    });

    const opened = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.pendingReaction?.awaitingPlayerId).toBe("p2");

    const activated = dispatch(opened.state, {
      type: "activateReaction",
      playerId: "p2",
      sourceInstanceId: guetteurMefiant.instanceId,
      abilityIndex: 0,
      targetInstanceId: cible.instanceId,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(
      activated.events.some(
        (e) => e.type === "HAND_CARD_REVEALED" && e.ownerId === "p2" && e.instanceId === carteMain.instanceId
      )
    ).toBe(true);
  });

  it("ne se déclenche pas si le contrôleur de Guetteur de Brume active lui-même une réaction (ce n'est pas 'l'adversaire')", () => {
    const guetteurDeBrume = instance("guetteur-de-brume", "p1");
    const guetteurMefiant = instance("guetteur-mefiant", "p1"); // contrôlé par le MÊME joueur
    const cible = instance("baleine-aux-cicatrices-blanches", "p1");
    const cardToPlay = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [guetteurDeBrume, guetteurMefiant, cible], hand: [cardToPlay], reason: 5 }),
        testPlayer("p2"),
      ],
    });

    const opened = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.state.pendingReaction?.awaitingPlayerId).toBe("p1"); // p1 réagit à sa propre carte

    const activated = dispatch(opened.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: guetteurMefiant.instanceId,
      abilityIndex: 0,
      targetInstanceId: cible.instanceId,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;
    expect(activated.events.some((e) => e.type === "HAND_CARD_REVEALED")).toBe(false);
  });
});

describe("engine.dispatch - La Bouée qui Regardait : révèle une carte adverse en devenant visible", () => {
  it("révèle 1 carte aléatoire de la main adverse à la transition Houle → Tempête", () => {
    const bouee = instance("la-bouee-qui-regardait", "p1");
    const carteMain = instance("marin-des-jetees", "p2"); // révélée en premier : révélation déterministe
    const filler = instance("marin-des-jetees", "p2"); // carte à piocher par p2 (qui devient actif) : évite Jugement de l'Océan
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair), la Marée progresse d'un cran.
      players: [
        testPlayer("p1", { shipId: "le-goliath", board: [bouee], reason: 5 }),
        testPlayer("p2", { hand: [carteMain], deck: [filler] }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete"); // Houle → Tempête : La Bouée devient visible
    expect(
      result.events.some(
        (e) => e.type === "HAND_CARD_REVEALED" && e.ownerId === "p2" && e.instanceId === carteMain.instanceId
      )
    ).toBe(true);
  });
});

describe("engine.dispatch - Cloche Immergée : compare une carte révélée de chaque main en devenant visible", () => {
  it("le joueur ayant révélé la carte au coût le plus élevé perd 1 Raison", () => {
    const cloche = instance("cloche-immergee", "p1");
    const carteChere = instance("la-chose-qui-remonte", "p1"); // coût 5, seule carte en main : révélation déterministe
    const carteBonMarche = instance("marin-des-jetees", "p2"); // coût 1, seule carte en main
    const filler = instance("marin-des-jetees", "p2"); // carte à piocher par p2 (qui devient actif) : évite Jugement de l'Océan
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair), la Marée progresse d'un cran.
      players: [
        testPlayer("p1", { shipId: "le-goliath", board: [cloche], hand: [carteChere], reason: 5 }),
        testPlayer("p2", { hand: [carteBonMarche], deck: [filler], reason: 5 }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.events.filter((e) => e.type === "HAND_CARD_REVEALED")).toHaveLength(2);
    // p1 a révélé la carte au coût le plus élevé (5 contre 1) : il perd 1 Raison.
    // p1 termine son tour (pas de remise à niveau pour lui) : 5 - 1 = 4.
    expect(result.state.players[0].reason).toBe(4);
    expect(result.state.players[1].reason).toBe(7); // p2 devient actif : 5 + récupération naturelle, pas de perte
  });

  it("en cas d'égalité de coût, personne ne perd de Raison", () => {
    const cloche = instance("cloche-immergee", "p1");
    const carteA = instance("marin-des-jetees", "p1"); // coût 1
    const carteB = instance("marin-des-jetees", "p2"); // coût 1 également
    const filler = instance("marin-des-jetees", "p2"); // carte à piocher par p2 (qui devient actif) : évite Jugement de l'Océan
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair), la Marée progresse d'un cran.
      players: [
        testPlayer("p1", { shipId: "le-goliath", board: [cloche], hand: [carteA], reason: 5 }),
        testPlayer("p2", { hand: [carteB], deck: [filler], reason: 5 }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.filter((e) => e.type === "HAND_CARD_REVEALED")).toHaveLength(2);
    expect(result.events.some((e) => e.type === "REASON_CHANGED" && e.delta < 0)).toBe(false);
  });
});

describe("engine.dispatch - Quelque Chose Sous la Coque : perte de Raison à la 1ère carte jouée par tour", () => {
  it("chaque joueur perd 1 Raison la 1ère fois qu'il joue une carte ce tour-ci, jamais la 2ème", () => {
    const anomalie = instance("quelque-chose-sous-la-coque", "p1");
    const marinA = instance("marin-des-jetees", "p1");
    const marinB = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [anomalie], hand: [marinA, marinB], reason: 5 }),
        testPlayer("p2", { reason: 5 }),
      ],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: marinA.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.players[0].reason).toBe(3); // 5 - 1 (coût) - 1 (Anomalie, 1ère carte du tour)

    const second = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: marinB.instanceId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.players[0].reason).toBe(2); // 3 - 1 (coût) - 0 (déjà déclenchée ce tour-ci)
  });
});

describe("engine.dispatch - Ils Sont Sous Nous : perte de Raison au 1er permanent joué par tour (+bonus Créature en Abysses)", () => {
  it("version Standard : perte de 1 Raison à la 1ère carte jouée, sans bonus même pour une Créature", () => {
    const anomalie = instance("ils-sont-sous-nous", "p1");
    const murene = instance("murene-aveugle", "p1"); // creature, sans effet propre
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [anomalie], hand: [murene], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: murene.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(7); // 10 - 2 (coût) - 1 (Anomalie, pas de bonus Créature en Standard)
  });

  it("version Abyssale : inflige 1 Raison de plus si le permanent joué est une Créature, une seule fois par tour", () => {
    const anomalie = instance("ils-sont-sous-nous-abyssal", "p1");
    const murene = instance("murene-aveugle", "p1"); // creature
    const marinX = instance("marin-des-jetees", "p1"); // marin, pas une Créature
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [anomalie], hand: [murene, marinX], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: murene.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.players[0].reason).toBe(6); // 10 - 2 (coût) - 2 (1 base + 1 bonus Créature)

    const second = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: marinX.instanceId });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.players[0].reason).toBe(5); // 6 - 1 (coût) - 0 (déjà déclenchée ce tour-ci)
  });
});

describe("engine.dispatch - Les Voix dans le Sillage : perte de Raison au 1er permanent perdu par tour", () => {
  it("le contrôleur d'un permanent qui meurt au combat perd 1 Raison", () => {
    const anomalie = instance("les-voix-dans-le-sillage", "p1");
    const fragile = instance("poisson-lanterne", "p1"); // 1/1
    const attacker = instance("requin-balafre", "p2"); // 4/2
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [
        testPlayer("p1", { board: [anomalie, fragile], reason: 5 }),
        testPlayer("p2", { board: [attacker] }),
      ],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: fragile.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].board.some((u) => u.instanceId === fragile.instanceId)).toBe(false); // mort (1 PV < 4 dégâts)
    expect(result.state.players[0].reason).toBe(4); // 5 - 1 (Anomalie, 1er permanent perdu ce tour-ci)
  });
});

describe("engine.dispatch - Le Chant Sous la Ligne : réduction de tout gain de Raison", () => {
  it("réduit de 1 (minimum 0) un gain de Raison déclenché par une autre carte", () => {
    const anomalie = instance("le-chant-sous-la-ligne", "p1");
    const mousse = instance("mousse-du-premier-quart", "p1"); // ETB : +1 Raison si Raison < adversaire
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [anomalie], hand: [mousse], reason: 3 }),
        testPlayer("p2", { reason: 5 }),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sans l'Anomalie : 3 - 1 (coût) + 1 (gain ETB) = 3. Avec elle : le gain est réduit à 0.
    expect(result.state.players[0].reason).toBe(2);
  });
});

describe("engine.dispatch - La Mer Réclame Davantage : réduit la durée d'entrée à chaque changement de Marée", () => {
  it("réduit de 1 la durée d'entrée du nouvel état (Houle descendante → Calme)", () => {
    const anomalie = instance("la-mer-reclame-davantage", "p1");
    const filler = instance("marin-des-jetees", "p2");
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair), la Marée progresse d'un cran.
      players: [
        testPlayer("p1", { shipId: "le-goliath", board: [anomalie], reason: 5 }),
        testPlayer("p2", { shipId: "le-goliath", deck: [filler], reason: 5 }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("calme"); // Houle descendante → Calme
    // Calme dure normalement 2 tours ; l'Anomalie réduit l'entrée à 1.
    expect(result.state.environment.tideRemainingTurns).toBe(1);
  });

  it("version Abyssale : inflige en plus 1 dégât d'Ancrage à CHAQUE Navire à ce changement", () => {
    const anomalie = instance("la-mer-reclame-davantage-abyssal", "p1");
    const filler = instance("marin-des-jetees", "p2");
    const state = testGameState({
      turnNumber: 2,
      players: [
        testPlayer("p1", { shipId: "le-goliath", anchor: 20, board: [anomalie], reason: 5 }),
        testPlayer("p2", { shipId: "le-goliath", anchor: 20, deck: [filler], reason: 5 }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("calme");
    // Calme n'inflige normalement aucun dégât d'Ancrage par tour : seule l'Anomalie inflige ce dégât.
    expect(result.state.players[0].anchor).toBe(19);
    expect(result.state.players[1].anchor).toBe(19);
  });
});

describe("engine.dispatch - activateAbility : Sondeur des Mauvaises Eaux (capacité activable, une fois par tour)", () => {
  it("paie 1 Raison et réduit la durée restante de la Marée de 1 tour", () => {
    const sondeur = instance("sondeur-des-mauvaises-eaux", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [sondeur], reason: 5 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 3 }),
    });

    const result = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(4);
    expect(result.state.environment.tideRemainingTurns).toBe(2);
  });

  it("refuse une seconde activation le même tour, mais l'autorise à nouveau au tour suivant", () => {
    const sondeur = instance("sondeur-des-mauvaises-eaux", "p1");
    const fillerP1 = instance("marin-des-jetees", "p1"); // p1 redevient actif et pioche : évite Jugement de l'Océan
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [sondeur], deck: [fillerP1], reason: 5 }),
        testPlayer("p2", { deck: [fillerP2] }),
      ],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 5 }),
    });

    const first = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.environment.tideRemainingTurns).toBe(4);

    const second = dispatch(first.state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(second.ok).toBe(false);

    // Nouveau tour (endTurn x2 pour repasser à p1) : la capacité redevient disponible.
    const p2Turn = dispatch(first.state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;
    const p1Turn = dispatch(p2Turn.state, { type: "endTurn", playerId: "p2" });
    expect(p1Turn.ok).toBe(true);
    if (!p1Turn.ok) return;

    const thirdTurnRemaining = p1Turn.state.environment.tideRemainingTurns;
    const third = dispatch(p1Turn.state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.state.environment.tideRemainingTurns).toBe(thirdTurnRemaining - 1);
  });

  it("accepte de payer le coût même en Déraison profonde : il n'y a pas de plancher", () => {
    const sondeur = instance("sondeur-des-mauvaises-eaux", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [sondeur], reason: -5, reasonMax: 10 }), testPlayer("p2")], // déjà à -50 % de la Raison max
    });

    const result = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBeLessThan(-5);
  });

  it("refuse en dehors de la Phase principale", () => {
    const sondeur = instance("sondeur-des-mauvaises-eaux", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [sondeur], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: sondeur.instanceId });
    expect(result.ok).toBe(false);
  });

  it("refuse pour une carte sans capacité activable", () => {
    const marin = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [marin], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: marin.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - breakObject : Grappin de Récupération (recherche en défausse)", () => {
  it("récupère en main une Structure ou un Équipement choisi dans la défausse, coûtant 2 ou moins", () => {
    const grappin = instance("grappin-de-recuperation", "p1");
    const caisses = instance("caisses-arrimees", "p1"); // structure, coût 1
    const state = testGameState({
      players: [testPlayer("p1", { board: [grappin], graveyard: [caisses] }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: grappin.instanceId,
      chosenGraveyardInstanceId: caisses.instanceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].hand.some((c) => c.instanceId === caisses.instanceId)).toBe(true);
    expect(result.state.players[0].graveyard.some((c) => c.instanceId === caisses.instanceId)).toBe(false);
    // Le Grappin lui-même part au cimetière (Objet brisé), pas en main.
    expect(result.state.players[0].graveyard.some((c) => c.instanceId === grappin.instanceId)).toBe(true);
  });

  it("se résout sans rien récupérer si la défausse ne contient aucune carte éligible", () => {
    const grappin = instance("grappin-de-recuperation", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [grappin], graveyard: [] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: grappin.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it("refuse de choisir une carte de la défausse coûtant plus de 2", () => {
    const grappin = instance("grappin-de-recuperation", "p1");
    const cage = instance("cage-de-flottaison", "p1"); // structure, coût 3 : au-dessus du plafond
    const state = testGameState({
      players: [testPlayer("p1", { board: [grappin], graveyard: [cage] }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: grappin.instanceId,
      chosenGraveyardInstanceId: cage.instanceId,
    });
    expect(result.ok).toBe(false);
  });

  it("refuse de choisir une carte de la défausse d'un type non autorisé (ni Structure, ni Équipement)", () => {
    const grappin = instance("grappin-de-recuperation", "p1");
    const marin = instance("marin-des-jetees", "p1"); // type marin, coût 1 : type non autorisé malgré le coût
    const state = testGameState({
      players: [testPlayer("p1", { board: [grappin], graveyard: [marin] }), testPlayer("p2")],
    });

    const result = dispatch(state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: grappin.instanceId,
      chosenGraveyardInstanceId: marin.instanceId,
    });
    expect(result.ok).toBe(false);
  });

  it("refuse de briser sans choisir de cible quand au moins une carte éligible existe", () => {
    const grappin = instance("grappin-de-recuperation", "p1");
    const caisses = instance("caisses-arrimees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [grappin], graveyard: [caisses] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: grappin.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("engine.dispatch - La Gueule Sous la Mer : saut direct en Abysses + verrou de Raison (Lot 08)", () => {
  it("force la Marée directement en Abysses (sans passer par Tempête), inflige 2 à son Navire, et verrouille la Raison", () => {
    const gueule = instance("la-gueule-sous-la-mer", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [gueule], reason: 10, anchor: 20 }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 2, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: gueule.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses"); // jamais "tempete" entre-temps
    expect(result.state.environment.tideOrientation).toBe("descendante");
    expect(result.state.players[0].reason).toBe(4); // 10 - 6 (coût) ; le dégât n'affecte que l'Ancrage
    expect(result.state.players[0].anchor).toBe(18); // 20 - 2
    expect(result.state.players[0].statusFlags).toContain("noReasonGainUntilNextTurn");

    // Créature 3/5 depuis la mise à jour du Lot 08 : elle reste sur le plateau après résolution de son effet de pose.
    expect(result.state.players[0].board.map((c) => c.instanceId)).toEqual([gueule.instanceId]);
    expect(result.state.players[0].graveyard.some((c) => c.instanceId === gueule.instanceId)).toBe(false);
  });

  it("le verrou empêche tout gain de Raison jusqu'au début du prochain tour du contrôleur, puis se lève automatiquement", () => {
    const gueule = instance("la-gueule-sous-la-mer", "p1");
    const mousse = instance("mousse-du-premier-quart", "p1"); // ETB : +1 Raison si Raison < adversaire
    const fillerP1 = instance("marin-des-jetees", "p1");
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [gueule, mousse], deck: [fillerP1], reason: 10, anchor: 20 }),
        testPlayer("p2", { deck: [fillerP2], reason: 10 }),
      ],
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 2, tideOrientation: "montante" }),
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: gueule.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;

    // Raison basse (4) et inférieure à celle de p2 (10) : l'ETB de Mousse voudrait gagner 1 Raison, mais le verrou l'en empêche.
    const withMousse = dispatch(played.state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
    expect(withMousse.ok).toBe(true);
    if (!withMousse.ok) return;
    expect(withMousse.state.players[0].reason).toBe(3); // 4 - 1 (coût) + 0 (gain verrouillé)

    // Fin du tour de p1 (verrou consommé, pas de régénération), puis fin du tour de p2 (p1 redevient actif : le verrou est levé).
    const p2Turn = dispatch(withMousse.state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;
    expect(p2Turn.state.players[0].reason).toBe(3); // pas de régénération pour p1 ici (ce n'est pas son tour)
    expect(p2Turn.state.players[0].statusFlags).toContain("noReasonGainUntilNextTurn"); // toujours posé : pas encore "le début de son tour"

    const p1Turn = dispatch(p2Turn.state, { type: "endTurn", playerId: "p2" });
    expect(p1Turn.ok).toBe(true);
    if (!p1Turn.ok) return;
    expect(p1Turn.state.players[0].statusFlags).not.toContain("noReasonGainUntilNextTurn");
    expect(p1Turn.state.players[0].reason).toBe(3); // régénération bloquée PRÉCISÉMENT à ce tour-ci (le verrou vient d'expirer, pas de +1 rétroactif)
  });
});

describe("engine.dispatch - Sept Brasses Plus Bas : saut direct en Abysses + orientation forcée (Lot 08)", () => {
  it("force la Marée en Abysses avec 1 tour de durée en plus, oriente Descendante, et inflige 2 Raison à chaque joueur", () => {
    const brasses = instance("sept-brasses-plus-bas", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [brasses], reason: 10 }), testPlayer("p2", { reason: 10 })],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: brasses.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses");
    expect(result.state.environment.tideRemainingTurns).toBe(2); // 1 (base Abysses) + 1 (bonus de la carte)
    expect(result.state.environment.tideOrientation).toBe("descendante");
    expect(result.state.players[0].reason).toBe(1); // 10 - 7 (coût) - 2 (perte de Raison)
    expect(result.state.players[1].reason).toBe(8); // 10 - 2 (perte de Raison, chaque joueur)
  });
});

describe("engine.dispatch - Le Fond Vous Regarde : choix forcé au début de chaque tour (système de choix de joueur)", () => {
  it("ouvre un choix pour le joueur qui DEVIENT actif, bloque toute autre action, et recommence au tour suivant", () => {
    const fondVousRegarde = instance("le-fond-vous-regarde", "p1");
    const fillerP1 = instance("marin-des-jetees", "p1");
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [fondVousRegarde], deck: [fillerP1], reason: 10, anchor: 20 }),
        testPlayer("p2", { deck: [fillerP2], reason: 10, anchor: 20 }),
      ],
    });

    const p2Turn = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;
    expect(p2Turn.state.activePlayerId).toBe("p2");
    expect(p2Turn.state.pendingChoice).toEqual({
      kind: "reasonOrAnchor",
      playerId: "p2",
      sourceInstanceId: fondVousRegarde.instanceId,
      reasonLossAmount: 1,
      anchorDamageAmount: 1,
      turnNumber: p2Turn.state.turnNumber,
    });

    // Toute autre action est refusée tant que le choix reste ouvert.
    const blocked = dispatch(p2Turn.state, { type: "endTurn", playerId: "p2" });
    expect(blocked.ok).toBe(false);

    const resolved = dispatch(p2Turn.state, { type: "resolveChoice", playerId: "p2", choice: "reasonLoss" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.pendingChoice).toBeUndefined();
    expect(resolved.state.players[1].reason).toBe(9); // 10 - 1

    // Toujours en jeu (durée 2 tours) : le choix revient au tour suivant, pour p1 cette fois.
    const p1Turn = dispatch(resolved.state, { type: "endTurn", playerId: "p2" });
    expect(p1Turn.ok).toBe(true);
    if (!p1Turn.ok) return;
    expect(p1Turn.state.activePlayerId).toBe("p1");
    expect(p1Turn.state.pendingChoice?.playerId).toBe("p1");
  });

  it("l'autre branche inflige des dégâts d'Ancrage au lieu d'une perte de Raison", () => {
    const fondVousRegarde = instance("le-fond-vous-regarde", "p1");
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [fondVousRegarde], reason: 10, anchor: 20 }),
        testPlayer("p2", { deck: [fillerP2], reason: 10, anchor: 20 }),
      ],
    });

    const p2Turn = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;

    const resolved = dispatch(p2Turn.state, { type: "resolveChoice", playerId: "p2", choice: "anchorDamage" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[1].anchor).toBe(19); // 20 - 1
    expect(resolved.state.players[1].reason).toBe(10); // inchangée
  });

  it("refuse qu'un autre joueur que celui attendu résolve le choix", () => {
    const fondVousRegarde = instance("le-fond-vous-regarde", "p1");
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [fondVousRegarde], reason: 10, anchor: 20 }),
        testPlayer("p2", { deck: [fillerP2], reason: 10, anchor: 20 }),
      ],
    });

    const p2Turn = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;

    const result = dispatch(p2Turn.state, { type: "resolveChoice", playerId: "p1", choice: "reasonLoss" });
    expect(result.ok).toBe(false);
  });

  it("version Abyssale : montants doublés (2 Raison ou 2 dégâts d'Ancrage)", () => {
    const fondVousRegardeAbyssal = instance("le-fond-vous-regarde-abyssal", "p1");
    const fillerP2 = instance("marin-des-jetees", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [fondVousRegardeAbyssal], reason: 10, anchor: 20 }),
        testPlayer("p2", { deck: [fillerP2], reason: 10, anchor: 20 }),
      ],
    });

    const p2Turn = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(p2Turn.ok).toBe(true);
    if (!p2Turn.ok) return;
    expect(p2Turn.state.pendingChoice?.kind === "reasonOrAnchor" && p2Turn.state.pendingChoice.reasonLossAmount).toBe(2);
    expect(p2Turn.state.pendingChoice?.kind === "reasonOrAnchor" && p2Turn.state.pendingChoice.anchorDamageAmount).toBe(2);

    const resolved = dispatch(p2Turn.state, { type: "resolveChoice", playerId: "p2", choice: "reasonLoss" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.state.players[1].reason).toBe(8); // 10 - 2
  });
});
