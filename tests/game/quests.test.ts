import { describe, expect, it } from "vitest";
import type { GameEvent } from "@/game";
import {
  computeMatchQuestContribution,
  computeMatchQuestProgress,
  DAILY_QUEST_COUNT,
  HIGH_ANCHOR_THRESHOLD,
  LOW_ANCHOR_THRESHOLD,
  MAX_PVP_ONLY_PER_PERIOD,
  pickReplacementQuest,
  QUEST_CATALOG,
  QUEST_CATEGORIES,
  QUEST_CATEGORY_META,
  QUEST_OBJECTIVE_LABELS,
  questLabel,
  questPeriodEndsAt,
  questPeriodKey,
  questProgressKind,
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
      testPlayer("p2", { shipId: "le-goliath" }),
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
      // Une quête donne toujours de l'XP ; les Tides peuvent céder la place
      // à un booster (cycle hebdomadaire, Notion §10).
      expect(quest.rewardXp).toBeGreaterThan(0);
      expect(quest.rewardTides > 0 || Boolean(quest.rewardBoosterId)).toBe(true);
      expect(quest.name.length).toBeGreaterThan(0);
      expect(QUEST_CATEGORIES).toContain(quest.category);
      expect(QUEST_OBJECTIVE_LABELS[quest.objectiveKey]).toBeDefined();
    }
  });

  it("couvre les cinq catégories, chacune avec son icône", () => {
    for (const category of QUEST_CATEGORIES) {
      expect(QUEST_CATALOG.some((quest) => quest.category === category), category).toBe(true);
      const meta = QUEST_CATEGORY_META[category];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon).toMatch(/^\/assets\/quests\/icon-cat-[a-z]+\.webp$/);
    }
  });

  it("propose assez de catégories distinctes pour remplir une journée", () => {
    const dailyCategories = new Set(QUEST_CATALOG.filter((q) => q.questType === "daily").map((q) => q.category));
    expect(dailyCategories.size).toBeGreaterThanOrEqual(DAILY_QUEST_COUNT);
  });

  it("récompense chaque quotidienne dans la fourchette 30-50 Tides de la spec", () => {
    for (const quest of QUEST_CATALOG.filter((q) => q.questType === "daily")) {
      expect(quest.rewardTides, quest.code).toBeGreaterThanOrEqual(30);
      expect(quest.rewardTides, quest.code).toBeLessThanOrEqual(50);
    }
  });

  it("offre au moins un booster dans le cycle hebdomadaire", () => {
    expect(QUEST_CATALOG.some((q) => q.questType === "weekly" && q.rewardBoosterId)).toBe(true);
  });

  it("n'autorise jamais le bot à faire progresser un objectif PvP", () => {
    const pvpObjectives = ["win_pvp_matches", "pvp_ship_damage"];
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
    expect(questLabel({ objectiveKey: "modify_tide", targetValue: 5 })).toBe("Modifier la Marée 5 fois");
    expect(questLabel({ objectiveKey: "distinct_decks_played", targetValue: 2 })).toBe("Jouer avec 2 decks différents");
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

  it("tire les 3 quotidiennes dans 3 catégories DIFFÉRENTES", () => {
    for (let i = 0; i < 200; i++) {
      const quests = selectQuestsForPeriod(`user-${i}`, "daily", `d:2026-01-${String((i % 28) + 1).padStart(2, "0")}`);
      expect(new Set(quests.map((q) => q.category)).size, `user-${i}`).toBe(quests.length);
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

  it("compte un Objet brisé — et l'agrège avec les Objets joués", () => {
    const broken = instance("thermos-du-dernier-quart", "p1");
    const expired = instance("thermos-du-dernier-quart", "p1", { graveyardCause: "expired" });
    const state = finishedState(
      [
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "o1", cardId: "thermos-du-dernier-quart" },
        { ...base, type: "OBJECT_BROKEN", playerId: "p1", instanceId: broken.instanceId, cardId: "thermos-du-dernier-quart", fromHand: false },
        // Expiration : un simple départ de zone n'est pas un Bris.
        { ...base, type: "CARD_MOVED", instanceId: expired.instanceId, fromZone: "board", toZone: "graveyard" },
      ],
      { p1Graveyard: [broken, expired] }
    );
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false });
    expect(progress.break_objects).toBe(1);
    expect(progress.play_objects).toBe(1);
    expect(progress.play_or_break_objects).toBe(2);
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
      // Dégât d'environnement, hors action : ne compte pour personne.
      { ...base, type: "END_TURN", playerId: "p1" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 1 },
      // Attaque sur une unité : ce n'est pas un dégât DIRECT au Navire.
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "u1", defenderInstanceId: "u9" },
      { ...base, type: "DAMAGE", targetInstanceId: "u9", amount: 3 },
    ];
    expect(computeMatchQuestProgress({ state: finishedState(events), playerId: "p1", vsBot: false, won: false }).pvp_ship_damage).toBe(4);
    expect(computeMatchQuestProgress({ state: finishedState(events), playerId: "p1", vsBot: true, won: false }).pvp_ship_damage).toBeUndefined();
  });

  it("compte les dégâts TOTAUX infligés à l'adversaire, sans la riposte ni l'environnement", () => {
    const ennemi = instance("murene-aveugle", "p2");
    const mien = instance("murene-aveugle", "p1");
    const state = {
      ...finishedState([
        { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: mien.instanceId, defenderInstanceId: ennemi.instanceId },
        { ...base, type: "DAMAGE", targetInstanceId: ennemi.instanceId, amount: 3 },
        // Riposte encaissée par MON unité : ne compte pas.
        { ...base, type: "DAMAGE", targetInstanceId: mien.instanceId, amount: 2 },
        { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: mien.instanceId },
        { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 4 },
        // Marée de début de tour : personne ne l'a provoquée.
        { ...base, type: "TURN_STARTED", playerId: "p2" },
        { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 1 },
      ]),
      players: [
        testPlayer("p1", { board: [mien], anchor: 20 }),
        testPlayer("p2", { shipId: "le-goliath", board: [ennemi] }),
      ],
    } as ReturnType<typeof finishedState>;
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false }).deal_damage).toBe(7);
  });

  it("compte les dégâts SUBIS, quelle qu'en soit l'origine", () => {
    const mien = instance("murene-aveugle", "p1");
    const state = {
      ...finishedState([
        { ...base, type: "ATTACK", playerId: "p2", attackerInstanceId: "u9", defenderInstanceId: mien.instanceId },
        { ...base, type: "DAMAGE", targetInstanceId: mien.instanceId, amount: 3 },
        // Dégât d'environnement sur MON Navire : « Ça encaisse » ne demande pas qui a frappé.
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 2 },
      ]),
      players: [testPlayer("p1", { board: [mien], anchor: 20 }), testPlayer("p2", { shipId: "le-goliath" })],
    } as ReturnType<typeof finishedState>;
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false }).take_damage).toBe(5);
  });

  it("valide les objectifs « dans une même partie » quand le seuil est atteint", () => {
    const play = (id: string, cardId: string) => ({ ...base, type: "PLAY_CARD" as const, playerId: "p1" as const, instanceId: id, cardId });
    const enough = finishedState([
      play("a", "tetard-fesse"),
      play("b", "tetard-fesse"),
      play("c", "tetard-fesse"),
      play("d", "tetard-fesse"),
      play("e", "tetard-fesse"),
    ]);
    const short = finishedState([play("a", "tetard-fesse"), play("b", "tetard-fesse")]);
    expect(computeMatchQuestProgress({ state: enough, playerId: "p1", vsBot: true, won: false }).creatures_in_match).toBe(1);
    expect(computeMatchQuestProgress({ state: short, playerId: "p1", vsBot: true, won: false }).creatures_in_match).toBeUndefined();
  });

  it("distingue montée et descente de Marée, et « les deux sens » dans une même partie", () => {
    const state = finishedState([
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c1", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_ADVANCED", remainingTurns: 2, tideState: "houle", tideOrientation: "montante", stateChanged: true },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c2", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_ADVANCED", remainingTurns: 2, tideState: "calme", tideOrientation: "descendante", stateChanged: true },
    ]);
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false });
    expect(progress.tide_rise).toBe(1);
    expect(progress.tide_fall).toBe(1);
    expect(progress.modify_tide).toBe(2);
    expect(progress.tide_both_ways_in_match).toBe(1);
  });

  it("rapporte le deck joué comme une valeur DISTINCTE, pas comme un compteur", () => {
    const state = finishedState([]);
    const played = computeMatchQuestContribution({ state, playerId: "p1", vsBot: true, won: false, deckId: "le-courlis" });
    expect(played.sets.distinct_decks_played).toEqual(["le-courlis"]);
    expect(played.sets.distinct_decks_won).toBeUndefined();

    const won = computeMatchQuestContribution({ state, playerId: "p1", vsBot: true, won: true, deckId: "le-courlis" });
    expect(won.sets.distinct_decks_won).toEqual(["le-courlis"]);

    // Sans deck connu, aucun objectif de deck n'avance — plutôt qu'un crédit à tort.
    expect(computeMatchQuestContribution({ state, playerId: "p1", vsBot: true, won: true }).sets).toEqual({});
    expect(questProgressKind("distinct_decks_played")).toBe("set");
    expect(questProgressKind("play_matches")).toBe("sum");
  });

  it("« À un fil » demande de terminer bas mais DEBOUT", () => {
    const alive = finishedState([], { p1Anchor: LOW_ANCHOR_THRESHOLD });
    const dead = finishedState([], { p1Anchor: 0 });
    expect(computeMatchQuestProgress({ state: alive, playerId: "p1", vsBot: true, won: false }).finish_low_anchor).toBe(1);
    expect(computeMatchQuestProgress({ state: dead, playerId: "p1", vsBot: true, won: false }).finish_low_anchor).toBeUndefined();
  });

  it("ne compte comme « modification de Marée » que ce qu'une carte du joueur provoque", () => {
    const state = finishedState([
      // Tick naturel, hors action : ne compte pas.
      { ...base, type: "TIDE_ADVANCED", remainingTurns: 2, tideState: "houle", tideOrientation: "montante", stateChanged: true },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c1", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_MODIFIED", change: "duration", value: 3 },
      { ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: "descendante" },
      // Carte de l'adversaire : ne compte pas pour p1.
      { ...base, type: "PLAY_CARD", playerId: "p2", instanceId: "c2", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_MODIFIED", change: "intensity", value: 2 },
    ]);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false }).modify_tide).toBe(2);
  });

  it("crédite au joueur ce que provoque SA capacité de Navire (Marée, dégâts du Canon)", () => {
    // Audit du 24/09 : au banc, 18 modifications de Marée sur 21 venaient
    // d'une capacité de Navire, et aucune n'était créditée.
    const state = finishedState([
      { ...base, type: "SHIP_ABILITY_ACTIVATED", playerId: "p1", shipId: "lerrant", abilityName: "Changer de cap", armed: false },
      { ...base, type: "TIDE_MODIFIED", change: "duration", value: -1 },
      { ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: "montante" },
      { ...base, type: "SHIP_ABILITY_FIRED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon de proue" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 2, targetAnchorAfter: 12 },
      // Celle de l'adversaire ne compte pas pour p1.
      { ...base, type: "SHIP_ABILITY_ACTIVATED", playerId: "p2", shipId: "lerrant", abilityName: "Changer de cap", armed: false },
      { ...base, type: "TIDE_MODIFIED", change: "duration", value: 1 },
    ] as GameEvent[]);
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false });
    expect(progress.modify_tide).toBe(2);
    expect(progress.deal_damage).toBe(2);
  });

  it("inverser l'orientation de la Marée la fait « monter » ou « descendre »", () => {
    const state = finishedState([
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c1", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: "montante" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c2", cardId: "levier-de-lest" },
      { ...base, type: "TIDE_ORIENTATION_CHANGED", orientation: "descendante" },
    ]);
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false });
    expect(progress).toMatchObject({ tide_rise: 1, tide_fall: 1, tide_both_ways_in_match: 1 });
  });

  it("compte les pioches SUPPLÉMENTAIRES, au-delà de celle de début de tour", () => {
    const state = finishedState([
      { ...base, type: "TURN_STARTED", playerId: "p1" },
      { ...base, type: "DRAW_CARD", playerId: "p1", instanceId: "d1" },
      { ...base, type: "DRAW_CARD", playerId: "p1", instanceId: "d2" },
      { ...base, type: "TURN_STARTED", playerId: "p1" },
      { ...base, type: "DRAW_CARD", playerId: "p1", instanceId: "d3" },
      { ...base, type: "DRAW_CARD", playerId: "p2", instanceId: "d4" },
    ]);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false }).draw_extra_cards).toBe(1);
  });

  it("compte les Créatures à faible coût à part", () => {
    const state = finishedState([
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "tetard-fesse" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "b", cardId: "baleine-aux-cicatrices-blanches" },
    ]);
    const progress = computeMatchQuestProgress({ state, playerId: "p1", vsBot: true, won: false });
    expect(progress.play_creatures).toBe(2);
    expect(progress.play_low_cost_creatures).toBe(1);
  });

  it("n'accorde les objectifs de victoire qu'en PvP, et « tenir le pont » au-dessus du seuil d'Ancrage", () => {
    const high = finishedState([], { p1Anchor: HIGH_ANCHOR_THRESHOLD });
    const low = finishedState([], { p1Anchor: HIGH_ANCHOR_THRESHOLD - 1 });
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: false, won: true })).toMatchObject({ win_pvp_matches: 1, finish_high_anchor: 1 });
    expect(computeMatchQuestProgress({ state: low, playerId: "p1", vsBot: false, won: true }).finish_high_anchor).toBeUndefined();
    // « Tenir le pont » est compatible bot : c'est une action, pas un résultat PvP.
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: true, won: false }).finish_high_anchor).toBe(1);
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: true, won: true }).win_pvp_matches).toBeUndefined();
    expect(computeMatchQuestProgress({ state: high, playerId: "p1", vsBot: false, won: false }).win_pvp_matches).toBeUndefined();
  });
});

