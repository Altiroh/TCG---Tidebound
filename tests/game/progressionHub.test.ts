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

describe("mécènes", () => {
  const analysis = (spectacle: number, traits: Partial<{ panache: number; endurance: number; ferveur: number }> = {}) => ({
    spectacle,
    traits: { panache: 0, endurance: 0, ferveur: spectacle, ...traits },
  });

  it("les quatre mécènes, chacun sa couleur et son seuil d'audience", () => {
    expect(SPONSORS.map((sponsor) => [sponsor.id, sponsor.color])).toEqual([
      ["beladone", "marron"],
      ["ambassade-cra-poiscail", "bleu"],
      ["compagnie-du-mousquet", "jaune"],
      ["representant-du-peuple", "violet"],
    ]);
    const thresholds = SPONSORS.map((sponsor) => sponsor.audienceRequired);
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
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

  it("sans l'audience requise, personne ne regarde — c'est le public qui ouvre leur œil", () => {
    const none = sponsorPointsForMatch({ audience: 0, analysis: analysis(90, { panache: 100, endurance: 100 }), playStreak: 5 });
    expect(Object.values(none).every((points) => points === 0)).toBe(true);

    const some = sponsorPointsForMatch({ audience: 800, analysis: analysis(90, { panache: 100, endurance: 100 }), playStreak: 5 });
    expect(some.beladone).toBeGreaterThan(0);
    expect(some["ambassade-cra-poiscail"]).toBeGreaterThan(0);
    expect(some["compagnie-du-mousquet"]).toBe(0); // exige 1000
    expect(some["representant-du-peuple"]).toBe(0); // exige 1500
  });

  it("des attirances larges : panache, durée, ferveur, régularité — plafonnées par partie", () => {
    const points = sponsorPointsForMatch({ audience: 5000, analysis: analysis(80, { panache: 90, endurance: 84 }), playStreak: 1 });
    expect(points.beladone).toBe(2);
    expect(points["ambassade-cra-poiscail"]).toBe(7);
    expect(points["compagnie-du-mousquet"]).toBe(9);
    expect(points["representant-du-peuple"]).toBe(8);
    const max = sponsorPointsForMatch({ audience: 5000, analysis: analysis(100, { panache: 500, endurance: 500 }), playStreak: 9 });
    expect(Math.max(...Object.values(max))).toBeLessThanOrEqual(10);
  });
});
