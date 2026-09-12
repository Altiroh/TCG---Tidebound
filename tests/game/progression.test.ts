import { describe, expect, it } from "vitest";
import {
  BOOSTER_EVERY_N_LEVELS,
  DEV_BOT_MATCH_TIDES,
  FIRST_PVP_WIN_OF_DAY_BONUS,
  MATCH_TIDES,
  MATCH_XP,
  TIDES_PER_LEVEL,
  XP_FIRST_LEVEL,
  XP_LEVEL_STEP,
  XP_STEP_PLATEAU_LEVEL,
  computeMatchReward,
  levelForTotalXp,
  progressionView,
  rewardsForLevelsGained,
  totalXpForLevel,
  utcDayKey,
  xpForLevel,
} from "@/game/progression";

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
    for (let level = 1; level <= 40; level++) {
      const exact = totalXpForLevel(level);
      expect(levelForTotalXp(exact)).toBe(level);
      // Un point d'XP de moins doit rester au niveau précédent.
      if (level > 1) expect(levelForTotalXp(exact - 1)).toBe(level - 1);
    }
  });

  it("un compte neuf est niveau 1 et une XP négative ne descend pas plus bas", () => {
    expect(levelForTotalXp(0)).toBe(1);
    expect(levelForTotalXp(-500)).toBe(1);
    expect(progressionView(-10).level).toBe(1);
    expect(progressionView(-10).xpIntoLevel).toBe(0);
  });

  it("progressionView décompose l'avancement dans le niveau courant", () => {
    const view = progressionView(XP_FIRST_LEVEL + 100);
    expect(view.level).toBe(2);
    expect(view.xpIntoLevel).toBe(100);
    expect(view.xpForNextLevel).toBe(xpForLevel(2));
    expect(view.ratio).toBeCloseTo(100 / xpForLevel(2));
  });
});

describe("récompenses de palier", () => {
  it("chaque niveau gagné donne des Tides, et un booster tous les BOOSTER_EVERY_N_LEVELS", () => {
    const rewards = rewardsForLevelsGained(1, BOOSTER_EVERY_N_LEVELS);
    expect(rewards).toHaveLength(BOOSTER_EVERY_N_LEVELS - 1);
    expect(rewards.every((r) => r.tides === TIDES_PER_LEVEL)).toBe(true);

    const withBooster = rewards.filter((r) => r.boosterIds.length > 0);
    expect(withBooster).toHaveLength(1);
    expect(withBooster[0]!.level).toBe(BOOSTER_EVERY_N_LEVELS);
  });

  it("ne rend rien pour un niveau déjà atteint — l'octroi reste idempotent", () => {
    expect(rewardsForLevelsGained(7, 7)).toEqual([]);
    expect(rewardsForLevelsGained(7, 3)).toEqual([]);
  });
});

