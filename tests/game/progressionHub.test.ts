import { describe, expect, it } from "vitest";
import {
  MASTERY_MAX_LEVEL,
  SPONSORS,
  WEEKLY_CHEST_GOAL,
  loginCardPool,
  loginWeekProgramme,
  masteryProgress,
  masteryRewardForLevel,
  sponsorGift,
  sponsorGiftStagesReached,
  sponsorInterestPercent,
  sponsorPointsForMatch,
  sponsorRevealed,
  sponsorStage,
  weeklyChestContents,
} from "@/game/progression";
import { getCardDefinition } from "@/game";
import type { GameState } from "@/game";

/** Partie terminée réduite à ce que lit `sponsorPointsForMatch` : le journal, le vainqueur, le tour. */
function finished(events: unknown[], turnNumber = 10, winnerId = "p2"): GameState {
  return { eventLog: events, turnNumber, winnerId } as unknown as GameState;
}
const play = (cardId: string, playerId = "p1") => ({ type: "PLAY_CARD", playerId, instanceId: cardId, cardId, turnNumber: 1, timestamp: 0 });

describe("coffre hebdomadaire", () => {
  it("se remplit en 10 parties et suit le booster de la semaine", () => {
    expect(WEEKLY_CHEST_GOAL).toBe(10);
    for (const week of [0, 1, 2, 7]) {
      const contents = weeklyChestContents(week);
      const booster = contents.find((item) => item.kind === "booster");
      expect(booster && booster.kind === "booster" && booster.boosterId).toBe(loginWeekProgramme(week).boosterId);
      for (const item of contents) if (item.kind === "card") expect(loginCardPool(item).length).toBeGreaterThan(0);
    }
  });
});

describe("maîtrises", () => {
  it("100 × niveau pour passer au suivant, bornée au niveau maximum", () => {
    expect(masteryProgress(0)).toEqual({ level: 1, xpInto: 0, xpForNext: 100 });
    expect(masteryProgress(99)).toEqual({ level: 1, xpInto: 99, xpForNext: 100 });
    expect(masteryProgress(100)).toEqual({ level: 2, xpInto: 0, xpForNext: 200 });
    // 100 + 200 + … + 700 = 2800 → niveau 8, puis 420 dans le niveau (800 pour passer).
    expect(masteryProgress(2800 + 420)).toEqual({ level: 8, xpInto: 420, xpForNext: 800 });
    expect(masteryProgress(1e9).level).toBe(MASTERY_MAX_LEVEL);
  });

  it("chaque palier de 2 à 10 récompense, et ses cartes ont une pioche", () => {
    expect(masteryRewardForLevel(1)).toEqual([]);
    for (let level = 2; level <= MASTERY_MAX_LEVEL; level += 1) {
      const items = masteryRewardForLevel(level);
      expect(items.length, `niveau ${level}`).toBeGreaterThan(0);
      for (const item of items) if (item.kind === "card") expect(loginCardPool(item).length).toBeGreaterThan(0);
    }
  });
});

describe("commanditaires", () => {
  it("les six de la page Notion", () => {
    expect(SPONSORS.map((sponsor) => sponsor.id)).toHaveLength(6);
  });

  it("Indifférent → Intrigué → Intéressé → Fasciné ; anonyme tant qu'indifférent", () => {
    expect(sponsorStage(0)).toBe("indifferent");
    expect(sponsorRevealed(14)).toBe(false);
    expect(sponsorStage(15)).toBe("intrigue");
    expect(sponsorRevealed(15)).toBe(true);
    expect(sponsorStage(45)).toBe("interesse");
    expect(sponsorStage(500)).toBe("fascine");
    expect(sponsorInterestPercent(60)).toBe(50);
    expect(sponsorInterestPercent(900)).toBe(100);
  });

  it("un colis par palier atteint, aucun pour « Indifférent »", () => {
    expect(sponsorGiftStagesReached(10)).toEqual([]);
    expect(sponsorGiftStagesReached(50)).toEqual(["intrigue", "interesse"]);
    expect(sponsorGift("indifferent")).toEqual([]);
    for (const stage of ["intrigue", "interesse", "fascine"] as const) {
      const gift = sponsorGift(stage);
      expect(gift.length).toBeGreaterThan(0);
      for (const item of gift) if (item.kind === "card") expect(loginCardPool(item).length).toBeGreaterThan(0);
    }
  });

  it("une partie lit ce que le joueur a FAIT : Structures, Abysse, Objets, attaques directes", () => {
    // Des cartes réelles du catalogue, pour que la lecture du type soit vraie.
    expect(getCardDefinition("epave-engloutie").type).toBe("structure");
    expect(getCardDefinition("chope").type).toBe("objet");
    const points = sponsorPointsForMatch(
      finished([
        play("epave-engloutie"),
        play("epave-engloutie"),
        play("bat-marin-abyssal"),
        play("chope"),
        { type: "OBJECT_BROKEN", playerId: "p1", instanceId: "x", cardId: "chope", fromHand: false, turnNumber: 2, timestamp: 0 },
        { type: "ATTACK", playerId: "p1", attackerInstanceId: "a", turnNumber: 3, timestamp: 0 },
        // Les gestes de l'adversaire ne comptent pas.
        play("epave-engloutie", "p2"),
      ]),
      "p1"
    );
    expect(points["compagnie-du-phare"]).toBe(4);
    expect(points["veuve-des-profondeurs"]).toBe(3);
    expect(points["comptoir-des-trois-ancres"]).toBe(3);
    expect(points["amiral-sans-pavillon"]).toBe(1);
    expect(points["le-collectionneur"]).toBe(0);
  });

  it("une victoire éclair attire l'Amiral, une longue partie la Compagnie ; plafond par partie", () => {
    expect(sponsorPointsForMatch(finished([], 10, "p1"), "p1")["amiral-sans-pavillon"]).toBe(4);
    expect(sponsorPointsForMatch(finished([], 10, "p2"), "p1")["amiral-sans-pavillon"]).toBe(0);
    expect(sponsorPointsForMatch(finished([], 16), "p1")["compagnie-du-phare"]).toBe(3);
    const many = Array.from({ length: 20 }, () => play("epave-engloutie"));
    expect(sponsorPointsForMatch(finished(many), "p1")["compagnie-du-phare"]).toBe(10);
  });
});
