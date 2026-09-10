import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
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
  it("progresse selon les durées d'état (Calme 2, Houle 2) et applique des dégâts environnementaux en Tempête", () => {
    // Decks non vides : sur 4 endTurn, chaque joueur pioche 2 fois. Un deck
    // vide déclencherait un Jugement de l'Océan qui terminerait la partie
    // avant la fin de la boucle.
    const filler = (ownerId: string) =>
      Array.from({ length: 2 }, () => instance("marin-des-jetees", ownerId));
    let state = testGameState({
      // p1: Le Brise-Lames (résiste 2 Tempête), p2: L'Errant (aucune résistance Tempête)
      players: [
        testPlayer("p1", { deck: filler("p1") }),
        testPlayer("p2", { shipId: "lerrant", deck: filler("p2") }),
      ],
    });
    for (let i = 0; i < 4; i++) {
      const result = dispatch(state, { type: "endTurn", playerId: state.activePlayerId });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.environment.tideState).toBe("tempete");
    expect(state.players[0].anchor).toBe(24); // Le Brise-Lames : résistance annule les 2 dégâts de base
    expect(state.players[1].anchor).toBe(18); // L'Errant : 20 - 2
  });

  it("une unité inactive par affinité de Marée (Masse Noire pendant Calme) ne peut pas attaquer", () => {
    const mass = instance("masse-noire", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [mass] }), testPlayer("p2")],
      // testGameState() par défaut est en Calme.
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: mass.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Masse Noire gagne +1 Puissance pendant Abysses (affinité de Marée)", () => {
    const mass = instance("masse-noire", "p1");
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

  it("ignoreNextTideDamage annule la prochaine perte d'Ancrage de cet état pour ce joueur", () => {
    let state = testGameState({
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
    expect(result.state.players[0].anchor).toBe(20); // aurait dû perdre 2 sans l'ignore (L'Errant : 20 de départ)
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