describe("récompenses de partie", () => {
  const fresh = { xpTotal: 0, level: 1 };

  it("une victoire PvP donne plus d'XP qu'une défaite, mais la défaite progresse quand même", () => {
    const win = computeMatchReward({ mode: "matchmaking", outcome: "win", progression: fresh, isFirstPvpWinOfDay: false });
    const loss = computeMatchReward({ mode: "matchmaking", outcome: "loss", progression: fresh, isFirstPvpWinOfDay: false });

    expect(win.xp).toBe(MATCH_XP.pvpWin);
    expect(loss.xp).toBe(MATCH_XP.pvpLoss);
    expect(loss.xp).toBeGreaterThan(0);
    expect(win.xp).toBeGreaterThan(loss.xp);
  });

  it("une partie contre bot ne rapporte aucun Tide par défaut", () => {
    // Règle verrouillée par le cadrage. Elle doit rester le comportement
    // SANS option : seule une dérogation explicite peut la contourner.
    for (const outcome of ["win", "loss"] as const) {
      const reward = computeMatchReward({ mode: "bot", outcome, progression: fresh, isFirstPvpWinOfDay: true });
      expect(reward.tides).toBe(0);
      expect(reward.totalTides).toBe(0);
      expect(reward.xp).toBeGreaterThan(0);
    }
  });

  it("n'accorde des Tides contre bot que sur dérogation explicite, et toujours moins qu'en PvP", () => {
    const derogated = computeMatchReward({
      mode: "bot",
      outcome: "win",
      progression: fresh,
      isFirstPvpWinOfDay: false,
      allowBotTides: true,
    });

    expect(derogated.tides).toBe(DEV_BOT_MATCH_TIDES.win);
    expect(derogated.tides).toBeGreaterThan(0);
    // Le bot ne doit jamais devenir le chemin le plus rentable, même en dev.
    expect(derogated.tides).toBeLessThan(MATCH_TIDES.pvpWin);
    expect(DEV_BOT_MATCH_TIDES.loss).toBeLessThan(MATCH_TIDES.pvpWin);
  });

  it("la dérogation bot ne débloque pas le bonus de première victoire du jour", () => {
    // Ce bonus est une source de Tides majeure et strictement PvP : la
    // dérogation de dev ne doit pas y donner accès par ricochet.
    const reward = computeMatchReward({
      mode: "bot",
      outcome: "win",
      progression: fresh,
      isFirstPvpWinOfDay: true,
      allowBotTides: true,
    });

    expect(reward.firstWinOfDay).toBe(false);
    expect(reward.tides).toBe(DEV_BOT_MATCH_TIDES.win);
  });

  it("la dérogation ne change rien au PvP", () => {
    const withFlag = computeMatchReward({
      mode: "matchmaking",
      outcome: "win",
      progression: fresh,
      isFirstPvpWinOfDay: false,
      allowBotTides: true,
    });
    const without = computeMatchReward({
      mode: "matchmaking",
      outcome: "win",
      progression: fresh,
      isFirstPvpWinOfDay: false,
    });

    expect(withFlag).toEqual(without);
  });

  it("le bonus de première victoire du jour ne s'applique qu'à une victoire PvP", () => {
    const pvpWin = computeMatchReward({ mode: "matchmaking", outcome: "win", progression: fresh, isFirstPvpWinOfDay: true });
    expect(pvpWin.firstWinOfDay).toBe(true);
    expect(pvpWin.xp).toBe(MATCH_XP.pvpWin + FIRST_PVP_WIN_OF_DAY_BONUS.xp);
    expect(pvpWin.tides).toBe(MATCH_TIDES.pvpWin + FIRST_PVP_WIN_OF_DAY_BONUS.tides);

    const pvpLoss = computeMatchReward({ mode: "matchmaking", outcome: "loss", progression: fresh, isFirstPvpWinOfDay: true });
    expect(pvpLoss.firstWinOfDay).toBe(false);

    const botWin = computeMatchReward({ mode: "bot", outcome: "win", progression: fresh, isFirstPvpWinOfDay: true });
    expect(botWin.firstWinOfDay).toBe(false);
  });

  it("le farm PvP pur reste très peu rentable face au prix d'un booster", () => {
    // Garde-fou d'intention, pas de calibrage : si une modification rendait
    // un booster accessible en moins de 20 victoires, l'anti-farm du cadrage
    // serait cassé.
    const winsPerBooster = 500 / MATCH_TIDES.pvpWin;
    expect(winsPerBooster).toBeGreaterThan(20);
  });

  it("cumule les paliers franchis quand une seule partie fait gagner un niveau", () => {
    const justBelow = { xpTotal: XP_FIRST_LEVEL - 1, level: 1 };
    const reward = computeMatchReward({
      mode: "matchmaking",
      outcome: "win",
      progression: justBelow,
      isFirstPvpWinOfDay: false,
    });

    expect(reward.levelBefore).toBe(1);
    expect(reward.levelAfter).toBe(2);
    expect(reward.levelRewards).toHaveLength(1);
    expect(reward.totalTides).toBe(MATCH_TIDES.pvpWin + TIDES_PER_LEVEL);
  });

  it("rattrape un niveau en retard en base plutôt que de re-payer un palier déjà atteint", () => {
    // `level` en base a dérivé (plus bas que l'XP cumulée) : la courbe fait
    // foi, et les paliers déjà couverts par l'XP ne sont pas re-octroyés.
    const drifted = { xpTotal: totalXpForLevel(4), level: 2 };
    const reward = computeMatchReward({
      mode: "matchmaking",
      outcome: "loss",
      progression: drifted,
      isFirstPvpWinOfDay: false,
    });

    expect(reward.levelBefore).toBe(4);
    expect(reward.levelRewards.every((r) => r.level > 4)).toBe(true);
  });

  it("n'octroie aucun booster de palier quand aucun niveau n'est franchi", () => {
    const reward = computeMatchReward({ mode: "matchmaking", outcome: "loss", progression: fresh, isFirstPvpWinOfDay: false });
    expect(reward.levelAfter).toBe(reward.levelBefore);
    expect(reward.boosterIds).toEqual([]);
    expect(reward.totalTides).toBe(MATCH_TIDES.pvpLoss);
  });
});

describe("utcDayKey", () => {
  it("produit une clé de jour UTC stable, indépendante de l'heure locale", () => {
    expect(utcDayKey(new Date("2026-09-12T23:59:59Z"))).toBe("2026-09-12");
    expect(utcDayKey(new Date("2026-09-13T00:00:01Z"))).toBe("2026-09-13");
  });
});
