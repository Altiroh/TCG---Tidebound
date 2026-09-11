import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { STATUS_MALADE } from "@/game/cards/types";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { grantIgnoreNextTideDamage } from "@/game/environment/resolveEnvironment";
import { validateDeckList } from "@/game/rules/deckValidation";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

describe("environnement - emplacements du Navire", () => {
  it("un Navire limite le plateau à son slotCount (6 pour Le Brise-Lames), Structures/Objets inclus (Slots universels)", () => {
    const fullBoard = Array.from({ length: 6 }, () => instance("marin-des-jetees", "p1"));
    const card = instance("caisses-arrimees", "p1"); // Structure : occupe aussi un Slot
    const state = testGameState({
      players: [testPlayer("p1", { board: fullBoard, hand: [card], reason: 5 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("environnement - Marée (modèle durée + intensité)", () => {
  it("progresse d'un état à l'autre une fois par TOUR DE TABLE et applique des dégâts environnementaux en Tempête", () => {
    // La Marée ne décompte/avance qu'au retour au premier joueur (`turnNumber`
    // impair après le `endTurn`) — `turnNumber: 2` ici pour que ce seul
    // `endTurn` amène `turnNumber` à 3 (impair) et déclenche bien le tick.
    const state = testGameState({
      turnNumber: 2,
      // p1: Le Brise-Lames (résiste 2 Tempête), p2: L'Errant (aucune résistance Tempête)
      players: [testPlayer("p1"), testPlayer("p2", { shipId: "lerrant" })],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1 }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.state.players[0].anchor).toBe(24); // Le Brise-Lames : résistance 2 > 1 dégât de base, clampé à 0
    expect(result.state.players[1].anchor).toBe(19); // L'Errant : 20 - 1
  });

  it("ne progresse PAS au tour du second joueur — seulement au retour au premier (un tour = un tour de table)", () => {
    // Decks non vides : les 2 endTurn font piocher chaque joueur une fois,
    // un deck vide déclencherait un Jugement de l'Océan qui terminerait la
    // partie avant la fin du test.
    const filler = (ownerId: string) => [instance("marin-des-jetees", ownerId)];
    // p1 termine son tour (turnNumber 1 -> 2, pair) : pas de tick, la Marée reste figée pour le tour de p2.
    const afterP1 = testGameState({
      players: [testPlayer("p1", { deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1 }),
    });
    const resultP1 = dispatch(afterP1, { type: "endTurn", playerId: "p1" });
    expect(resultP1.ok).toBe(true);
    if (!resultP1.ok) return;
    expect(resultP1.state.turnNumber).toBe(2);
    expect(resultP1.state.environment.tideState).toBe("tempete"); // inchangé : le tour de p2 doit encore se jouer dans cet état.
    expect(resultP1.state.environment.tideRemainingTurns).toBe(1);

    // p2 termine à son tour (turnNumber 2 -> 3, impair) : le tour de table est complet, la Marée avance enfin.
    const resultP2 = dispatch(resultP1.state, { type: "endTurn", playerId: "p2" });
    expect(resultP2.ok).toBe(true);
    if (!resultP2.ok) return;
    expect(resultP2.state.turnNumber).toBe(3);
    expect(resultP2.state.environment.tideState).toBe("abysses");
  });

  it("une unité inactive par affinité de Marée (Masse-Sombre pendant Calme) ne peut pas attaquer", () => {
    const mass = instance("masse-sombre-abyssal", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [mass] }), testPlayer("p2")],
      // testGameState() par défaut est en Calme.
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: mass.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Masse-Sombre gagne +1 Puissance pendant Abysses (affinité de Marée)", () => {
    const mass = instance("masse-sombre-abyssal", "p1");
    expect(computeEffectiveStats(mass, "houle").attack).toBe(4);
    expect(computeEffectiveStats(mass, "abysses").attack).toBe(5);
  });

  it("Structure/Objet à durée limitée : expire (quitte le board) une fois `durationTurns` écoulé", () => {
    const buoy = instance("radeau-de-fortune", "p1", { turnsRemaining: 1 });
    const state = testGameState({
      players: [testPlayer("p1", { board: [buoy], anchor: 20 }), testPlayer("p2")],
      activePlayerId: "p2",
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].board).toHaveLength(0);
    expect(result.state.players[0].anchor).toBe(21); // onExpire : +1 Ancrage
  });

  it("Structure/Objet à durée limitée : décompte `turnsRemaining` même quand rien n'expire ce tour-ci", () => {
    const buoy = instance("radeau-de-fortune", "p1", { turnsRemaining: 3 });
    const state = testGameState({
      players: [testPlayer("p1", { board: [buoy] }), testPlayer("p2")],
      activePlayerId: "p2",
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const remaining = result.state.players[0].board.find((u) => u.instanceId === buoy.instanceId)?.turnsRemaining;
    expect(remaining).toBe(2);
  });

  it("ignoreNextTideDamage annule la prochaine perte d'Ancrage de cet état pour ce joueur", () => {
    let state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [testPlayer("p1", { shipId: "lerrant" }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1 }),
    });
    state = {
      ...state,
      players: [grantIgnoreNextTideDamage(state.players[0], "tempete"), state.players[1]],
    };

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.state.players[0].anchor).toBe(20); // aurait dû perdre 1 sans l'ignore (L'Errant : 20 de départ)
  });

  it("Sabordage d'une Structure de manipulation de Marée (Régulateur de Courant) réduit la durée restante", () => {
    const regulator = instance("regulateur-de-courant", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [regulator] }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: regulator.instanceId });
    expect(result.ok).toBe(true);
    // Calme dure 2 tours ; -1 tour restant.
    if (result.ok) expect(result.state.environment.tideRemainingTurns).toBe(1);
  });
});

describe("environnement - orientation de Marée", () => {
  it("démarre Montante en Calme (createGameState) et bascule Descendante en atteignant les Abysses", () => {
    const filler = (ownerId: string) => Array.from({ length: 2 }, () => instance("marin-des-jetees", ownerId));
    let state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [testPlayer("p1", { deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });
    expect(state.environment.tideOrientation).toBe("montante");
    const result = dispatch(state, { type: "endTurn", playerId: state.activePlayerId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses");
    expect(result.state.environment.tideOrientation).toBe("descendante");
  });

  it("Descendante fait reculer la Marée vers le Calme, jamais au-delà", () => {
    const filler = (ownerId: string) => Array.from({ length: 1 }, () => instance("marin-des-jetees", ownerId));
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [testPlayer("p1", { deck: filler("p1") }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "descendante" }),
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("calme");
    // À Calme, l'orientation redevient naturellement Montante.
    expect(result.state.environment.tideOrientation).toBe("montante");
  });

  it("tideInvertOrientation inverse l'orientation courante", () => {
    const state = testGameState({
      players: [testPlayer("p1"), testPlayer("p2")],
      environment: testEnvironment({ tideOrientation: "montante" }),
    });
    const result = resolveEffect(
      state,
      { type: "tideInvertOrientation", target: { kind: "allPlayers" } },
      { controllerId: "p1", turnNumber: 1 }
    );
    expect(result.state.environment.tideOrientation).toBe("descendante");
  });

  it("Cartes des Courants (bris) inverse l'orientation de la prochaine transition", () => {
    const currents = instance("cartes-des-courants", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [currents] }), testPlayer("p2")],
      environment: testEnvironment({ tideOrientation: "montante" }),
    });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: currents.instanceId });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.environment.tideOrientation).toBe("descendante");
  });
});

describe("environnement - malus globaux des Marées (verrouillé, Notion 'Moteur de partie')", () => {
  it("Abysses : à l'entrée, -2 Ancrage (une fois) et -2 Raison max (avec clampage immédiat de la Raison courante)", () => {
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [
        testPlayer("p1", { shipId: "lerrant", anchor: 20, reason: 9, reasonMax: 10 }),
        testPlayer("p2", { shipId: "lerrant", anchor: 20, reason: 10, reasonMax: 10 }),
      ],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses");

    const p1 = result.state.players[0];
    const p2 = result.state.players[1];
    expect(p1.anchor).toBe(18); // 20 - 2
    expect(p1.reasonMax).toBe(8); // 10 - 2
    expect(p1.reason).toBe(8); // 9, clampé à la nouvelle Raison max (8)
    expect(p2.anchor).toBe(18);
    expect(p2.reasonMax).toBe(8);
    expect(p2.reason).toBe(8); // 10, clampé à 8
  });

  it("Abysses : le malus de Navire (Équipage à bout, Brise-Lames) ajoute une perte de Raison ponctuelle à l'entrée", () => {
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", anchor: 24, reason: 8, reasonMax: 8 }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p1 = result.state.players[0];
    expect(p1.anchor).toBe(22); // 24 - 2
    expect(p1.reasonMax).toBe(6); // 8 - 2
    // Raison courante : 8 - 1 (Équipage à bout) = 7, puis clampée à la nouvelle max (6).
    expect(p1.reason).toBe(6);
  });

  it("Abysses : à la sortie, la Raison maximale est restaurée", () => {
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [
        testPlayer("p1", { shipId: "lerrant", reasonMax: 8, reason: 5 }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 1, tideOrientation: "descendante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.state.players[0].reasonMax).toBe(10); // 8 + 2 restauré
  });

  it("Houle : une carte déjà MALADE perd 1 PV/Résistance à chaque tour tant que la Houle reste active", () => {
    const sickUnit = instance("baleine-aux-cicatrices-blanches", "p1", { statuses: [STATUS_MALADE] }); // 5/6
    const state = testGameState({
      players: [testPlayer("p1", { board: [sickUnit] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 5 }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("houle");
    const unit = result.state.players[0].board.find((u) => u.instanceId === sickUnit.instanceId);
    expect(unit?.damageMarked).toBe(1);
    expect(unit?.statuses).toContain(STATUS_MALADE);
  });

  it("Houle : seuls Marins/Créatures peuvent devenir MALADE — jamais une Structure/Objet/Équipement", () => {
    const structure = instance("caisses-arrimees", "p1"); // Structure : aucune "santé" au sens du malus
    // rngState: 1 est un tirage RNG déterministe connu pour déclencher le tirage MALADE si le seul candidat
    // sur le board (cette Structure) n'est pas exclu — vérifié contre l'ancien `collectBoardCards` non filtré
    // avant cette correction, qui la marquait bien MALADE dès ce premier tour.
    const state = testGameState({
      players: [testPlayer("p1", { board: [structure] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 5 }),
      rngState: 1,
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unit = result.state.players[0].board.find((u) => u.instanceId === structure.instanceId);
    expect(unit?.statuses ?? []).not.toContain(STATUS_MALADE);
  });

  it("le statut MALADE est retiré automatiquement (sans dégât ce tour-là) dès que la Marée quitte la Houle", () => {
    const sickUnit = instance("baleine-aux-cicatrices-blanches", "p1", { statuses: [STATUS_MALADE] });
    const state = testGameState({
      turnNumber: 2, // pair : le endTurn suivant amène turnNumber=3 (impair) => la Marée progresse.
      players: [testPlayer("p1", { board: [sickUnit] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    const unit = result.state.players[0].board.find((u) => u.instanceId === sickUnit.instanceId);
    expect(unit?.statuses ?? []).not.toContain(STATUS_MALADE);
    expect(unit?.damageMarked).toBe(0);
  });

  it("Houle : peut rendre une carte du board aléatoirement MALADE au fil des tours (10% de chance par tour)", () => {
    const unit = instance("baleine-aux-cicatrices-blanches", "p1"); // 5/6, encaisse largement la maladie
    const maxTurns = 120;
    const filler = (ownerId: string) => Array.from({ length: maxTurns }, () => instance("marin-des-jetees", ownerId));
    let state = testGameState({
      players: [
        testPlayer("p1", { board: [unit], deck: filler("p1") }),
        testPlayer("p2", { deck: filler("p2") }),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: maxTurns + 10 }),
    });

    let becameSick = false;
    for (let i = 0; i < maxTurns && !becameSick; i++) {
      const result = dispatch(state, { type: "endTurn", playerId: state.activePlayerId });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
      becameSick = (
        state.players[0].board.find((u) => u.instanceId === unit.instanceId)?.statuses ?? []
      ).includes(STATUS_MALADE);
    }

    expect(becameSick).toBe(true);
  });
});

describe("environnement - decks préconstruits", () => {
  it("chaque deck de base système (Courlis, Errant, Brise-Lames) est un deck valide (40-50 cartes, max_copies respecté)", async () => {
    const { PRECONSTRUCTED_DECKS } = await import("@/game/cards/decks/preconstructed");
    expect(PRECONSTRUCTED_DECKS).toHaveLength(3);
    for (const deck of PRECONSTRUCTED_DECKS) {
      const validation = validateDeckList(deck);
      expect(validation.ok, `${deck.name}: ${!validation.ok ? validation.error : ""}`).toBe(true);
    }
  });
});
