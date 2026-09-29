import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_FAMILIES,
  FEAT_ACHIEVEMENTS,
  isAchievementFamilyId,
  unlockedAchievements,
  type AchievementDefinition,
  type AchievementRequirement,
  type AchievementStats,
} from "@/game/achievements";
import { MATCH_STATS, isMatchStatKey } from "@/game/quests";
import { SHIP_SET } from "@/game";
import { maskAchievement, MASKED_ACHIEVEMENT_NAME } from "@/features/progression/achievementMask";

/**
 * EXPLOITS DE PARTIE (`game/achievements/feats.ts`) — cent jalons faits de
 * données. Le test les passe TOUS en revue par introspection de leurs
 * conditions : il n'a besoin de connaître aucun exploit en particulier.
 */

const NO_PROGRESS: AchievementStats = {
  level: 1,
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  boostersOpened: 0,
  distinctCardsOwned: 0,
  ownedCardIds: [],
  ownsAbyssalCard: false,
  preconDecksUnlocked: 0,
  decksFullyOwned: 0,
  tutorialCompleted: false,
  voyagesCompleted: [],
  lifetime: {},
  records: {},
};

/** Compteurs qui remplissent exactement ces conditions (et rien de plus). */
function statsFor(requirements: readonly AchievementRequirement[], shortBy = 0): AchievementStats {
  const lifetime: Record<string, number> = {};
  const records: Record<string, number> = {};
  requirements.forEach((requirement, index) => {
    // `shortBy` ne retire qu'à la PREMIÈRE condition : les autres restent remplies.
    const value = requirement.target - (index === 0 ? shortBy : 0);
    const into = requirement.scope === "lifetime" ? lifetime : records;
    into[requirement.key] = Math.max(into[requirement.key] ?? 0, value);
  });
  return { ...NO_PROGRESS, lifetime, records };
}

const requirementsOf = (achievement: AchievementDefinition) => achievement.requirements ?? [];

