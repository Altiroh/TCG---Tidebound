import { describe, expect, it } from "vitest";
import { analyzeMatch, audienceMood, nextAudience, readMatchFacts } from "@/game/audience";
import { getShipDefinition } from "@/game";
import type { GameState } from "@/game";

/**
 * MOTEUR D'AUDIENCE — le public juge une partie sur son journal. Parties
 * réduites à ce que le moteur lit : joueurs (Navire, Ancrage), tour,
 * vainqueur, statut, journal.
 */
const SHIP = "le-courlis";
const START = getShipDefinition(SHIP).startingAnchor;

function game(events: unknown[], opts: { turnNumber?: number; winnerId?: string; status?: string; myAnchor?: number; theirAnchor?: number } = {}): GameState {
  return {
    status: opts.status ?? "finished",
    turnNumber: opts.turnNumber ?? 16,
    winnerId: opts.winnerId,
    players: [
      { id: "p1", shipId: SHIP, anchor: opts.myAnchor ?? START },
      { id: "p2", shipId: SHIP, anchor: opts.theirAnchor ?? 0 },
    ],
    eventLog: events,
  } as unknown as GameState;
}

const base = { turnNumber: 1, timestamp: 0 };
const play = (cardId: string, playerId = "p1") => ({ ...base, type: "PLAY_CARD", playerId, instanceId: cardId, cardId });
const endTurn = (playerId = "p1") => ({ ...base, type: "END_TURN", playerId });
const hit = (targetPlayerId: string, after: number) => ({ ...base, type: "DAMAGE", targetPlayerId, amount: 1, targetAnchorAfter: after });

describe("moteur d'audience", () => {
  it("une partie expédiée ennuie le public", () => {
    const quick = analyzeMatch(game([play("chope"), endTurn()], { turnNumber: 5, winnerId: "p1" }), "p1");
    const full = analyzeMatch(game([play("chope"), endTurn()], { turnNumber: 18, winnerId: "p1" }), "p1");
    expect(quick.spectacle).toBeLessThan(full.spectacle);
    expect(quick.highlights).toContain("Trop vite expédiée");
  });

  it("un retournement — sauvé au bord du naufrage — enflamme le public", () => {
    const comeback = analyzeMatch(game([hit("p1", 2), hit("p2", 0)], { winnerId: "p1", myAnchor: 2 }), "p1");
    const easy = analyzeMatch(game([hit("p2", 0)], { winnerId: "p1" }), "p1");
    expect(comeback.spectacle).toBeGreaterThan(easy.spectacle + 20);
    expect(comeback.highlights[0]).toBe("Un retournement de haut vol");
  });

  it("une avance qui change de camp compte comme un duel indécis", () => {
    const facts = readMatchFacts(game([hit("p2", START / 2), hit("p1", START / 4), hit("p2", 1)]), "p1");
    expect(facts.leadChanges).toBe(2);
  });

  it("les erreurs déçoivent : délais laissés filer, tours passés, abandon", () => {
    const clean = analyzeMatch(game([play("chope"), endTurn()]), "p1");
    const sloppy = analyzeMatch(
      game([
        { ...base, type: "TURN_TIMED_OUT", playerId: "p1", missedDeadlines: 1, limit: 1 },
        endTurn(),
        endTurn(),
        endTurn(),
        { ...base, type: "GAME_ENDED", winnerId: "p2", reason: "concede" },
      ]),
      "p1"
    );
    expect(sloppy.spectacle).toBeLessThan(clean.spectacle);
    expect(sloppy.spectacle).toBeGreaterThanOrEqual(0);
    expect(sloppy.facts.idleTurns).toBe(3);
    expect(sloppy.facts.conceded).toBe(true);
  });

  it("seuls les gestes du joueur comptent", () => {
    const facts = readMatchFacts(game([play("chope", "p2"), play("chope", "p2")]), "p1");
    expect(facts.cardsPlayed).toBe(0);
  });

  it("se lit aussi en cours de partie, sans verdict de durée", () => {
    const live = analyzeMatch(game([play("chope")], { status: "active", turnNumber: 2 }), "p1");
    expect(live.signals.some((signal) => signal.family === "rythme")).toBe(false);
    expect(audienceMood(live.spectacle)).toMatch(/public/);
  });

  it("l'audience suit les dernières parties : elle monte et descend", () => {
    let audience = 0;
    for (let i = 0; i < 30; i += 1) audience = nextAudience(audience, 80);
    expect(audience).toBeGreaterThan(1900);
    expect(audience).toBeLessThanOrEqual(2000);
    const after = nextAudience(audience, 10);
    expect(after).toBeLessThan(audience);
  });
});
