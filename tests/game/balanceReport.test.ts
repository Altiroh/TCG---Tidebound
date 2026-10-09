import { describe, expect, it } from "vitest";
import { PLAYABLE_DECKS } from "@/game/cards/decks/catalog";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { createGameState, dispatch, type GameEvent } from "@/game";
import { cardDefinitionHash, computeMatchBalanceReport } from "@/game/balance";
import type { GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * BANQUE D'ÉQUILIBRAGE — le relevé d'une partie (`game/balance/matchReport.ts`).
 * Une vraie partie bot contre bot pour les invariants (exemplaires, mains,
 * sièges), des journaux construits pour l'attribution des dégâts et des
 * destructions à une carte.
 */

const base = { turnNumber: 1, timestamp: 0 };

function finished(events: GameEvent[], opts: { p1?: Parameters<typeof testPlayer>[1]; p2?: Parameters<typeof testPlayer>[1] } = {}): GameState {
  const state = testGameState();
  return {
    ...state,
    status: "finished",
    winnerId: "p1",
    players: [testPlayer("p1", opts.p1), testPlayer("p2", { shipId: "le-goliath", ...opts.p2 })],
    eventLog: events,
  };
}

function playBotMatch(seed: number): GameState {
  const deckA = PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]!;
  const deckB = PLAYABLE_DECKS[(seed + 5) % PLAYABLE_DECKS.length]!;
  let state = createGameState({ gameId: `banque-${seed}`, player1: { id: "A", deck: deckA }, player2: { id: "B", deck: deckB }, seed });
  for (let guard = 0; guard < 4000 && state.status === "active"; guard += 1) {
    const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
    if (!actor) break;
    const result = dispatch(state, chooseBotAction(state, actor, "moyen"));
    if (!result.ok || result.state === state) break;
    state = result.state;
  }
  return state;
}

describe("relevé d'une vraie partie", () => {
  const seed = 7;
  const state = playBotMatch(seed);
  const report = computeMatchBalanceReport({ state, vsBot: true });
  const decks = [PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]!, PLAYABLE_DECKS[(seed + 5) % PLAYABLE_DECKS.length]!];

  it("compte exactement les exemplaires de chaque deck", () => {
    report.seats.forEach((seat, index) => {
      const expected: Record<string, number> = {};
      for (const cardId of decks[index]!.cardIds) expected[cardId] = (expected[cardId] ?? 0) + 1;
      const counted = Object.fromEntries(seat.cards.filter((line) => line.copies > 0).map((line) => [line.cardId, line.copies]));
      expect(counted).toEqual(expected);
      expect(seat.shipId).toBe(decks[index]!.shipId);
    });
  });

  it("chaque ligne reste cohérente : vue ≤ exemplaires, main de départ comprise", () => {
    for (const seat of report.seats) {
      const seen = seat.cards.reduce((sum, line) => sum + line.seen, 0);
      // Au moins la main de départ (5 ou 6 cartes) est passée par la main.
      expect(seen).toBeGreaterThanOrEqual(5);
      for (const line of seat.cards) {
        if (line.copies > 0) expect(line.seen, line.cardId).toBeLessThanOrEqual(line.copies);
        if (line.played > 0 && line.copies > 0) expect(line.seen, line.cardId).toBeGreaterThan(0);
        expect(line.shipDamage).toBeLessThanOrEqual(line.damageDealt);
        expect(line.defHash).toMatch(/^[0-9a-f]{8}$/);
      }
    }
  });

  it("issue, premier joueur et statistiques par siège", () => {
    expect(state.status).toBe("finished");
    expect(report.firstSeat).toBe(1);
    expect(report.seats[0].wentFirst).toBe(true);
    expect(report.seats[1].wentFirst).toBe(false);
    if (state.winnerId) {
      const winner = report.seats.find((seat) => seat.playerId === state.winnerId)!;
      expect(winner.result).toBe("win");
      expect(report.seats.find((seat) => seat !== winner)!.result).toBe("loss");
    } else {
      expect(report.seats.map((seat) => seat.result)).toEqual(["draw", "draw"]);
    }
    for (const seat of report.seats) {
      expect(seat.stats.play_cards ?? 0).toBe(seat.cards.reduce((sum, line) => sum + line.played, 0));
      expect(seat.ownTurns).toBe(seat.stats.own_turns ?? 0);
    }
    // Les dégâts infligés par les cartes ne dépassent pas ceux que le joueur a infligés.
    for (const seat of report.seats) {
      const byCards = seat.cards.reduce((sum, line) => sum + line.damageDealt, 0);
      expect(byCards).toBeGreaterThan(0);
    }
  });
});

