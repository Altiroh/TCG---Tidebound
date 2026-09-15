import { describe, expect, it } from "vitest";
import {
  ABANDONED_MATCH_XP,
  DAILY_MATCHES_BONUS,
  FIRST_WIN_OF_DAY_BONUS,
  LEVEL_REWARDS,
  LOGIN_CYCLE_LENGTH,
  LOGIN_REWARD_CYCLE,
  MATCH_TIDES,
  MATCH_XP,
  MAX_REWARDED_LEVEL,
  XP_FIRST_LEVEL,
  XP_LEVEL_STEP,
  XP_STEP_PLATEAU_LEVEL,
  advanceLoginStep,
  canClaimLoginReward,
  computeMatchReward,
  isMeaningfulMatch,
  isMilestoneLevel,
  levelForTotalXp,
  levelRewardItems,
  loginRewardForStep,
  matchActivity,
  nextMilestones,
  progressionView,
  rewardsForLevelsGained,
  totalXpForLevel,
  utcDayKey,
  xpForLevel,
  type LevelRewardItem,
  type LoginRewardState,
  type MatchActivity,
  type ProgressionState,
} from "@/game/progression";
import { BOOSTER_STANDARD_PRICE, TIDE_REWARD } from "@/game/economy";

const FRESH: ProgressionState = { xpTotal: 0, level: 1 };

/** Entrée par défaut de `computeMatchReward` — aucun bonus, activité normale. */
function rewardInput(overrides: Partial<Parameters<typeof computeMatchReward>[0]> = {}) {
  return {
    mode: "matchmaking" as const,
    outcome: "loss" as const,
    progression: FRESH,
    isFirstWinOfDay: false,
    matchesFinishedToday: 0,
    ...overrides,
  };
}

describe("courbe de niveaux", () => {
  it("le premier niveau coûte XP_FIRST_LEVEL et chaque niveau coûte XP_LEVEL_STEP de plus", () => {
    expect(xpForLevel(1)).toBe(XP_FIRST_LEVEL);
    expect(xpForLevel(2)).toBe(XP_FIRST_LEVEL + XP_LEVEL_STEP);
    expect(xpForLevel(3)).toBe(XP_FIRST_LEVEL + 2 * XP_LEVEL_STEP);
  });

  it("plafonne le coût par niveau au-delà du plateau", () => {
    const atPlateau = xpForLevel(XP_STEP_PLATEAU_LEVEL);
    expect(xpForLevel(XP_STEP_PLATEAU_LEVEL + 1)).toBe(atPlateau);
    expect(xpForLevel(XP_STEP_PLATEAU_LEVEL + 50)).toBe(atPlateau);
  });

  it("levelForTotalXp est l'inverse exact de totalXpForLevel", () => {
    for (let level = 1; level <= 50; level++) {
      const exact = totalXpForLevel(level);
      expect(levelForTotalXp(exact)).toBe(level);
      if (level > 1) expect(levelForTotalXp(exact - 1)).toBe(level - 1);
    }
  });

  it("un compte neuf est niveau 1 et une XP négative ne descend pas plus bas", () => {
    expect(levelForTotalXp(0)).toBe(1);
    expect(levelForTotalXp(-500)).toBe(1);
    expect(progressionView(-10).level).toBe(1);
    expect(progressionView(-10).xpIntoLevel).toBe(0);
  });

  it("progressionView décompose l'avancement et l'XP restante", () => {
    const view = progressionView(XP_FIRST_LEVEL + 100);
    expect(view.level).toBe(2);
    expect(view.xpIntoLevel).toBe(100);
    expect(view.xpForNextLevel).toBe(xpForLevel(2));
    expect(view.xpToNextLevel).toBe(xpForLevel(2) - 100);
    expect(view.ratio).toBeCloseTo(100 / xpForLevel(2));
  });
});

