import { describe, expect, it } from "vitest";
import { createGameState } from "@/game/state/createGameState";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import { evaluateState } from "@/game/bot/evaluateState";
import { searchBestAction } from "@/game/bot/searchTurn";
import { dispatch } from "@/game/engine";
import { getShipDefinition } from "@/game/environment/shipData";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

function newGame(seed = 5): GameState {
  return createGameState({
    gameId: "eval",
    player1: { id: "a", deck: PLAYABLE_DECKS[0]! },
    player2: { id: "b", deck: PLAYABLE_DECKS[1]! },
    seed,
  });
}

/** Pose une carte de force sur le plateau d'un joueur, pour isoler un cas. */
function withOnBoard(state: GameState, playerId: string, cardId: string, instanceId = `forced-${cardId}`): GameState {
  const unit = {
    instanceId,
    cardId,
    ownerId: playerId,
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, board: [...p.board, unit] } : p)) as GameState["players"],
  };
}

function withAnchor(state: GameState, playerId: string, anchor: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, anchor } : p)) as GameState["players"],
  };
}

describe("évaluation du bot — Ancrage", () => {
  it("l'Ancrage AU-DELÀ du départ vaut bien moins qu'en-deçà", () => {
    const base = newGame();
    const start = getShipDefinition(base.players[0]!.shipId).startingAnchor;

    // Deux points gagnés sous le plafond, contre deux points gagnés au-dessus.
    const vitalGain =
      evaluateState(withAnchor(base, "a", start - 3), "a") - evaluateState(withAnchor(base, "a", start - 5), "a");
    const surplusGain =
      evaluateState(withAnchor(base, "a", start + 4), "a") - evaluateState(withAnchor(base, "a", start + 2), "a");

    expect(vitalGain).toBeGreaterThan(0);
    expect(surplusGain).toBeGreaterThan(0);
    // C'est CE rapport qui empêchait le bot de comprendre qu'un soin à
    // pleine santé ne lui apporte presque rien.
    expect(surplusGain).toBeLessThan(vitalGain / 3);
  });

  it("l'Ancrage bas est traité comme un danger, pas comme un simple nombre", () => {
    const base = newGame();
    // Passer de 2 à 4 doit valoir plus que passer de 12 à 14 : ce sont les
    // mêmes deux points, mais pas le même enjeu.
    const nearDeath = evaluateState(withAnchor(base, "a", 4), "a") - evaluateState(withAnchor(base, "a", 2), "a");
    const comfortable = evaluateState(withAnchor(base, "a", 14), "a") - evaluateState(withAnchor(base, "a", 12), "a");
    expect(nearDeath).toBeGreaterThan(comfortable);
  });
});

describe("évaluation du bot — sabordage gratuit", () => {
  /*
   * LA RÉGRESSION D'ORIGINE.
   *
   * « Caisses Arrimées » est une Structure à 3 de Résistance dont le
   * Sabordage rend 2 Ancrage. Le moteur ne plafonne pas l'Ancrage, et
   * l'ancienne évaluation le comptait linéairement : saborder la Structure
   * à pleine santé notait +2,4, et le bot le faisait donc dès qu'il la
   * posait — en jeu, une perte sèche. C'est le « sabordage sans intérêt »
   * remonté en partie.
   */
  it("saborder une Structure fraîche pour de l'Ancrage en trop est une PERTE", () => {
    const state = withOnBoard(newGame(), "a", "caisses-arrimees");
    const before = evaluateState(state, "a");

    const result = dispatch(state, { type: "saborder", playerId: "a", instanceId: "forced-caisses-arrimees" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(evaluateState(result.state, "a")).toBeLessThan(before);
  });

  it("aucun permanent posé ne vaut zéro — s'en défaire n'est jamais gratuit", () => {
    const base = newGame();
    // Un Objet à 1 de Résistance, sans Puissance : le cas le plus proche de
    // « ne vaut rien » selon les seules statistiques.
    const withObject = withOnBoard(base, "a", "cartes-des-courants");
    expect(evaluateState(withObject, "a")).toBeGreaterThan(evaluateState(base, "a"));
  });
});

describe("recherche du bot", () => {
  it("est déterministe : deux fois la même position, deux fois le même coup", () => {
    const state = newGame(11);
    const first = searchBestAction(state, state.activePlayerId!);
    expect(first).not.toBeNull();
    for (let i = 0; i < 3; i += 1) {
      expect(searchBestAction(state, state.activePlayerId!)).toEqual(first);
    }
  });

  it("ne rend jamais qu'un coup LÉGAL", () => {
    let state = newGame(3);
    for (let i = 0; i < 40 && state.status === "active"; i += 1) {
      const playerId = state.activePlayerId;
      if (!playerId) break;
      const action = searchBestAction(state, playerId);
      if (!action) break;
      const result = dispatch(state, action);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      if (result.state === state) break;
      state = result.state;
    }
  });
});

describe("évaluation du bot — la peur", () => {
  /*
   * LE BOURRINAGE REMONTÉ EN PARTIE (retour de test du 20/09/2026) : « le
   * bot préfère taper direct les points de vie », « pas de défense, pas de
   * peur ». La menace subie comptait 1,1 le point de Puissance quand un
   * point d'Ancrage en vaut 3 : un échange même FAVORABLE passait derrière
   * les dégâts directs.
   */
  it("préfère un échange favorable aux dégâts directs", () => {
    const attaquant = instance("matelot-du-sans-nom", "a"); // 3 / 4
    const defenseur = instance("raie-des-fosses", "b"); // 3 / 3 : meurt, et le mien survit
    const state = testGameState({
      players: [
        testPlayer("a", { board: [attaquant] }),
        testPlayer("b", { board: [defenseur] }),
      ],
      phase: "combatPhase",
      activePlayerId: "a",
      priorityPlayerId: "a",
    });

    const surLUnite = dispatch(state, { type: "attack", playerId: "a", attackerInstanceId: attaquant.instanceId, defenderInstanceId: defenseur.instanceId });
    const surLeNavire = dispatch(state, { type: "attack", playerId: "a", attackerInstanceId: attaquant.instanceId });
    expect(surLUnite.ok).toBe(true);
    expect(surLeNavire.ok).toBe(true);
    if (!surLUnite.ok || !surLeNavire.ok) return;

    expect(evaluateState(surLUnite.state, "a")).toBeGreaterThan(evaluateState(surLeNavire.state, "a"));
  });

  it("un corps adverse laissé debout coûte autant qu'un point de coque", () => {
    // Deux positions identiques, à ceci près qu'un 3 / 3 adverse est là ou
    // non : l'écart doit se lire comme une vraie perte, pas comme un détail.
    const sans = testGameState({ players: [testPlayer("a"), testPlayer("b")] });
    const avec = testGameState({
      players: [testPlayer("a"), testPlayer("b", { board: [instance("raie-des-fosses", "b")] })],
    });
    const ecart = evaluateState(sans, "a") - evaluateState(avec, "a");
    // Le corps vaut son matériel (≈ 8) PLUS la menace de ses 3 Puissance,
    // désormais comptée au prix de l'Ancrage.
    expect(ecart).toBeGreaterThan(15);
  });
});