describe("remplacement d'une quête (§9)", () => {
  it("rend une quête différente, hors des objectifs déjà attribués, de façon déterministe", () => {
    const current = selectQuestsForPeriod("user-1", "daily", "d:2026-09-15").map((q) => q.code);
    const replaced = current[0]!;
    const first = pickReplacementQuest("user-1", "daily", "d:2026-09-15", current, replaced);
    const again = pickReplacementQuest("user-1", "daily", "d:2026-09-15", current, replaced);
    expect(first).toBeDefined();
    expect(first?.code).toBe(again?.code);
    expect(current).not.toContain(first!.code);
    const keptObjectives = current.filter((code) => code !== replaced).map((code) => QUEST_CATALOG.find((q) => q.code === code)!.objectiveKey);
    expect(keptObjectives).not.toContain(first!.objectiveKey);
  });

  it("ne dépasse jamais le plafond de quêtes PvP en remplaçant", () => {
    for (let i = 0; i < 100; i++) {
      const userId = `user-${i}`;
      const current = selectQuestsForPeriod(userId, "daily", "d:2026-09-15");
      for (const quest of current) {
        const replacement = pickReplacementQuest(userId, "daily", "d:2026-09-15", current.map((q) => q.code), quest.code);
        if (!replacement) continue;
        const after = [...current.filter((q) => q.code !== quest.code), replacement];
        expect(after.filter((q) => !q.botProgressAllowed).length).toBeLessThanOrEqual(MAX_PVP_ONLY_PER_PERIOD.daily);
      }
    }
  });
});

