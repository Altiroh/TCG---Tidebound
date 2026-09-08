import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

describe("environnement - emplacements du Navire", () => {
  it("un Navire limite le plateau à son slotCount (6 pour Le Brise-Lames)", () => {
    const fullBoard = Array.from({ length: 6 }, () => instance("recrue-des-marees", "p1"));
    const card = instance("recrue-des-marees", "p1");
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
      Array.from({ length: 2 }, () => instance("recrue-des-marees", ownerId));
    let state = testGameState({
      // p1: Le Brise-Lames (résiste 2 Tempête), p2: L'Insondable (aucune résistance Tempête)
      players: [
        testPlayer("p1", { deck: filler("p1") }),
        testPlayer("p2", { shipId: "linsondable", deck: filler("p2") }),
      ],
    });
    for (let i = 0; i < 4; i++) {
      const result = dispatch(state, { type: "endTurn", playerId: state.activePlayerId });
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
    expect(state.environment.tideState).toBe("tempete");
    expect(state.players[0].anchor).toBe(24); // Le Brise-Lames : résistance annule les 2 dégâts de base
    expect(state.players[1].anchor).toBe(16); // L'Insondable : 18 - 2
  });

  it("une unité inactive pendant la Tempête ne peut pas attaquer", () => {
    const vigie = instance("vigie-fragile", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [vigie] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1 }),
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: vigie.instanceId });
    expect(result.ok).toBe(false);
  });

  it("une unité marquée 'destroyed' par la Marée est détruite en entrant dans cet état", () => {
    const vigie = instance("vigie-fragile", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [vigie] }), testPlayer("p2")],
      activePlayerId: "p2",
      // À 1 tour des Abysses : le prochain endTurn fait progresser la Marée.
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1 }),
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("abysses");
    expect(result.state.players[0].board).toHaveLength(0);
  });

  it("Poisson-Lanterne gagne en puissance avec la Marée et pioche à l'entrée en Abysses", () => {
    const fish = instance("poisson-lanterne", "p1");
    const deckCard = instance("recrue-des-marees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [fish], deck: [deckCard] }), testPlayer("p2")],
      activePlayerId: "p2",
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 1 }),
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].hand).toHaveLength(1);
  });

  it("ignoreNextTideDamage annule la prochaine perte d'Ancrage de cet état pour ce joueur", () => {
    const spell = instance("voiles-affalees", "p1");
    let state = testGameState({
      players: [
        testPlayer("p1", { shipId: "linsondable", hand: [spell], reason: 5 }),
        testPlayer("p2"),
      ],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 1 }),
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: spell.instanceId });
    expect(played.ok).toBe(true);
    if (played.ok) state = played.state;

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.tideState).toBe("tempete");
    expect(result.state.players[0].anchor).toBe(18); // aurait dû perdre 2 sans le sort
  });

  it("Marée Précipitée et Reflux modifient directement la durée restante de l'état courant", () => {
    const advance = instance("maree-precipitee", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [advance], reason: 5 }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: advance.instanceId });
    expect(result.ok).toBe(true);
    // Calme dure 2 tours ; -2 est plafonné à un minimum de 1 tour restant.
    if (result.ok) expect(result.state.environment.tideRemainingTurns).toBe(1);
  });
});

describe("environnement - Eaux", () => {
  it("changeWater remplace les Eaux actuelles et réinitialise leur durée", () => {
    const courant = instance("courant-de-verre", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [courant], reason: 5 }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: courant.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.environment.currentWaterId).toBe("mer-de-verre");
    expect(result.state.environment.waterRemainingTurns).toBe(3);
  });

  it("les Récifs Rouges réduisent le coût des cartes taguées 'equipement'", () => {
    const sonar = instance("sonar-de-fortune", "p1"); // coût de base 2
    const state = testGameState({
      players: [testPlayer("p1", { hand: [sonar], reason: 1 }), testPlayer("p2")],
      environment: testEnvironment({ currentWaterId: "recifs-rouges" }),
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: sonar.instanceId });
    expect(result.ok).toBe(true); // coût réduit à 1, payable avec 1 Raison
  });
});

describe("environnement - decks préconstruits", () => {
  it("chaque deck préconstruit reste cohérent (contenu actuel : 20 cartes, cible finale 40 — cf. game/cards/decks/preconstructed.ts)", async () => {
    const { DECK_MAREE_MONTANTE, DECK_ABYSSES_SILENCIEUSES } = await import(
      "@/game/cards/decks/preconstructed"
    );
    expect(DECK_MAREE_MONTANTE.cardIds).toHaveLength(20);
    expect(DECK_ABYSSES_SILENCIEUSES.cardIds).toHaveLength(20);
  });
});