describe("table de récompenses 1-50 (Notion « Progression joueur » §6)", () => {
  it("chaque niveau de 1 à 50 donne au moins une récompense — aucun trou", () => {
    for (let level = 1; level <= MAX_REWARDED_LEVEL; level++) {
      expect(levelRewardItems(level).length, `niveau ${level}`).toBeGreaterThan(0);
    }
  });

  it("ne récompense plus au-delà du niveau 50, sans planter", () => {
    expect(levelRewardItems(MAX_REWARDED_LEVEL + 1)).toEqual([]);
    expect(rewardsForLevelsGained(49, 60).map((r) => r.level)).toEqual([50]);
  });

  it("donne un Jeton de Préconstruit tous les 10 niveaux, et seulement là", () => {
    const withToken: number[] = [];
    for (let level = 1; level <= MAX_REWARDED_LEVEL; level++) {
      if (levelRewardItems(level).some((item) => item.kind === "preconToken")) withToken.push(level);
    }
    expect(withToken).toEqual([10, 20, 30, 40, 50]);
  });

  it("place un gros palier (autre chose que des Tides) au moins tous les 5 niveaux", () => {
    for (let start = 1; start + 4 <= MAX_REWARDED_LEVEL; start += 5) {
      const window = [start, start + 1, start + 2, start + 3, start + 4];
      expect(window.some(isMilestoneLevel), `niveaux ${start}-${start + 4}`).toBe(true);
    }
  });

  it("nextMilestones donne les prochains jalons à annoncer dans le profil", () => {
    expect(nextMilestones(1, 3)).toEqual([2, 4, 5]);
    expect(nextMilestones(MAX_REWARDED_LEVEL)).toEqual([]);
  });

  it("aucune récompense de Tides n'est nulle ou négative", () => {
    for (const items of Object.values(LEVEL_REWARDS)) {
      for (const item of items as readonly LevelRewardItem[]) {
        if (item.kind === "tides") expect(item.amount).toBeGreaterThan(0);
        if (item.kind === "booster") expect(item.count).toBeGreaterThan(0);
      }
    }
  });
});

describe("économie", () => {
  it("le booster Standard vaut 150 Tides, et c'est la seule définition", () => {
    expect(BOOSTER_STANDARD_PRICE).toBe(150);
    // Un gros palier vaut exactement un booster : c'est ce qui rend la
    // cadence « un booster tous les N jours » lisible dans toute la table.
    expect(TIDE_REWARD.milestone).toBe(BOOSTER_STANDARD_PRICE);
  });
});

describe("XP de partie (§7)", () => {
  it("une partie terminée donne toujours de l'XP, même perdue", () => {
    const loss = computeMatchReward(rewardInput({ outcome: "loss" }));
    expect(loss.xp).toBe(MATCH_XP.completed);
    const win = computeMatchReward(rewardInput({ outcome: "win" }));
    expect(win.xp).toBe(MATCH_XP.completed + MATCH_XP.win);
  });

  it("ajoute le bonus de première victoire du jour, XP et Tides en PvP", () => {
    const reward = computeMatchReward(rewardInput({ outcome: "win", isFirstWinOfDay: true }));
    expect(reward.firstWinOfDay).toBe(true);
    expect(reward.xp).toBe(MATCH_XP.completed + MATCH_XP.win + FIRST_WIN_OF_DAY_BONUS.xp);
    expect(reward.tides).toBe(MATCH_TIDES.pvpWin + FIRST_WIN_OF_DAY_BONUS.tides);
  });

  it("contre le bot : l'XP de première victoire est accordée, pas les Tides", () => {
    const reward = computeMatchReward(rewardInput({ mode: "bot", outcome: "win", isFirstWinOfDay: true }));
    expect(reward.xp).toBe(MATCH_XP.completed + MATCH_XP.win + FIRST_WIN_OF_DAY_BONUS.xp);
    expect(reward.tides).toBe(0);
  });

  it("le bonus des 3 parties du jour tombe exactement à la 3e, une seule fois", () => {
    const second = computeMatchReward(rewardInput({ matchesFinishedToday: 1 }));
    expect(second.dailyMatchesBonus).toBe(false);
    const third = computeMatchReward(rewardInput({ matchesFinishedToday: 2 }));
    expect(third.dailyMatchesBonus).toBe(true);
    expect(third.xp).toBe(MATCH_XP.completed + DAILY_MATCHES_BONUS.xp);
    const fourth = computeMatchReward(rewardInput({ matchesFinishedToday: 3 }));
    expect(fourth.dailyMatchesBonus).toBe(false);
  });

  it("une partie contre bot ne rapporte aucune Tide sans la dérogation de développement", () => {
    expect(computeMatchReward(rewardInput({ mode: "bot", outcome: "win" })).tides).toBe(0);
    expect(computeMatchReward(rewardInput({ mode: "bot", outcome: "loss" })).tides).toBe(0);
  });

  it("sous la dérogation, une partie contre bot est payée comme une partie PvP", () => {
    const win = computeMatchReward(rewardInput({ mode: "bot", outcome: "win", botCountsAsPvp: true }));
    expect(win.tides).toBe(MATCH_TIDES.pvpWin);
    const loss = computeMatchReward(rewardInput({ mode: "bot", outcome: "loss", botCountsAsPvp: true }));
    expect(loss.tides).toBe(MATCH_TIDES.pvpLoss);
  });

  it("sous la dérogation, la première victoire du jour contre bot donne aussi ses Tides", () => {
    const base = { mode: "bot" as const, outcome: "win" as const, isFirstWinOfDay: true };
    expect(computeMatchReward(rewardInput(base)).tides).toBe(0);
    expect(computeMatchReward(rewardInput({ ...base, botCountsAsPvp: true })).tides).toBe(MATCH_TIDES.pvpWin + FIRST_WIN_OF_DAY_BONUS.tides);
  });
});

