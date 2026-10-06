import { describe, expect, it } from "vitest";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { searchBestAction } from "@/game/bot/searchTurn";
import { dispatch } from "@/game/engine";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/** Aucune bourde : le tirage reste au-dessus de toute marge d'erreur. */
const noMistake = () => 0.99;

/**
 * Le Théâtre Englouti en Phase principale 2 : Il Dottore a déjà attaqué, Le
 * Masque Fendu est en main, la Raison suffit pour rappeler puis rejouer.
 */
function pioche(n: number, owner: string) {
  return Array.from({ length: n }, () => instance("tetard-fesse", owner));
}

function theatreApresCombat(): { state: GameState; dottoreId: string; masqueId: string } {
  const dottore = instance("il-dottore-des-noyes", "p1", { hasAttackedThisTurn: true });
  const masque = instance("le-masque-fendu", "p1");
  const state = testGameState({
    phase: "mainPhase2",
    players: [
      testPlayer("p1", {
        reason: 10,
        board: [dottore],
        // Une carte à défausser : « piochez puis défaussez » ne peut pas
        // viser la carte piochée, et sans elle le Dottore rappelé serait la
        // seule défausse possible (règle du 05/10/2026).
        hand: [masque, instance("tetard-fesse", "p1")],
        // Une vraie pioche des deux côtés : vide, elle annoncerait le Jugement
        // de l'Océan au prochain tour, et le bot le lit (`graveyardValue.ts`).
        deck: [instance("pulcinella-gonfle", "p1"), instance("pulcinella-gonfle", "p1"), ...pioche(20, "p1")],
      }),
      testPlayer("p2", { shipId: "le-goliath", board: [instance("canonnier-fele", "p2")], deck: pioche(20, "p2") }),
    ],
  });
  return { state, dottoreId: dottore.instanceId, masqueId: masque.instanceId };
}

/** Joue le tour du bot jusqu'à ce qu'il rende la main (ou `limit` coups). */
function playOut(state: GameState, limit = 12): { state: GameState; played: string[]; broken: Array<{ cardId: string; target?: string }> } {
  const played: string[] = [];
  const broken: Array<{ cardId: string; target?: string }> = [];
  let current = state;
  for (let i = 0; i < limit && current.activePlayerId === "p1" && current.status === "active"; i += 1) {
    const actor = current.pendingReaction?.awaitingPlayerId ?? current.pendingChoice?.playerId ?? "p1";
    const action = chooseBotAction(current, actor, "moyen", noMistake);
    const result = dispatch(current, action);
    if (!result.ok) throw new Error(result.error);
    if (action.type === "breakObject") {
      const all = current.players.flatMap((p) => [...p.hand, ...p.board]);
      broken.push({ cardId: all.find((c) => c.instanceId === action.instanceId)!.cardId, target: action.targetInstanceId });
    }
    for (const e of result.events) if (e?.type === "PLAY_CARD") played.push(e.cardId);
    current = result.state;
  }
  return { state: current, played, broken };
}

