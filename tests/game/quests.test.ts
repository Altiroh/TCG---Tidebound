import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/game";
import {
  computeMatchQuestProgress,
  DAILY_QUEST_COUNT,
  MAX_PVP_ONLY_PER_PERIOD,
  QUEST_CATALOG,
  QUEST_OBJECTIVE_LABELS,
  questLabel,
  questPeriodEndsAt,
  questPeriodKey,
  selectQuestsForPeriod,
  WEEKLY_QUEST_COUNT,
} from "@/game/quests";
import { instance, testGameState, testPlayer } from "./testHelpers";

const base = { turnNumber: 1, timestamp: 0 };

function finishedState(events: GameEvent[], boards: { p1Graveyard?: ReturnType<typeof instance>[]; p1Anchor?: number } = {}) {
  const state = testGameState();
  return {
    ...state,
    status: "finished" as const,
    players: [
      testPlayer("p1", { graveyard: boards.p1Graveyard ?? [], anchor: boards.p1Anchor ?? 20 }),
      testPlayer("p2", { shipId: "lerrant" }),
    ] as typeof state.players,
    eventLog: events,
  };
}

describe("catalogue des quêtes", () => {
  it("a des codes uniques, des cibles et des récompenses strictement positives", () => {
    const codes = QUEST_CATALOG.map((q) => q.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const quest of QUEST_CATALOG) {
      expect(quest.targetValue).toBeGreaterThan(0);
      expect(quest.rewardTides).toBeGreaterThan(0);
      expect(QUEST_OBJECTIVE_LABELS[quest.objectiveKey]).toBeDefined();
    }
  });

  it("n'autorise jamais le bot à faire progresser un objectif PvP", () => {
    const pvpObjectives = ["win_pvp_matches", "pvp_ship_damage", "pvp_win_high_anchor"];
    for (const quest of QUEST_CATALOG.filter((q) => pvpObjectives.includes(q.objectiveKey))) {
      expect(quest.botProgressAllowed).toBe(false);
    }
  });

  it("contient assez de quêtes compatibles bot pour remplir chaque période sous le plafond PvP", () => {
    for (const [type, count] of [["daily", DAILY_QUEST_COUNT], ["weekly", WEEKLY_QUEST_COUNT]] as const) {
      const botObjectives = new Set(QUEST_CATALOG.filter((q) => q.questType === type && q.botProgressAllowed).map((q) => q.objectiveKey));
      expect(botObjectives.size).toBeGreaterThanOrEqual(count - MAX_PVP_ONLY_PER_PERIOD[type]);
    }
  });

  it("produit des libellés lisibles", () => {
    expect(questLabel({ objectiveKey: "play_creatures", targetValue: 6 })).toBe("Jouer 6 Créatures");
    expect(questLabel({ objectiveKey: "play_matches", targetValue: 1 })).toBe("Jouer 1 partie");
  });
});

