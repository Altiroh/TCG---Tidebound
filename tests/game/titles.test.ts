import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG, achievementByCode, type AchievementStats } from "@/game/achievements";
import {
  TITLE_CATALOG,
  isTitleUnlocked,
  titleById,
  titleForAchievement,
  titleRequiredAchievement,
  titleUnlockLabel,
  unlockedTitles,
} from "@/game/titles";

/**
 * TITRES — logique de déblocage, sans base.
 *
 * Règle du projet : jamais un titre sans moyen réel de l'obtenir, et rien
 * qui s'achète. Chaque titre doit donc renvoyer à un exploit EXISTANT du
 * catalogue, et son déblocage ne dépendre que des exploits obtenus.
 */

describe("catalogue des titres", () => {
  it("propose une douzaine de titres aux identifiants uniques et en kebab-case", () => {
    expect(TITLE_CATALOG.length).toBeGreaterThanOrEqual(10);
    const ids = TITLE_CATALOG.map((title) => title.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("n'a que des noms uniques et non vides", () => {
    const names = TITLE_CATALOG.map((title) => title.name.trim());
    expect(names.every((name) => name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("accroche chaque titre à un exploit réel du catalogue — rien ne s'achète", () => {
    for (const title of TITLE_CATALOG) {
      expect(title.unlock.kind).toBe("achievement");
      expect(achievementByCode(titleRequiredAchievement(title)), `${title.id} → exploit inconnu`).toBeDefined();
    }
  });

  it("ne fait jamais gagner deux titres par le même exploit", () => {
    const codes = TITLE_CATALOG.map(titleRequiredAchievement);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("dit la condition en clair : l'exploit et ce qu'il demande", () => {
    const loup = titleById("loup-de-mer")!;
    expect(titleUnlockLabel(loup)).toBe("Exploit « Niveau 10 » : Atteindre le niveau 10.");
  });
});

describe("déblocage", () => {
  it("rien n'est débloqué sans exploit", () => {
    expect(unlockedTitles(new Set())).toEqual([]);
  });

  it("un exploit obtenu débloque exactement son titre", () => {
    const unlocked = unlockedTitles(new Set(["level_10", "first_win"]));
    expect(unlocked.map((title) => title.id)).toEqual(["flibustier", "loup-de-mer"]);
  });

  it("un exploit sans titre ne débloque rien", () => {
    expect(titleForAchievement("first_booster")).toBeUndefined();
    expect(unlockedTitles(new Set(["first_booster"]))).toEqual([]);
  });

  it("isTitleUnlocked suit la présence de l'exploit en base, pas autre chose", () => {
    const capitaine = titleById("capitaine")!;
    expect(isTitleUnlocked(capitaine, new Set(["level_30"]))).toBe(false);
    expect(isTitleUnlocked(capitaine, new Set(["level_40"]))).toBe(true);
  });

  it("titleById ignore un identifiant inconnu ou vide", () => {
    expect(titleById("roi-des-pirates")).toBeUndefined();
    expect(titleById(null)).toBeUndefined();
    expect(titleById("")).toBeUndefined();
  });

  it("tous les exploits obtenus débloquent tout le catalogue", () => {
    const all = new Set(ACHIEVEMENT_CATALOG.map((achievement) => achievement.code));
    expect(unlockedTitles(all).length).toBe(TITLE_CATALOG.length);
  });
});

describe("jauge des exploits", () => {
  const stats: AchievementStats = {
    level: 14,
    wins: 0,
    losses: 3,
    matchesPlayed: 3,
    boostersOpened: 2,
    distinctCardsOwned: 31,
    ownedCardIds: [],
    ownsAbyssalCard: false,
    preconDecksUnlocked: 0,
    decksFullyOwned: 0,
    tutorialCompleted: true,
    voyagesCompleted: [],
  };

  it("chaque exploit donne une jauge cohérente avec son déblocage", () => {
    for (const achievement of ACHIEVEMENT_CATALOG) {
      const { current, target } = achievement.progress(stats);
      expect(target).toBeGreaterThan(0);
      expect(current).toBeGreaterThanOrEqual(0);
      expect(current).toBeLessThanOrEqual(target);
      expect(current >= target, achievement.code).toBe(achievement.isUnlocked(stats));
    }
  });

  it("chiffre les compteurs et borne à la cible", () => {
    expect(achievementByCode("level_20")!.progress(stats)).toEqual({ current: 14, target: 20 });
    expect(achievementByCode("level_10")!.progress(stats)).toEqual({ current: 10, target: 10 });
    expect(achievementByCode("collection_60")!.progress(stats)).toEqual({ current: 31, target: 60 });
    expect(achievementByCode("ten_matches")!.progress(stats)).toEqual({ current: 3, target: 10 });
    expect(achievementByCode("first_abyssal")!.progress(stats)).toEqual({ current: 0, target: 1 });
  });
});