describe("bot — rappel puis rejeu", () => {
  it("rappelle une Marionnette qui a déjà attaqué, puis la rejoue pour son arrivée", () => {
    const { state, dottoreId } = theatreApresCombat();

    // Le Masque peut être brisé depuis la main ou posé puis brisé : les deux
    // chemins sont légaux, seul compte l'enchaînement.
    const { state: after, played, broken } = playOut(state);
    expect(broken).toContainEqual({ cardId: "le-masque-fendu", target: dottoreId });
    expect(played).toContain("il-dottore-des-noyes");
    const board = after.players.find((p) => p.id === "p1")!.board;
    expect(board.some((u) => u.cardId === "il-dottore-des-noyes")).toBe(true);
  });

  /*
   * « Difficile » ne fait PAS le rappel ici, et il a raison.
   *
   * Ce test attendait le rappel du Dottore. Il ne passait que parce que la
   * pioche adverse était VIDE : dans sa recherche, la riposte adverse
   * commençait par une pioche impossible, donc par un Jugement de l'Océan qui
   * terminait la partie — la décision tenait à cet accident, pas au combo.
   * Avec de vraies pioches (et le Jugement désormais lu par l'évaluation,
   * `graveyardValue.ts`), mesuré le 30/09/2026 après la riposte adverse :
   * poser le Masque vaut −2,2, le rappel −6,2. Le rappel dépense 3 Raison
   * pour une arrivée qui ne rapporte presque rien dans cette position, et
   * perd le Masque ; posé, il reste disponible pour un meilleur moment.
   * « Moyen » sait toujours faire l'enchaînement (test précédent).
   *
   * 02/10/2026 : la mesure a changé avec la carte. Le malus d'Il Dottore
   * (« jusqu'à VOTRE prochain tour ») tombait jusque-là dès l'entame du tour
   * adverse — il ne couvrait donc jamais la riposte. Corrigé, il la couvre :
   * l'arrivée rejouée paie désormais, et « difficile » rappelle le Dottore
   * avec le Masque brisé depuis la main.
   */
  it("« difficile » rappelle le Dottore : son malus couvre maintenant la riposte adverse", () => {
    const { state, dottoreId, masqueId } = theatreApresCombat();
    expect(searchBestAction(state, "p1")).toMatchObject({ type: "breakObject", instanceId: masqueId, targetInstanceId: dottoreId });
  });

  it("ne rappelle pas AVANT le combat une unité qui peut encore attaquer", () => {
    const { state, masqueId } = theatreApresCombat();
    const beforeCombat: GameState = {
      ...state,
      phase: "mainPhase",
      players: state.players.map((p) =>
        p.id === "p1" ? { ...p, board: p.board.map((u) => ({ ...u, hasAttackedThisTurn: false })) } : p
      ) as GameState["players"],
    };
    const action = chooseBotAction(beforeCombat, "p1", "moyen", noMistake);
    expect(action).not.toMatchObject({ type: "breakObject", instanceId: masqueId });
    expect(searchBestAction(beforeCombat, "p1")).not.toMatchObject({ type: "breakObject", instanceId: masqueId });
  });

  it("ne rappelle pas quand il n'a pas la Raison de rejouer", () => {
    const { state, masqueId } = theatreApresCombat();
    const broke: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, reason: 2 } : p)) as GameState["players"],
    };
    const { broken } = playOut(broke);
    expect(broken.map((b) => b.cardId)).not.toContain("le-masque-fendu");
    expect(masqueId).toBeTruthy();
  });
});

describe("bot — après le combat", () => {
  it("passe en Phase principale 2 au lieu de terminer le tour depuis le combat", () => {
    const state = testGameState({ phase: "combatPhase" });
    const candidates = enumerateCandidateActions(state, "p1").map((a) => a.type);
    expect(candidates).toContain("advancePhase");
    expect(candidates).not.toContain("endTurn");
    expect(chooseBotAction(state, "p1", "moyen", noMistake).type).toBe("advancePhase");
  });

  it("en Phase principale 2, finit son tour plutôt que saborder ses propres permanents", () => {
    const state = testGameState({
      phase: "mainPhase2",
      players: [
        testPlayer("p1", { board: [instance("la-grande-fissure", "p1"), instance("porte-eclats", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    expect(chooseBotAction(state, "p1", "moyen", noMistake).type).toBe("endTurn");
    expect(searchBestAction(state, "p1")?.type).toBe("endTurn");
  });

  it("une bourde du bot n'est jamais un Sabordage", () => {
    const state = testGameState({
      phase: "mainPhase2",
      players: [
        testPlayer("p1", { board: [instance("la-grande-fissure", "p1"), instance("porte-eclats", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    // Tirage qui force la bourde, puis parcourt toute la fourchette.
    for (const pick of [0, 0.3, 0.6, 0.9]) {
      let calls = 0;
      const random = () => (calls++ === 0 ? 0 : pick);
      expect(chooseBotAction(state, "p1", "facile", random).type).not.toBe("saborder");
    }
  });
});
