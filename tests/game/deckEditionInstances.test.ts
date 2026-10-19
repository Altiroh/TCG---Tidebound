import { describe, expect, it } from "vitest";
import { DECK_SENTINELLES_CHROMATIQUES } from "@/game/cards/decks/precon";
import { createGameState } from "@/game/state/createGameState";

describe("édition par exemplaire en partie", () => {
  it("chaque instance reçoit l'édition de SA copie du deck ; sans éditions, aucune", () => {
    const cardEditions = DECK_SENTINELLES_CHROMATIQUES.cardIds.map((_, index) =>
      index === 0 ? ({ artwork: "classique", finish: "star-foil" } as const) : ({ artwork: "classique", finish: "classique" } as const)
    );
    const state = createGameState({
      gameId: "editions",
      player1: { id: "p1", deck: { ...DECK_SENTINELLES_CHROMATIQUES, cardEditions } },
      player2: { id: "p2", deck: DECK_SENTINELLES_CHROMATIQUES },
      seed: 3,
    });
    const all = (id: "p1" | "p2") => {
      const player = state.players.find((p) => p.id === id)!;
      return [...player.deck, ...player.hand];
    };
    expect(all("p1").filter((card) => card.edition?.finish === "star-foil")).toHaveLength(1);
    expect(all("p1").every((card) => card.edition !== undefined)).toBe(true);
    expect(all("p2").some((card) => card.edition !== undefined)).toBe(false);
  });
});
