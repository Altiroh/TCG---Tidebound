import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/game";
import { computeMatchBalanceReport, digestMatches, finishingBlow, spread, type DigestMatch } from "@/game/balance";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * STATISTIQUES DES PARTIES (`game/balance/matchDigest.ts`) : le coup qui
 * termine une partie, et l'agrégation d'un lot de parties.
 */

const base = { turnNumber: 3, timestamp: 0 };

function ended(events: GameEvent[], winner: string | null = "p1"): GameState {
  const winnerId = winner ?? undefined;
  const state = testGameState();
  return {
    ...state,
    status: "finished",
    winnerId,
    players: [
      testPlayer("p1", { board: [instance("ptit-bout", "p1", { instanceId: "p1-u" })] }),
      testPlayer("p2", { shipId: "le-goliath" }),
    ],
    eventLog: [...events, { ...base, type: "GAME_ENDED", winnerId, reason: winnerId ? "anchorZero" : "other" }],
  };
}

describe("coup de grâce d'une partie", () => {
  it("une attaque d'unité, avec la carte qui frappe", () => {
    const state = ended([{ ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, cause: "combat", dealerInstanceId: "p1-u" }]);
    expect(finishingBlow(state)).toEqual({ kind: "attaque", cardId: "ptit-bout" });
  });

  it("le DERNIER dégât au Navire du perdant, pas celui du vainqueur", () => {
    const state = ended([
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 2, cause: "tide" },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 2, cause: "combat" },
    ]);
    expect(finishingBlow(state)).toEqual({ kind: "maree" });
  });

  it("un sort joué depuis la main, retrouvé dans la même action", () => {
    const state = ended([
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "s1", cardId: "eclat-de-bouteille", actionIndex: 4 },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 4, cause: "effect", origin: { playerId: "p1" }, actionIndex: 4 },
    ]);
    expect(finishingBlow(state)).toEqual({ kind: "sort", cardId: "eclat-de-bouteille" });
  });

  it("une capacité de Navire", () => {
    const state = ended([
      { ...base, type: "SHIP_ABILITY_FIRED", playerId: "p1", shipId: "le-courlis", abilityName: "Bordée", actionIndex: 2 },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 2, cause: "effect", origin: { playerId: "p1" }, actionIndex: 2 },
    ]);
    expect(finishingBlow(state)).toEqual({ kind: "navire" });
  });

  it("la Déraison réglée en fin de tour, et seulement l'action finale", () => {
    const state = ended([
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, cause: "combat", actionIndex: 1 },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 2, actionIndex: 2 },
      { ...base, type: "DERAISON_SETTLED", playerId: "p2", debt: 2, anchorDamage: 2, actionIndex: 2 },
    ]);
    state.eventLog = state.eventLog.map((event) => (event.type === "GAME_ENDED" ? { ...event, actionIndex: 2 } : event));
    expect(finishingBlow(state)).toEqual({ kind: "deraison" });
  });

  it("abandon, délai et nul se lisent dans la raison de fin", () => {
    const concede = { ...ended([]), eventLog: [{ ...base, type: "GAME_ENDED" as const, winnerId: "p1", reason: "concede" as const }] };
    expect(finishingBlow(concede)).toEqual({ kind: "abandon" });
    expect(finishingBlow(ended([], null))).toEqual({ kind: "nul" });
    expect(finishingBlow({ ...ended([]), eventLog: [] })).toBeNull();
  });
});

describe("synthèse d'un lot de parties", () => {
  it("min, max, moyenne et médiane", () => {
    expect(spread([4, 1, 3, 2])).toEqual({ count: 4, min: 1, max: 4, mean: 2.5, median: 2.5 });
    expect(spread([])).toBeNull();
  });

  it("compte les cartes des sièges humains seulement, et les causes de victoire", () => {
    const state: GameState = {
      ...ended([
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "p1-u", cardId: "ptit-bout" },
        { ...base, type: "SUMMON", playerId: "p1", instanceId: "p1-u", cardId: "ptit-bout", played: true },
        { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 5, cause: "combat", dealerInstanceId: "p1-u", combat: "strike" },
      ]),
      createdAt: 1_000,
    };
    state.eventLog = state.eventLog.map((event, index) => ({ ...event, timestamp: 1_000 + (index + 1) * 60_000 }));
    const report = computeMatchBalanceReport({ state, vsBot: true });
    const match: DigestMatch = {
      mode: "bot",
      botDifficulty: "moyen",
      status: "finished",
      day: "2026-10-12",
      report,
      finishing: finishingBlow(state),
      humanSeats: [1],
      deckIds: ["deck-joueur", "precon-bot"],
    };
    const digest = digestMatches([match, { ...match, humanSeats: [] }]);

    expect(digest.matches).toBe(2);
    expect(digest.finishing.attaque).toBe(2);
    expect(digest.vsBot).toEqual([{ id: "moyen", matches: 1, wins: 1, decided: 1 }]);
    expect(digest.decks).toEqual([{ id: "deck-joueur", matches: 1, wins: 1, decided: 1 }]);
    const unite = digest.cards.find((line) => line.cardId === "ptit-bout")!;
    expect(unite.plays).toBe(1);
    expect(unite.matchesPlayed).toBe(1);
    expect(unite.winsWhenPlayed).toBe(1);
    expect(unite.finishers).toBe(2);
    expect(digest.seconds?.max).toBeGreaterThan(0);
    expect(digest.perDay["2026-10-12"]).toBe(2);
  });
});