describe("périodes", () => {
  it("découpe les jours et les semaines en UTC, la semaine commençant le lundi", () => {
    const sunday = new Date("2026-09-13T23:30:00Z");
    expect(questPeriodKey("daily", sunday)).toBe("d:2026-09-13");
    expect(questPeriodKey("weekly", sunday)).toBe("w:2026-09-07");
    expect(questPeriodKey("weekly", new Date("2026-09-14T00:00:00Z"))).toBe("w:2026-09-14");
    expect(questPeriodEndsAt("daily", sunday).toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(questPeriodEndsAt("weekly", sunday).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("attribution des quêtes", () => {
  it("est déterministe pour un même joueur et une même période", () => {
    const a = selectQuestsForPeriod("user-1", "daily", "d:2026-09-13").map((q) => q.code);
    const b = selectQuestsForPeriod("user-1", "daily", "d:2026-09-13").map((q) => q.code);
    expect(a).toEqual(b);
  });

  it("varie selon la période et le joueur", () => {
    const days = Array.from({ length: 10 }, (_, i) => selectQuestsForPeriod("user-1", "daily", `d:2026-09-${10 + i}`).map((q) => q.code).join());
    expect(new Set(days).size).toBeGreaterThan(1);
    const users = Array.from({ length: 10 }, (_, i) => selectQuestsForPeriod(`user-${i}`, "daily", "d:2026-09-13").map((q) => q.code).join());
    expect(new Set(users).size).toBeGreaterThan(1);
  });

  it("attribue le bon nombre de quêtes, sans objectif en double et sous le plafond PvP", () => {
    for (let i = 0; i < 200; i++) {
      for (const type of ["daily", "weekly"] as const) {
        const quests = selectQuestsForPeriod(`user-${i}`, type, questPeriodKey(type, new Date(Date.UTC(2026, 0, 1 + i))));
        expect(quests).toHaveLength(type === "daily" ? DAILY_QUEST_COUNT : WEEKLY_QUEST_COUNT);
        expect(quests.every((q) => q.questType === type)).toBe(true);
        expect(new Set(quests.map((q) => q.objectiveKey)).size).toBe(quests.length);
        expect(quests.filter((q) => !q.botProgressAllowed).length).toBeLessThanOrEqual(MAX_PVP_ONLY_PER_PERIOD[type]);
      }
    }
  });
});

describe("progression d'une partie terminée", () => {
  it("compte la partie, les cartes jouées par type et ignore celles de l'adversaire", () => {
    const state = finishedState([
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "murene-aveugle" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "b", cardId: "caisses-arrimees" },
      { ...base, type: "PLAY_CARD", playerId: "p2", instanceId: "c", cardId: "murene-aveugle" },
    ]);
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false });
    expect(progress.play_matches).toBe(1);
    expect(progress.play_creatures).toBe(1);
    expect(progress.play_structures).toBe(1);
    expect(progress.play_marins).toBeUndefined();
  });

  it("compte un Objet brisé, mais pas un Objet expiré", () => {
    const broken = instance("thermos-du-dernier-quart", "p1");
    const expired = instance("thermos-du-dernier-quart", "p1", { graveyardCause: "expired" });
    const state = finishedState(
      [
        { ...base, type: "CARD_MOVED", instanceId: broken.instanceId, fromZone: "board", toZone: "graveyard" },
        { ...base, type: "CARD_MOVED", instanceId: expired.instanceId, fromZone: "board", toZone: "graveyard" },
      ],
      { p1Graveyard: [broken, expired] }
    );
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false }).break_objects).toBe(1);
  });

  it("compte les Structures sabordées et les entrées dans les Abysses", () => {
    const structure = instance("caisses-arrimees", "p1");
    const state = finishedState(
      [
        { ...base, type: "SABORDED", playerId: "p1", instanceId: structure.instanceId },
        { ...base, type: "TIDE_ADVANCED", remainingTurns: 2, tideState: "abysses", tideOrientation: "descendante", stateChanged: true },
        { ...base, type: "TIDE_ADVANCED", remainingTurns: 1, tideState: "abysses", tideOrientation: "descendante", stateChanged: false },
      ],
      { p1Graveyard: [structure] }
    );
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: true });
    expect(progress.scuttle_structures).toBe(1);
    expect(progress.reach_abysses).toBe(1);
  });

  it("ne compte que les dégâts DIRECTS infligés au Navire adverse, et seulement en PvP", () => {
    const events: GameEvent[] = [
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "u1" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 4 },
      // Dégât de Marée hors attaque : ne compte pas.
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 1 },
      // Attaque sur une unité : ne compte pas.
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "u1", defenderInstanceId: "u9" },
      { ...base, type: "DAMAGE", targetInstanceId: "u9", amount: 3 },
    ];
    expect(computeMatchQuestProgress({ state: finishedState(events), playerId: "p1", vsBot: false, won: false }).pvp_ship_damage).toBe(4);
    expect(computeMatchQuestProgress({ state: finishedState(events), playerId: "p1", vsBot: true, won: false }).pvp_ship_damage).toBeUndefined();
  });

  it("n'accorde les objectifs de victoire qu'en PvP, et l'objectif d'Ancrage qu'au-dessus du seuil", () => {
    const high = finishedState([], { p1Anchor: 5 });
    const low = finishedState([], { p1Anchor: 4 });
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: false, won: true })).toMatchObject({ win_pvp_matches: 1, pvp_win_high_anchor: 1 });
    expect(computeMatchQuestProgress({ state: low, playerId: "p1", vsBot: false, won: true }).pvp_win_high_anchor).toBeUndefined();
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: true, won: true }).win_pvp_matches).toBeUndefined();
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: false, won: false }).win_pvp_matches).toBeUndefined();
  });
});