describe("objectifs ajoutés avec leur mécanique", () => {
  /** Attaque directe de p1 sur le Navire de p2, amenant son Ancrage à `anchorAfter`. */
  const lethalAttack = (amount: number, anchorAfter: number): GameEvent[] => [
    { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "att" },
    { ...base, type: "DAMAGE", targetPlayerId: "p2", amount, targetAnchorAfter: anchorAfter },
  ];

  it("« Au point exact » : un Ancrage ramené pile à 0 compte, un dépassement non", () => {
    const exact = finishedState(lethalAttack(3, 0));
    expect(computeMatchQuestProgress({ state: exact, playerId: "p1", vsBot: false, won: true }).exact_lethal).toBe(1);

    // Dépassement : l'Ancrage n'est jamais borné, il passe sous 0.
    const overkill = finishedState(lethalAttack(5, -2));
    expect(computeMatchQuestProgress({ state: overkill, playerId: "p1", vsBot: false, won: true }).exact_lethal).toBeUndefined();

    // Coup non létal.
    const partial = finishedState(lethalAttack(3, 4));
    expect(computeMatchQuestProgress({ state: partial, playerId: "p1", vsBot: false, won: false }).exact_lethal).toBeUndefined();
  });

  it("« Au point exact » ne crédite pas le joueur qui ENCAISSE le coup exact", () => {
    const state = finishedState(lethalAttack(3, 0));
    expect(computeMatchQuestProgress({ state, playerId: "p2", vsBot: false, won: false }).exact_lethal).toBeUndefined();
  });

  it("le jour de la partie alimente l'ensemble des jours joués", () => {
    const state = finishedState([]);
    const { sets } = computeMatchQuestContribution({ state, playerId: "p1", vsBot: false, won: false, dayKey: "2026-09-15" });
    expect(sets.play_days).toEqual(["2026-09-15"]);
    // Sans jour fourni, l'objectif n'avance pas plutôt que d'être deviné.
    expect(computeMatchQuestContribution({ state, playerId: "p1", vsBot: false, won: false }).sets.play_days).toBeUndefined();
  });

  it("la série de jours est transmise telle quelle — c'est un état, pas un incrément", () => {
    const state = finishedState([]);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false, playStreak: 4 }).play_streak).toBe(4);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false }).play_streak).toBeUndefined();
  });

  it("un deck fraîchement obtenu compte une fois pour la partie", () => {
    const state = finishedState([]);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false, deckIsNew: true }).play_new_deck).toBe(1);
    expect(computeMatchQuestProgress({ state, playerId: "p1", vsBot: false, won: false }).play_new_deck).toBeUndefined();
  });

  it("une série se compte en `max`, un ensemble de jours en `set`", () => {
    // Le type de progression décide de l'agrégation côté base : se tromper
    // ici ferait additionner des séries au lieu d'en garder la plus longue.
    expect(questProgressKind("play_streak")).toBe("max");
    expect(questProgressKind("play_days")).toBe("set");
    expect(questProgressKind("complete_daily_quests")).toBe("sum");
    expect(questProgressKind("exact_lethal")).toBe("sum");
  });

  it("« Terminer N quêtes journalières » n'est jamais produit par une partie", () => {
    // Il est écrit par `record_match_quest_progress` quand une journalière
    // bascule : si le journal de partie pouvait le produire, la méta-quête
    // avancerait deux fois.
    const state = finishedState([{ ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "murene-aveugle" }]);
    const { progress } = computeMatchQuestContribution({ state, playerId: "p1", vsBot: false, won: true, playStreak: 2, dayKey: "2026-09-15" });
    expect(progress.complete_daily_quests).toBeUndefined();
  });
});

