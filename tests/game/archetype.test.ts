import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { instance, testGameState, testPlayer } from "./testHelpers";

const PEON = "peon-cra-poiscail";

/** Péons présents sur le plateau d'un joueur. */
function peons(board: readonly { cardId: string }[]): number {
  return board.filter((unit) => unit.cardId === PEON).length;
}

describe("archétype Cra-Poiscail — invocation de Péons", () => {
  it("n'invoque rien si le Sauteur arrive seul, un Péon s'il accompagne déjà un Cra-Poiscail", () => {
    const sauteurSeul = instance("cra-poiscail-sauteur", "p1");
    const alone = testGameState({
      players: [testPlayer("p1", { hand: [sauteurSeul], reason: 10 }), testPlayer("p2")],
    });

    const played = dispatch(alone, { type: "playCard", playerId: "p1", instanceId: sauteurSeul.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(peons(played.state.players[0]!.board)).toBe(0);

    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const withFriend = testGameState({
      players: [
        testPlayer("p1", { hand: [sauteur], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const summoned = dispatch(withFriend, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(peons(summoned.state.players[0]!.board)).toBe(1);
  });

  it("donne au Péon invoqué une des trois variantes d'illustration, tirée avec le RNG de la partie", () => {
    const def = getCardDefinition(PEON);
    expect(def.illustrationVariants).toBe(3);

    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [sauteur], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const peon = result.state.players[0]!.board.find((unit) => unit.cardId === PEON)!;
    expect(peon.illustrationVariant).toBeGreaterThanOrEqual(1);
    expect(peon.illustrationVariant).toBeLessThanOrEqual(3);
    // Le RNG de la partie a avancé : le tirage n'est pas un `Math.random()`
    // hors de l'état, il est rejouable à l'identique.
    expect(result.state.rngState).not.toBe(state.rngState);
  });

  it("remplit les Slots libres sans les dépasser — on n'invoque pas plus qu'il n'en tient", () => {
    // Le Brise-Lames a 6 Slots. "Fesses en Avant !" est une Anomalie à
    // résolution immédiate : elle n'occupe aucun Slot (`permanent: false`).
    // Avec 5 permanents déjà posés, il ne reste donc qu'une place pour ses
    // 2 Péons.
    const anomalie = instance("fesses-en-avant", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", {
          hand: [anomalie],
          board: [
            instance("tetard-fesse", "p1"),
            instance("tetard-fesse", "p1"),
            instance("tetard-fesse", "p1"),
            instance("ptite-fesse", "p1"),
            instance("ptite-fesse", "p1"),
          ],
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const board = result.state.players[0]!.board;
    expect(peons(board)).toBe(1);
    expect(board.length).toBeLessThanOrEqual(6);
  });

  it("laisse les Péons de « Fesses en Avant ! » attaquer le tour même (Ruée)", () => {
    const anomalie = instance("fesses-en-avant", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [anomalie], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summoned = result.state.players[0]!.board.filter((unit) => unit.cardId === PEON);
    expect(summoned).toHaveLength(2);
    expect(summoned.every((unit) => unit.summoningSick === false)).toBe(true);
  });
});

describe("archétype Cra-Poiscail — Le Seau", () => {
  it("invoque 1 Péon depuis le board, 2 en Bris depuis la main auprès d'un Cra-Poiscail", () => {
    const seauBoard = instance("le-seau", "p1");
    const fromBoard = testGameState({
      players: [
        testPlayer("p1", { board: [seauBoard, instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const broken = dispatch(fromBoard, { type: "breakObject", playerId: "p1", instanceId: seauBoard.instanceId });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    // Depuis le board : la clause "depuis la main" ne s'applique pas.
    expect(peons(broken.state.players[0]!.board)).toBe(1);

    const seauHand = instance("le-seau", "p1");
    const fromHand = testGameState({
      players: [
        testPlayer("p1", { hand: [seauHand], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const brokenFromHand = dispatch(fromHand, {
      type: "breakObject",
      playerId: "p1",
      instanceId: seauHand.instanceId,
      fromHand: true,
    });
    expect(brokenFromHand.ok).toBe(true);
    if (!brokenFromHand.ok) return;
    expect(peons(brokenFromHand.state.players[0]!.board)).toBe(2);
  });

  it("n'invoque qu'un Péon en Bris depuis la main sans aucun Cra-Poiscail en jeu — le Péon créé ne satisfait pas sa propre condition", () => {
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [seau], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId, fromHand: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(peons(result.state.players[0]!.board)).toBe(1);
  });
});

describe("archétype Cra-Poiscail — bonus de banc", () => {
  it("donne +1 Puissance au Banc à partir de 3 AUTRES Cra-Poiscail, pas avant", () => {
    const banc = instance("banc-de-cra-poiscail", "p1");
    const board = [banc, instance("tetard-fesse", "p1"), instance("ptite-fesse", "p1")];
    const player = testPlayer("p1", { board });

    // 2 autres Cra-Poiscail (le Banc ne se compte pas lui-même) : pas de bonus.
    const below = computeEffectiveStats(banc, "calme", { controllerBoard: board, controllerReason: player.reason });
    expect(below.attack).toBe(2);

    const biggerBoard = [...board, instance("cra-poiscail-grand-gueule", "p1")];
    const above = computeEffectiveStats(banc, "calme", {
      controllerBoard: biggerBoard,
      controllerReason: player.reason,
    });
    expect(above.attack).toBe(3);
  });

  it("compte les Péons invoqués comme des Cra-Poiscail", () => {
    const banc = instance("banc-de-cra-poiscail", "p1");
    const board = [banc, instance(PEON, "p1"), instance(PEON, "p1"), instance(PEON, "p1")];
    const stats = computeEffectiveStats(banc, "calme", { controllerBoard: board, controllerReason: 10 });
    expect(stats.attack).toBe(3);
  });
});

describe("jetons", () => {
  it("le Péon est hors du catalogue collectionnable mais résolvable par le moteur", async () => {
    const { CORE_SET } = await import("@/game/cards/sets/core");
    expect(CORE_SET.some((def) => def.id === PEON)).toBe(false);
    expect(getCardDefinition(PEON).token).toBe(true);
  });
});
