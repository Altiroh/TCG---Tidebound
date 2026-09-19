import { describe, expect, it } from "vitest";
import { createGameState, dispatch, getCardDefinition, HIDDEN_CARD_ID, CATALOG_DECKS, toPlayerView } from "@/game";
import { instance, testGameState, testPlayer } from "./testHelpers";

function newMatch() {
  return createGameState({
    gameId: "view-test",
    player1: { id: "p1", deck: CATALOG_DECKS[0]! },
    player2: { id: "p2", deck: CATALOG_DECKS[1]! },
    seed: 42,
  });
}

/** Tous les `cardId` d'une vue, sérialisés — ce qu'un client pourrait lire dans ses outils réseau. */
function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe("toPlayerView — projection par joueur", () => {
  it("masque la main adverse mais garde le nombre de cartes", () => {
    const state = newMatch();
    const view = toPlayerView(state, "p1");
    const opponent = view.players[1];

    expect(opponent.hand).toHaveLength(state.players[1].hand.length);
    expect(opponent.hand.every((card) => card.cardId === HIDDEN_CARD_ID)).toBe(true);
    // Identifiants positionnels : aucune instance réelle ne transparaît.
    const realIds = new Set(state.players[1].hand.map((card) => card.instanceId));
    expect(opponent.hand.some((card) => realIds.has(card.instanceId))).toBe(false);
  });

  it("laisse la main du destinataire intacte", () => {
    const state = newMatch();
    expect(toPlayerView(state, "p1").players[0].hand).toEqual(state.players[0].hand);
  });

  it("masque le contenu et l'ordre des DEUX decks, y compris celui du destinataire", () => {
    const state = newMatch();
    const view = toPlayerView(state, "p1");

    for (const [index, player] of view.players.entries()) {
      expect(player.deck).toHaveLength(state.players[index]!.deck.length);
      expect(player.deck.every((card) => card.cardId === HIDDEN_CARD_ID)).toBe(true);
    }
  });

  it("efface la graine du générateur aléatoire", () => {
    const state = newMatch();
    expect(state.rngState).not.toBe(0);
    expect(toPlayerView(state, "p2").rngState).toBe(0);
  });

  it("ne laisse fuiter aucune carte cachée de l'adversaire, même en cherchant dans tout l'état sérialisé", () => {
    const state = newMatch();
    const view = toPlayerView(state, "p1");
    const text = serialized(view);

    // Une carte qui n'est QUE dans la main ou le deck adverse (jamais chez le destinataire, jamais publique)
    // ne doit apparaître nulle part.
    const publicIds = new Set(state.players[0].hand.map((card) => card.cardId));
    const secretIds = [...state.players[1].hand, ...state.players[1].deck]
      .map((card) => card.cardId)
      .filter((cardId) => !publicIds.has(cardId));
    expect(secretIds.length).toBeGreaterThan(0);
    for (const cardId of secretIds) expect(text).not.toContain(`"${cardId}"`);
  });

  it("masque l'instance piochée par l'adversaire dans le journal, pas celle du destinataire", () => {
    const state = newMatch();
    const afterTurn = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(afterTurn.ok).toBe(true);
    if (!afterTurn.ok) return;

    const draws = (viewerId: string) =>
      toPlayerView(afterTurn.state, viewerId).eventLog.filter((event) => event.type === "DRAW_CARD");

    const p2Draw = afterTurn.state.eventLog.find((event) => event.type === "DRAW_CARD" && event.playerId === "p2");
    expect(p2Draw).toBeDefined();
    expect(draws("p1").find((event) => event.playerId === "p2")).toMatchObject({ instanceId: "hidden" });
    expect(draws("p2").find((event) => event.playerId === "p2")).toEqual(p2Draw);
  });

  it("conserve la longueur du journal (l'UI s'appuie dessus pour détecter les nouveaux événements)", () => {
    const state = newMatch();
    expect(toPlayerView(state, "p1").eventLog).toHaveLength(state.eventLog.length);
  });

  describe("Structure adverse invisible pendant la Marée courante", () => {
    // "Caisses Arrimées" n'est visible que pendant Calme et Houle.
    const caisses = "caisses-arrimees";

    function stateWithStructure(tideState: "calme" | "tempete") {
      const structure = instance(caisses, "p2", { turnsRemaining: 3 });
      const base = testGameState();
      return {
        structure,
        state: {
          ...base,
          environment: { ...base.environment, tideState },
          players: [testPlayer("p1"), testPlayer("p2", { shipId: "lerrant", board: [structure] })] as typeof base.players,
          eventLog: [
            { type: "PLAY_CARD" as const, turnNumber: 1, timestamp: 0, playerId: "p2", instanceId: structure.instanceId, cardId: caisses },
          ],
        },
      };
    }

    it("est masquée pour l'adversaire, mais garde son Slot et son instanceId (on peut la cibler)", () => {
      expect(getCardDefinition(caisses).visibleDuringTide).not.toContain("tempete");
      const { state, structure } = stateWithStructure("tempete");
      const view = toPlayerView(state, "p1");

      const projected = view.players[1].board[0]!;
      expect(projected.instanceId).toBe(structure.instanceId);
      expect(projected.cardId).toBe(HIDDEN_CARD_ID);
      expect(projected.turnsRemaining).toBeUndefined();
      expect(serialized(view)).not.toContain(caisses);
    });

    it("reste visible pour son propriétaire", () => {
      const { state } = stateWithStructure("tempete");
      expect(toPlayerView(state, "p2").players[1].board[0]!.cardId).toBe(caisses);
    });

    it("est révélée dès que la Marée la rend visible", () => {
      const { state } = stateWithStructure("calme");
      expect(toPlayerView(state, "p1").players[1].board[0]!.cardId).toBe(caisses);
    });
  });

  it("la carte cachée se résout sans erreur pour l'UI et n'est jamais visible", () => {
    const def = getCardDefinition(HIDDEN_CARD_ID);
    expect(def.visibleDuringTide).toEqual([]);
  });
});
