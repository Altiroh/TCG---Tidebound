import { describe, expect, it } from "vitest";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { DECK_SENTINELLES_CHROMATIQUES } from "@/game/cards/decks/precon";
import { createGameState } from "@/game/state/createGameState";
import type { GameState } from "@/game";

// Relevé du 06/10/2026 : plateau plein d'Éclats chromatiques, une Sentinelle
// en main, de quoi la payer — le bot passait au lieu de dégager une pierre.
function etat(): GameState {
  const base = createGameState({
    gameId: "engorge",
    player1: { id: "p1", deck: DECK_SENTINELLES_CHROMATIQUES },
    player2: { id: "p2", deck: DECK_SENTINELLES_CHROMATIQUES },
    seed: 3,
  });
  const carte = (cardId: string, i: number) => ({
    instanceId: `t_${cardId}_${i}`,
    cardId,
    ownerId: "p1",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  });
  const eclats = ["jaune", "jaune", "rouge", "vert", "bleu"].map((c, i) => carte(`eclat-chromatique-${c}`, i));
  return {
    ...base,
    phase: "mainPhase",
    activePlayerId: "p1",
    turnNumber: 6,
    players: base.players.map((p) =>
      p.id === "p1" ? { ...p, reason: 6, reasonMax: 6, board: eclats, hand: [carte("heros-de-la-flamme", 0), carte("rempart-du-soleil", 0)] } : p
    ) as GameState["players"],
  };
}

describe("bot — plateau engorgé", () => {
  for (const difficulte of ["facile", "moyen", "difficile"] as const) {
    it(`${difficulte} : saborde un Éclat pour reposer une carte`, () => {
      const action = chooseBotAction(etat(), "p1", difficulte, () => 0);
      expect(action.type).toBe("saborder");
      expect(action.type === "saborder" && action.instanceId.startsWith("t_eclat-chromatique")).toBe(true);
    });
  }
});
