import { describe, expect, it } from "vitest";
import { createGameState, dispatch, PLAYABLE_DECKS, RULES, type GameState } from "@/game";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Règles du tour arrêtées le 08/10/2026 :
 *   - pas de fin de tour en Phase principale 1 : on passe d'abord en combat —
 *     sauf quand rien ne peut se battre (tout premier tour, unités qui
 *     arrivent, Navire qui ne tire pas) ;
 *   - au tout premier tour de la partie, le joueur qui commence n'attaque
 *     pas, Pied marin compris ;
 *   - le joueur qui commence ne pioche pas à son premier tour.
 */

function deck(owner: string) {
  return Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
}

function table(overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [testPlayer("p1", { deck: deck("p1") }), testPlayer("p2", { shipId: "le-goliath", deck: deck("p2") })],
    ...overrides,
  });
}

/** Une table où p1 a une unité prête à attaquer. */
function tableAvecAttaquant(overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [
      testPlayer("p1", { deck: deck("p1"), board: [instance("marin-des-jetees", "p1")] }),
      testPlayer("p2", { shipId: "le-goliath", deck: deck("p2") }),
    ],
    ...overrides,
  });
}

describe("fin de tour", () => {
  it("est refusée en Phase principale 1 quand une unité peut attaquer", () => {
    const result = dispatch(tableAvecAttaquant({ phase: "mainPhase" }), { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Phase principale 1/);
  });

  it("est possible dès la Phase principale 1 quand rien ne peut se battre", () => {
    // Plateau vide.
    const vide = dispatch(table({ phase: "mainPhase" }), { type: "endTurn", playerId: "p1" });
    expect(vide.ok && vide.state.activePlayerId).toBe("p2");
    // Une unité tout juste arrivée, sans Pied marin.
    const arrivee = tableAvecAttaquant({ phase: "mainPhase" });
    arrivee.players[0].board[0]!.summoningSick = true;
    const fin = dispatch(arrivee, { type: "endTurn", playerId: "p1" });
    expect(fin.ok && fin.state.activePlayerId).toBe("p2");
  });

  it("est possible dès la Phase principale 1 au tout premier tour, où l'on ne peut pas attaquer", () => {
    const result = dispatch(table({ phase: "mainPhase", turnNumber: 1 }), { type: "endTurn", playerId: "p1" });
    expect(result.ok && result.state.activePlayerId).toBe("p2");
  });

  it("est possible dès la Phase de combat, et en Phase principale 2", () => {
    const combat = dispatch(table({ phase: "mainPhase" }), { type: "advancePhase", playerId: "p1" });
    expect(combat.ok && combat.state.phase).toBe("combatPhase");
    if (!combat.ok) return;
    const finCombat = dispatch(combat.state, { type: "endTurn", playerId: "p1" });
    expect(finCombat.ok && finCombat.state.activePlayerId).toBe("p2");

    const principale2 = dispatch(combat.state, { type: "advancePhase", playerId: "p1" });
    expect(principale2.ok && principale2.state.phase).toBe("mainPhase2");
    if (!principale2.ok) return;
    const fin = dispatch(principale2.state, { type: "endTurn", playerId: "p1" });
    expect(fin.ok && fin.state.activePlayerId).toBe("p2");
  });
});

describe("premier tour de la partie", () => {
  // La Sterne des Embruns a Pied marin : elle attaque dès son arrivée.
  const sterne = () => instance("sterne-des-embruns", "p1", { summoningSick: true });

  it("le joueur qui commence n'attaque pas, même avec Pied marin", () => {
    const unite = sterne();
    const state = testGameState({ turnNumber: 1, phase: "combatPhase", players: [testPlayer("p1", { board: [unite] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: unite.instanceId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/premier tour/);
  });

  it("dès son tour suivant, Pied marin attaque le tour de son arrivée", () => {
    const unite = sterne();
    const state = testGameState({ turnNumber: 3, phase: "combatPhase", players: [testPlayer("p1", { board: [unite] }), testPlayer("p2", { shipId: "le-goliath" })] });
    expect(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: unite.instanceId }).ok).toBe(true);
  });

  it("le joueur qui commence ne pioche pas ; le second pioche à son premier tour", () => {
    const start = createGameState({
      gameId: "regles-du-tour",
      player1: { id: "p1", deck: PLAYABLE_DECKS[0]! },
      player2: { id: "p2", deck: PLAYABLE_DECKS[1]! },
    });
    const [p1, p2] = start.players;
    expect(start.activePlayerId).toBe("p1");
    expect(p1.hand).toHaveLength(RULES.STARTING_HAND_SIZE);
    expect(start.eventLog.some((event) => event.type === "DRAW_CARD")).toBe(false);

    const tourP2 = dispatch({ ...start, phase: "mainPhase2" }, { type: "endTurn", playerId: "p1" });
    expect(tourP2.ok).toBe(true);
    if (!tourP2.ok) return;
    expect(tourP2.state.players[1].hand).toHaveLength(p2.hand.length + 1);
  });
});