describe("catalogue des exploits", () => {
  it("compte 118 exploits : les 18 historiques et 100 exploits de partie", () => {
    expect(FEAT_ACHIEVEMENTS).toHaveLength(100);
    expect(ACHIEVEMENT_CATALOG).toHaveLength(118);
    for (const achievement of FEAT_ACHIEVEMENTS) expect(ACHIEVEMENT_CATALOG).toContain(achievement);
  });

  it("a des codes uniques en snake_case — la clé d'idempotence en base", () => {
    const codes = ACHIEVEMENT_CATALOG.map((achievement) => achievement.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it("a des noms uniques, et une description pour chacun", () => {
    const names = ACHIEVEMENT_CATALOG.map((achievement) => achievement.name.trim());
    expect(new Set(names).size).toBe(names.length);
    for (const achievement of ACHIEVEMENT_CATALOG) expect(achievement.description.trim().length, achievement.code).toBeGreaterThan(0);
  });

  it("range chaque exploit dans une famille connue, 8 à 12 familles en tout", () => {
    expect(ACHIEVEMENT_FAMILIES.length).toBeGreaterThanOrEqual(8);
    expect(ACHIEVEMENT_FAMILIES.length).toBeLessThanOrEqual(12);
    for (const achievement of ACHIEVEMENT_CATALOG) expect(isAchievementFamilyId(achievement.family), achievement.code).toBe(true);
    // Aucune famille vide : chacune a au moins un exploit à montrer.
    for (const family of ACHIEVEMENT_FAMILIES) {
      expect(ACHIEVEMENT_CATALOG.some((achievement) => achievement.family === family.id), family.id).toBe(true);
    }
  });

  it("compte une vingtaine d'exploits cachés, tous parmi les exploits de partie", () => {
    const hidden = ACHIEVEMENT_CATALOG.filter((achievement) => achievement.hidden);
    expect(hidden.length).toBeGreaterThanOrEqual(20);
    expect(hidden.length).toBeLessThanOrEqual(30);
    for (const achievement of hidden) expect(FEAT_ACHIEVEMENTS).toContain(achievement);
  });

  it("ne paie qu'aux tarifs de la grille (petite, classique, belle)", () => {
    for (const achievement of FEAT_ACHIEVEMENTS) expect([25, 45, 75], achievement.code).toContain(achievement.rewardTides);
  });
});

describe("conditions des exploits de partie", () => {
  it("ne lisent que des clés du catalogue MATCH_STATS, avec la bonne portée", () => {
    for (const achievement of FEAT_ACHIEVEMENTS) {
      const requirements = requirementsOf(achievement);
      expect(requirements.length, achievement.code).toBeGreaterThan(0);
      for (const requirement of requirements) {
        expect(isMatchStatKey(requirement.key), `${achievement.code} → ${requirement.key}`).toBe(true);
        expect(Number.isInteger(requirement.target) && requirement.target > 0, achievement.code).toBe(true);
        // Un cumul n'existe que pour une clé `sum` : le total d'un record ne veut rien dire.
        if (requirement.scope === "lifetime") expect(MATCH_STATS[requirement.key].nature, achievement.code).toBe("sum");
      }
    }
  });

  it("à zéro : aucun n'est obtenu, et la jauge part de 0", () => {
    expect(unlockedAchievements(NO_PROGRESS)).toEqual([]);
    for (const achievement of FEAT_ACHIEVEMENTS) {
      expect(achievement.isUnlocked(NO_PROGRESS), achievement.code).toBe(false);
      expect(achievement.progress(NO_PROGRESS).current, achievement.code).toBe(0);
    }
  });

  it("au seuil : chacun est obtenu, et SEULEMENT grâce à ses propres conditions", () => {
    for (const achievement of FEAT_ACHIEVEMENTS) {
      const requirements = requirementsOf(achievement);
      const enough = statsFor(requirements);
      expect(achievement.isUnlocked(enough), achievement.code).toBe(true);
      const { current, target } = achievement.progress(enough);
      expect(current, achievement.code).toBe(target);
      // Un point de moins sur une condition : pas encore.
      const almost = statsFor(requirements, 1);
      expect(achievement.isUnlocked(almost), achievement.code).toBe(false);
      expect(achievement.progress(almost).current, achievement.code).toBeLessThan(target);
    }
  });

  it("borne la jauge à la cible, même très au-delà", () => {
    for (const achievement of FEAT_ACHIEVEMENTS) {
      const far = statsFor(requirementsOf(achievement).map((requirement) => ({ ...requirement, target: requirement.target * 10 })));
      const { current, target } = achievement.progress(far);
      expect(current, achievement.code).toBe(target);
    }
  });

  it("une combinaison se jauge en conditions remplies", () => {
    const legend = FEAT_ACHIEVEMENTS.find((achievement) => achievement.code === "legend_of_the_ports")!;
    const stats = { ...NO_PROGRESS, lifetime: { win_within_5_turns: 3, win_at_one_anchor: 1 } };
    expect(legend.progress(stats)).toEqual({ current: 2, target: 4 });
    expect(legend.isUnlocked(stats)).toBe(false);
  });

  it("un record ne se remplit pas avec un cumul, ni l'inverse", () => {
    const tableRase = FEAT_ACHIEVEMENTS.find((achievement) => achievement.code === "destroyed_at_once_5")!;
    expect(tableRase.isUnlocked({ ...NO_PROGRESS, lifetime: { max_destroyed_at_once: 9 } })).toBe(false);
    expect(tableRase.isUnlocked({ ...NO_PROGRESS, records: { max_destroyed_at_once: 5 } })).toBe(true);
    const cimetiere = FEAT_ACHIEVEMENTS.find((achievement) => achievement.code === "destroy_units_250")!;
    expect(cimetiere.isUnlocked({ ...NO_PROGRESS, records: { destroy_enemy_units: 300 } })).toBe(false);
  });
});

describe("faisabilité", () => {
  it("« en même temps » ne demande jamais plus d'unités qu'un plateau n'en porte", () => {
    const maxSlots = Math.max(...SHIP_SET.map((ship) => ship.slotCount));
    const commonSlots = Math.max(...SHIP_SET.filter((ship) => ship.slotCount < maxSlots).map((ship) => ship.slotCount));
    for (const achievement of FEAT_ACHIEVEMENTS) {
      for (const requirement of requirementsOf(achievement)) {
        if (requirement.key !== "max_destroyed_at_once") continue;
        expect(requirement.target, achievement.code).toBeLessThanOrEqual(maxSlots);
        // Au-delà du plateau courant (un seul Navire aligne 6 Slots) : réservé aux cachés.
        if (requirement.target > commonSlots) expect(achievement.hidden, achievement.code).toBe(true);
      }
    }
  });

  it("25 Ancrage à la victoire reste sous l'Ancrage de départ de toute coque", () => {
    const minAnchor = Math.min(...SHIP_SET.map((ship) => ship.startingAnchor));
    for (const achievement of FEAT_ACHIEVEMENTS) {
      for (const requirement of requirementsOf(achievement)) {
        if (requirement.key === "max_win_anchor") expect(requirement.target, achievement.code).toBeLessThanOrEqual(minAnchor);
      }
    }
  });
});

describe("exploit caché : le voile posé côté serveur", () => {
  const hidden = FEAT_ACHIEVEMENTS.find((achievement) => achievement.hidden)!;
  const index = ACHIEVEMENT_CATALOG.indexOf(hidden);
  const row = (unlocked: boolean) => ({
    code: hidden.code,
    family: hidden.family,
    name: hidden.name,
    description: hidden.description,
    rewardTides: hidden.rewardTides,
    masked: false,
    unlocked,
    claimable: unlocked,
    progress: { current: 0, target: 1 },
    titleName: null,
  });

  it("pas encore obtenu : ni nom, ni condition, ni code parlant — la famille seule reste", () => {
    const masked = maskAchievement(row(false), true, index);
    expect(masked.masked).toBe(true);
    expect(masked.name).toBe(MASKED_ACHIEVEMENT_NAME);
    expect(masked.description).toBe("");
    expect(masked.progress).toBeNull();
    expect(masked.code).not.toBe(hidden.code);
    expect(JSON.stringify(masked)).not.toContain(hidden.code);
    expect(JSON.stringify(masked)).not.toContain(hidden.name);
    expect(masked.family).toBe(hidden.family);
  });

  it("obtenu : il se révèle entièrement, et un exploit visible n'est jamais voilé", () => {
    expect(maskAchievement(row(true), true, index)).toEqual(row(true));
    expect(maskAchievement(row(false), false, index)).toEqual(row(false));
  });
});