describe("attribution à une carte", () => {
  it("un sort joué depuis la main : ses dégâts et sa victime lui reviennent", () => {
    const foe = instance("ptit-bout", "p2");
    const state = finished(
      [
        { ...base, type: "TURN_STARTED", playerId: "p1", actionIndex: 0 },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "sort", cardId: "la-mer-reprend-tout", actionIndex: 1, actionBy: "p1" },
        { ...base, type: "DAMAGE", targetInstanceId: foe.instanceId, amount: 2, cause: "effect", sourcePlayerId: "p1", actionIndex: 1, actionBy: "p1" },
        { ...base, type: "DESTROY", instanceId: foe.instanceId, reason: "effect", actionIndex: 1, actionBy: "p1" },
      ] as GameEvent[],
      { p1: { graveyard: [instance("la-mer-reprend-tout", "p1", { instanceId: "sort" })] }, p2: { graveyard: [foe] } }
    );
    const report = computeMatchBalanceReport({ state, vsBot: false });
    const spell = report.seats[0].cards.find((line) => line.cardId === "la-mer-reprend-tout")!;
    expect(spell).toMatchObject({ copies: 1, seen: 1, played: 1, playTurnSum: 1, damageDealt: 2, shipDamage: 0, kills: 1 });
    expect(report.seats[1].cards.find((line) => line.cardId === "ptit-bout")).toMatchObject({ copies: 1, deaths: 1, seen: 0 });
  });

  it("le coup fatal d'une unité, une destruction sans dégâts, un Sabordage", () => {
    const attacker = instance("ptit-bout", "p1", { instanceId: "att" });
    const victim = instance("ptit-bout", "p2", { instanceId: "vic" });
    const sacrifice = instance("ptit-bout", "p2", { instanceId: "sab" });
    const state = finished(
      [
        { ...base, type: "TURN_STARTED", playerId: "p1", actionIndex: 0 },
        { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "att", defenderInstanceId: "vic", actionIndex: 1, actionBy: "p1" },
        { ...base, type: "DAMAGE", targetInstanceId: "vic", amount: 1, combat: "strike", cause: "combat", dealerInstanceId: "att", actionIndex: 1, actionBy: "p1" },
        { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, cause: "combat", dealerInstanceId: "att", targetAnchorAfter: 5, actionIndex: 2, actionBy: "p1" },
        { ...base, type: "DESTROY", instanceId: "vic", reason: "combat", actionIndex: 3, actionBy: "p1" },
        { ...base, type: "SABORDED", playerId: "p2", instanceId: "sab", actionIndex: 4, actionBy: "p2" },
        { ...base, type: "DESTROY", instanceId: "sab", reason: "effect", actionIndex: 4, actionBy: "p2" },
      ] as GameEvent[],
      { p1: { board: [attacker] }, p2: { graveyard: [victim, sacrifice] } }
    );
    const report = computeMatchBalanceReport({ state, vsBot: false });
    expect(report.seats[0].cards.find((line) => line.cardId === "ptit-bout")).toMatchObject({ damageDealt: 4, shipDamage: 3, kills: 1 });
    // Le Sabordage n'est ni une mort, ni une victime à créditer.
    expect(report.seats[1].cards.find((line) => line.cardId === "ptit-bout")).toMatchObject({ copies: 2, deaths: 1 });
  });

  it("un jeton invoqué a sa ligne, sans exemplaire au deck", () => {
    const state = finished([
      { ...base, type: "TURN_STARTED", playerId: "p1", actionIndex: 0 },
      { ...base, type: "SUMMON", playerId: "p1", instanceId: "inst_summon_x_0", cardId: "ptit-bout", actionIndex: 1, actionBy: "p1" },
    ] as GameEvent[]);
    const line = computeMatchBalanceReport({ state, vsBot: true }).seats[0].cards.find((entry) => entry.cardId === "ptit-bout")!;
    expect(line).toMatchObject({ copies: 0, summoned: 1, seen: 0 });
  });

  it("une carte renvoyée en main reste UN exemplaire, rejoué deux fois", () => {
    const state = finished(
      [
        { ...base, type: "TURN_STARTED", playerId: "p1", actionIndex: 0 },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "u", cardId: "ptit-bout", actionIndex: 1, actionBy: "p1" },
        { ...base, type: "CARD_MOVED", instanceId: "u", fromZone: "board", toZone: "hand", cardId: "ptit-bout", toInstanceId: "u:hand:1", ownerId: "p1", actionIndex: 2, actionBy: "p2" },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "u:hand:1", cardId: "ptit-bout", actionIndex: 3, actionBy: "p1" },
      ] as GameEvent[],
      { p1: { board: [instance("ptit-bout", "p1", { instanceId: "u:hand:1" })] } }
    );
    const line = computeMatchBalanceReport({ state, vsBot: true }).seats[0].cards.find((entry) => entry.cardId === "ptit-bout")!;
    expect(line).toMatchObject({ copies: 1, seen: 1, played: 2 });
  });

  it("l'empreinte d'une définition est stable, et distingue deux cartes", () => {
    expect(cardDefinitionHash("ptit-bout")).toBe(cardDefinitionHash("ptit-bout"));
    expect(cardDefinitionHash("ptit-bout")).not.toBe(cardDefinitionHash("la-mer-reprend-tout"));
    expect(cardDefinitionHash("carte-qui-n-existe-pas")).toBe("inconnue");
  });
});