describe("anti-AFK (§7)", () => {
  const idle: MatchActivity = { cardsPlayed: 0, attacks: 0, turns: 1 };

  it("une partie abandonnée sans rien jouer ne donne ni Tides, ni bonus", () => {
    const reward = computeMatchReward(rewardInput({ outcome: "win", isFirstWinOfDay: true, matchesFinishedToday: 2, activity: idle }));
    expect(reward.abandoned).toBe(true);
    expect(reward.xp).toBe(ABANDONED_MATCH_XP);
    expect(reward.tides).toBe(0);
    expect(reward.firstWinOfDay).toBe(false);
    expect(reward.dailyMatchesBonus).toBe(false);
  });

  it("un seul signe d'activité suffit à rendre la partie pleine", () => {
    expect(isMeaningfulMatch(idle)).toBe(false);
    expect(isMeaningfulMatch({ ...idle, attacks: 1 })).toBe(true);
    expect(isMeaningfulMatch({ ...idle, cardsPlayed: 2 })).toBe(true);
    expect(isMeaningfulMatch({ ...idle, turns: 4 })).toBe(true);
    // Appelant qui ne fournit pas d'activité : jamais puni.
    expect(isMeaningfulMatch(undefined)).toBe(true);
  });

  it("matchActivity lit les actions du joueur dans le journal", () => {
    const state = {
      turnNumber: 6,
      eventLog: [
        { type: "PLAY_CARD", playerId: "p1" },
        { type: "PLAY_CARD", playerId: "p2" },
        { type: "ATTACK", playerId: "p1" },
      ],
    } as never;
    expect(matchActivity(state, "p1")).toEqual({ cardsPlayed: 1, attacks: 1, turns: 6 });
  });
});

describe("paliers franchis par une partie", () => {
  it("expose les jetons, boosters et cosmétiques des niveaux gagnés", () => {
    // XP juste sous le niveau 10 : la partie fait franchir le palier à Jeton.
    const xpTotal = totalXpForLevel(10) - 1;
    const reward = computeMatchReward(rewardInput({ outcome: "win", progression: { xpTotal, level: 9 } }));
    expect(reward.levelAfter).toBe(10);
    expect(reward.preconTokens).toBe(1);
  });

  it("ne rejoue jamais un palier déjà octroyé", () => {
    const reward = computeMatchReward(rewardInput({ progression: { xpTotal: 0, level: 5 } }));
    expect(reward.levelBefore).toBe(5);
    expect(reward.levelRewards).toEqual([]);
  });

  it("cumule les Tides de palier dans totalTides", () => {
    const xpTotal = totalXpForLevel(3) - 1;
    const reward = computeMatchReward(rewardInput({ outcome: "win", progression: { xpTotal, level: 2 } }));
    const levelTides = reward.levelRewards.flatMap((r) => r.items).reduce((sum, item) => sum + (item.kind === "tides" ? item.amount : 0), 0);
    expect(reward.totalTides).toBe(reward.tides + levelTides);
  });
});

describe("récompenses de connexion (§8)", () => {
  it("le cycle compte 7 escales, la dernière donnant un booster", () => {
    expect(LOGIN_REWARD_CYCLE).toHaveLength(LOGIN_CYCLE_LENGTH);
    expect(loginRewardForStep(7).some((item) => item.kind === "booster")).toBe(true);
  });

  it("une absence ne remet JAMAIS le cycle à zéro", () => {
    let state: LoginRewardState = { step: 3, lastClaimedDay: "2026-09-01" };
    // Retour deux semaines plus tard : on reprend à l'étape 4, pas à 1.
    expect(canClaimLoginReward(state, "2026-09-15")).toBe(true);
    state = advanceLoginStep(state, "2026-09-15");
    expect(state.step).toBe(4);
  });

  it("une seule réclamation par jour", () => {
    const state = { step: 2, lastClaimedDay: "2026-09-15" };
    expect(canClaimLoginReward(state, "2026-09-15")).toBe(false);
    expect(canClaimLoginReward(state, "2026-09-16")).toBe(true);
  });

  it("boucle de l'étape 7 vers l'étape 1", () => {
    expect(advanceLoginStep({ step: 7, lastClaimedDay: null }, "2026-09-15").step).toBe(1);
    expect(loginRewardForStep(8)).toEqual(loginRewardForStep(1));
  });
});

describe("clé de jour UTC", () => {
  it("formate en YYYY-MM-DD", () => {
    expect(utcDayKey(new Date("2026-09-15T23:59:59Z"))).toBe("2026-09-15");
    expect(utcDayKey(new Date("2026-09-16T00:00:00Z"))).toBe("2026-09-16");
  });
});