describe("objectifs d'identité Tidebound (audit du 24/09)", () => {
  function stateWith(events: GameEvent[], opts: { p2Board?: ReturnType<typeof instance>[]; p1Board?: ReturnType<typeof instance>[] } = {}) {
    const state = testGameState();
    return {
      ...state,
      status: "finished" as const,
      players: [testPlayer("p1", { board: opts.p1Board ?? [] }), testPlayer("p2", { board: opts.p2Board ?? [] })] as typeof state.players,
      eventLog: events,
    };
  }
  const tide = (tideState: "calme" | "houle" | "tempete" | "abysses", remainingTurns = 1) =>
    ({ ...base, type: "TIDE_ADVANCED", remainingTurns, tideState, tideOrientation: "montante", stateChanged: true }) as GameEvent;

  it("compte capacités de Navire (l'activation, pas le tir), réactions, invocations, soins et Anomalies", () => {
    const progress = computeMatchQuestProgress({
      state: stateWith([
        { ...base, type: "SHIP_ABILITY_ACTIVATED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon", armed: true },
        { ...base, type: "SHIP_ABILITY_FIRED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon" },
        { ...base, type: "REACTION_ACTIVATED", playerId: "p1", sourceInstanceId: "x" },
        { ...base, type: "REACTION_ACTIVATED", playerId: "p2", sourceInstanceId: "y" },
        { ...base, type: "SUMMON", playerId: "p1", instanceId: "t1", cardId: "tetard-fesse" },
        { ...base, type: "HEAL", targetPlayerId: "p1", amount: 3 },
        { ...base, type: "HEAL", targetPlayerId: "p2", amount: 5 },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a1", cardId: "quelque-chose-sous-la-coque" },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "b1", cardId: "la-chose-qui-remonte" },
      ] as GameEvent[]),
      playerId: "p1",
      vsBot: true,
      won: false,
    });
    expect(progress).toMatchObject({ ship_ability_uses: 1, activate_reactions: 1, summon_units: 1, heal_anchor: 3, play_anomalies: 1, play_big_cards: 1 });
  });

  it("Tempête et Abysses se lisent dans l'état de Marée courant", () => {
    const progress = computeMatchQuestProgress({
      state: stateWith([
        tide("tempete"),
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "TURN_STARTED", playerId: "p2" },
        tide("abysses"),
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a1", cardId: "tetard-fesse" },
      ] as GameEvent[]),
      playerId: "p1",
      vsBot: true,
      won: false,
    });
    expect(progress).toMatchObject({ turns_in_tempete: 1, play_in_abysses: 1 });
  });

  it("ne crédite une destruction adverse qu'à celui dont l'action l'a provoquée", () => {
    const foe = instance("tetard-fesse", "p2");
    const foe2 = instance("tetard-fesse", "p2");
    const progress = computeMatchQuestProgress({
      state: stateWith(
        [
          { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "z", defenderInstanceId: foe.instanceId },
          { ...base, type: "DESTROY", instanceId: foe.instanceId, reason: "combat" },
          { ...base, type: "END_TURN", playerId: "p1" },
          // Hors action (Marée) : personne.
          { ...base, type: "DESTROY", instanceId: foe2.instanceId, reason: "effect" },
        ] as GameEvent[],
        { p2Board: [foe, foe2] }
      ),
      playerId: "p1",
      vsBot: true,
      won: false,
    });
    expect(progress.destroy_enemy_permanents).toBe(1);
  });

  it("Déraison : tours en dette, victoire au fil du rasoir, victoire la tête froide", () => {
    const risky = stateWith([
      { ...base, type: "DERAISON_SETTLED", playerId: "p1", debt: 2, anchorDamage: 2 },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 4, targetAnchorAfter: LOW_ANCHOR_THRESHOLD },
    ] as GameEvent[]);
    expect(computeMatchQuestProgress({ state: risky, playerId: "p1", vsBot: true, won: true })).toMatchObject({ deraison_turns: 1, win_after_low_anchor: 1 });
    expect(computeMatchQuestProgress({ state: risky, playerId: "p1", vsBot: true, won: true }).win_without_deraison).toBeUndefined();

    const clean = stateWith([]);
    expect(computeMatchQuestProgress({ state: clean, playerId: "p1", vsBot: true, won: true }).win_without_deraison).toBe(1);
    expect(computeMatchQuestProgress({ state: clean, playerId: "p1", vsBot: true, won: false }).win_without_deraison).toBeUndefined();
  });

  it("saborder compte tout permanent ; révéler compte ses propres Structures", () => {
    const own = instance("tetard-fesse", "p1");
    const progress = computeMatchQuestProgress({
      state: stateWith(
        [
          { ...base, type: "SABORDED", playerId: "p1", instanceId: own.instanceId },
          { ...base, type: "STRUCTURE_REVEALED", playerId: "p1", instanceId: own.instanceId, cardId: "tetard-fesse" },
        ] as GameEvent[],
        { p1Board: [own] }
      ),
      playerId: "p1",
      vsBot: true,
      won: false,
    });
    expect(progress).toMatchObject({ scuttle_permanents: 1, reveal_traps: 1 });
  });

  it("HÂTER la Marée qui monte la fait monter, une seule fois même si elle passe l'état", () => {
    const progress = computeMatchQuestProgress({
      state: stateWith([
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c1", cardId: "levier-de-lest" },
        // Calme, 2 tours restants → 1 : montée hâtée.
        { ...base, type: "TIDE_MODIFIED", change: "duration", value: 1 },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c2", cardId: "levier-de-lest" },
        // → 0 : la transition suit, c'est le même geste.
        { ...base, type: "TIDE_MODIFIED", change: "duration", value: 0 },
        { ...base, type: "TIDE_ADVANCED", remainingTurns: 2, tideState: "houle", tideOrientation: "montante", stateChanged: true },
        // Allonger n'est pas hâter.
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c3", cardId: "levier-de-lest" },
        { ...base, type: "TIDE_MODIFIED", change: "duration", value: 4 },
      ] as GameEvent[]),
      playerId: "p1",
      vsBot: true,
      won: false,
    });
    expect(progress.tide_rise).toBe(2);
    expect(progress.modify_tide).toBe(3);
  });
});
