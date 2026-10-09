import { describe, expect, it } from "vitest";
import { dispatch, type GameEvent } from "@/game";
import { computeMatchQuestContribution, computeMatchStats, LIFETIME_SUM_KEYS, MATCH_STAT_KEYS, MATCH_STATS, MAX_MATCH_SECONDS } from "@/game/quests";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * STATISTIQUES À VIE — ce qu'une partie terminée rapporte aux compteurs
 * permanents (`game/quests/matchStats.ts`), calculé dans la même passe que
 * les quêtes. Les cas qui dépendent de la façon dont le MOTEUR range son
 * journal (« en même temps », attribution d'une réaction) sont joués via
 * `dispatch` ; les autres le sont sur des journaux construits, comme les
 * tests de quêtes.
 */

const base = { turnNumber: 1, timestamp: 0 };

function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error(`Action refusée : ${JSON.stringify(result)}`);
}

/** État « terminé » dont le journal est celui fourni. */
function finished(events: GameEvent[], opts: { p1?: Parameters<typeof testPlayer>[1]; p2?: Parameters<typeof testPlayer>[1] } = {}): GameState {
  const state = testGameState();
  return {
    ...state,
    status: "finished",
    players: [testPlayer("p1", opts.p1), testPlayer("p2", { shipId: "le-goliath", ...opts.p2 })],
    eventLog: events,
  };
}

const stats = (state: GameState, won = false, playerId = "p1", vsBot = true) => computeMatchStats({ state, playerId, vsBot, won });

describe("catalogue des statistiques", () => {
  it("déclare chaque clé produite, avec sa nature", () => {
    // Une partie riche : tout ce qui peut sortir d'une passe doit être au catalogue.
    const foes = [0, 1, 2].map(() => instance("ptit-bout", "p2"));
    const state = finished(
      [
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "ptit-bout" },
        { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "a" },
        { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 4, targetAnchorAfter: 0, combat: "strike" },
        ...foes.map((foe) => ({ ...base, type: "DESTROY", instanceId: foe.instanceId, reason: "lethal" }) as GameEvent),
        { ...base, type: "DERAISON_SETTLED", playerId: "p1", debt: 2, anchorDamage: 2 },
      ] as GameEvent[],
      { p2: { board: foes } }
    );
    const produced = { ...stats(state, true), ...stats(state, false) };
    for (const key of Object.keys(produced)) {
      expect(MATCH_STATS[key as keyof typeof MATCH_STATS], key).toBeDefined();
    }
    for (const key of MATCH_STAT_KEYS) {
      expect(["sum", "record"]).toContain(MATCH_STATS[key].nature);
      expect(MATCH_STATS[key].description.length, key).toBeGreaterThan(0);
      expect(key).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
    expect(LIFETIME_SUM_KEYS).not.toContain("max_destroyed_at_once");
    expect(LIFETIME_SUM_KEYS).toContain("win_without_deraison");
  });

  it("ne transmet que des valeurs strictement positives", () => {
    for (const value of Object.values(stats(finished([]), false))) expect(value).toBeGreaterThan(0);
  });

  it("n'ajoute aucune clé nouvelle à la contribution des quêtes", () => {
    const foe = instance("ptit-bout", "p2");
    const state = finished(
      [
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "x", cardId: "la-mer-reprend-tout" },
        { ...base, type: "DESTROY", instanceId: foe.instanceId, reason: "lethal" },
      ] as GameEvent[],
      { p2: { board: [foe] } }
    );
    const quest = computeMatchQuestContribution({ state, playerId: "p1", vsBot: true, won: true }).progress;
    expect(Object.keys(quest)).not.toContain("destroy_enemy_units");
    expect(Object.keys(quest)).not.toContain("max_destroyed_at_once");
    expect(quest.destroy_enemy_permanents).toBe(1);
  });
});

describe("« en même temps » : une action et ses conséquences immédiates", () => {
  it("La Mer Reprend Tout sur cinq unités adverses : cinq d'un coup, et la sienne perdue", () => {
    const foes = Array.from({ length: 5 }, () => instance("ptit-bout", "p2"));
    const mine = instance("ptit-bout", "p1");
    const raz = instance("la-mer-reprend-tout", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [raz], board: [mine], reason: 20, reasonMax: 20 }),
        testPlayer("p2", { shipId: "le-goliath", board: foes }),
      ],
    });
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: raz.instanceId });
    ok(r);
    // Le moteur signe ce qu'il verse au journal : une action, un rang.
    const signed = r.state.eventLog.filter((event) => event.actionIndex !== undefined);
    expect(signed.length).toBeGreaterThan(0);
    expect(new Set(signed.map((event) => event.actionIndex)).size).toBe(1);
    expect(signed.every((event) => event.actionBy === "p1")).toBe(true);

    const result = stats({ ...r.state, status: "finished" });
    expect(result.max_destroyed_at_once).toBe(5);
    expect(result.destroy_enemy_units).toBe(5);
    expect(result.max_enemy_units_destroyed_in_turn).toBe(5);
    expect(result.lose_units).toBe(1);
    // Vu de l'adversaire : cinq unités perdues, rien détruit.
    const other = stats({ ...r.state, status: "finished" }, false, "p2");
    expect(other.lose_units).toBe(5);
    expect(other.max_destroyed_at_once).toBeUndefined();
  });

  it("deux actions distinctes dans le même tour ne s'additionnent pas", () => {
    const foes = Array.from({ length: 6 }, () => instance("ptit-bout", "p2"));
    const destroy = (index: number, actionIndex: number) =>
      ({ ...base, type: "DESTROY", instanceId: foes[index]!.instanceId, reason: "effect", actionIndex, actionBy: "p1" }) as GameEvent;
    const state = finished(
      [
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "s1", cardId: "ptit-bout", actionIndex: 1, actionBy: "p1" },
        destroy(0, 1),
        destroy(1, 1),
        destroy(2, 1),
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "s2", cardId: "ptit-bout", actionIndex: 2, actionBy: "p1" },
        destroy(3, 2),
        destroy(4, 2),
        destroy(5, 2),
      ] as GameEvent[],
      { p2: { board: foes } }
    );
    const result = stats(state);
    expect(result.max_destroyed_at_once).toBe(3);
    expect(result.max_enemy_units_destroyed_in_turn).toBe(6);
    expect(result.destroy_enemy_units).toBe(6);
  });

  it("un journal ancien, non signé, se découpe sur les marqueurs d'action", () => {
    const foes = Array.from({ length: 4 }, () => instance("ptit-bout", "p2"));
    const state = finished(
      [
        { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "s1", cardId: "ptit-bout" },
        { ...base, type: "DESTROY", instanceId: foes[0]!.instanceId, reason: "effect" },
        { ...base, type: "DESTROY", instanceId: foes[1]!.instanceId, reason: "effect" },
        { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "s1", defenderInstanceId: foes[2]!.instanceId },
        { ...base, type: "DESTROY", instanceId: foes[2]!.instanceId, reason: "combat" },
        { ...base, type: "END_TURN", playerId: "p1" },
        // Hors action : la Marée n'est à personne.
        { ...base, type: "DESTROY", instanceId: foes[3]!.instanceId, reason: "effect" },
      ] as GameEvent[],
      { p2: { board: foes } }
    );
    const result = stats(state);
    expect(result.max_destroyed_at_once).toBe(2);
    expect(result.destroy_enemy_units).toBe(3);
  });

  it("un piège qui rase le plateau adverse en réaction est crédité à SON propriétaire", () => {
    // Jugement du Phare : la cinquième unité adverse arrive, la Réaction
    // cachée détruit tout. Les effets d'une réaction précèdent son
    // `REACTION_ACTIVATED` : sans la signature de l'action, ces cinq
    // destructions reviendraient à celui qui a posé la carte.
    const piege = instance("jugement-du-phare", "p1", { turnsRemaining: 3 });
    const cibles = Array.from({ length: 4 }, () => instance("ptit-bout", "p2"));
    const arrivant = instance("ptit-bout", "p2");
    const state = testGameState({
      environment: testEnvironment({ tideState: "calme" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", anchor: 30, board: [piege] }),
        testPlayer("p2", { shipId: "le-goliath", board: cibles, hand: [arrivant], reason: 10, reasonMax: 10 }),
      ],
      activePlayerId: "p2",
    });
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    const pending = pose.state.pendingReaction;
    expect(pending?.awaitingPlayerId).toBe("p1");
    const tire = dispatch(pose.state, { type: "activateReaction", playerId: "p1", sourceInstanceId: piege.instanceId, abilityIndex: 1 });
    ok(tire);

    const mine = stats({ ...tire.state, status: "finished" });
    expect(mine.max_destroyed_at_once).toBe(5);
    expect(mine.destroy_enemy_units).toBe(5);
    expect(mine.spring_traps).toBe(1);
    expect(mine.react_to_play).toBe(1);
    expect(mine.activate_reactions).toBe(1);

    const theirs = stats({ ...tire.state, status: "finished" }, false, "p2");
    expect(theirs.destroy_enemy_units).toBeUndefined();
    expect(theirs.lose_units).toBe(5);
  });
});

describe("coup fatal", () => {
  const fatal = (amount = 3) => ({ ...base, type: "DAMAGE", targetPlayerId: "p2", amount, targetAnchorAfter: 0 }) as GameEvent;

  it("d'une capacité de Navire : « Le Rassemblement »", () => {
    const state = finished([
      { ...base, type: "SHIP_ABILITY_ACTIVATED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon", armed: true },
      { ...base, type: "SHIP_ABILITY_FIRED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon" },
      fatal(),
      { ...base, type: "GAME_ENDED", winnerId: "p1", reason: "anchorZero" },
    ] as GameEvent[]);
    const result = stats(state, true);
    expect(result.lethal_by_ship_ability).toBe(1);
    expect(result.ship_ability_damage).toBe(3);
    expect(result.lethal_by_attack).toBeUndefined();
    // Sans victoire, rien : un coup fatal n'existe que s'il a gagné la partie.
    expect(stats(state, false).lethal_by_ship_ability).toBeUndefined();
  });

  it("la capacité se referme au geste suivant : l'attaque d'après est une attaque", () => {
    const state = finished([
      { ...base, type: "SHIP_ABILITY_ACTIVATED", playerId: "p1", shipId: "le-goliath", abilityName: "Canon", armed: false },
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "a" },
      { ...fatal(), combat: "strike" },
    ] as GameEvent[]);
    const result = stats(state, true);
    expect(result.lethal_by_attack).toBe(1);
    expect(result.lethal_by_ship_ability).toBeUndefined();
  });

  it("une capacité ACTIVÉE (aucun marqueur) est un effet de son joueur, grâce à la signature", () => {
    const state = finished([
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 5, targetAnchorAfter: -2, cause: "effect", actionIndex: 7, actionBy: "p1" },
    ] as GameEvent[]);
    expect(stats(state, true).lethal_by_effect).toBe(1);
    expect(stats(state, true).deal_ship_damage).toBe(5);
  });

  it("l'adversaire coulé par sa propre Déraison, ou par la Marée", () => {
    const deraison = finished([
      { ...base, type: "END_TURN", playerId: "p2" },
      { ...base, type: "DERAISON_SETTLED", playerId: "p2", debt: 4, anchorDamage: 4 },
      fatal(4),
    ] as GameEvent[]);
    expect(stats(deraison, true).lethal_by_deraison).toBe(1);

    const maree = finished([{ ...base, type: "TURN_STARTED", playerId: "p2" }, fatal(2)] as GameEvent[]);
    expect(stats(maree, true).lethal_by_tide).toBe(1);
  });

  it("VOTRE Navire coulé par votre propre Déraison : une défaite à part", () => {
    const sunk = (debtor: string) =>
      finished([
        { ...base, type: "END_TURN", playerId: debtor },
        { ...base, type: "DERAISON_SETTLED", playerId: debtor, debt: 6, anchorDamage: 7 },
        { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 7, targetAnchorAfter: -1 },
      ] as GameEvent[]);
    expect(stats(sunk("p1"), false).lose_to_own_deraison).toBe(1);
    // La dette de l'ADVERSAIRE qui précède ne compte pas : ce n'est pas la vôtre.
    expect(stats(sunk("p2"), false).lose_to_own_deraison).toBeUndefined();
    // Coulé par la Marée, puis une dette réglée plus tard : seul le premier coup fatal compte.
    const maree = finished([
      { ...base, type: "TURN_STARTED", playerId: "p1" },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 2, targetAnchorAfter: 0 },
      { ...base, type: "DERAISON_SETTLED", playerId: "p1", debt: 1, anchorDamage: 1 },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 1, targetAnchorAfter: -1 },
    ] as GameEvent[]);
    expect(stats(maree, false).lose_to_own_deraison).toBeUndefined();
  });
});

describe("attaques, réactions, issues de partie", () => {
  it("une attaque suspendue par un piège ne compte qu'une fois", () => {
    const state = finished([
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "a" },
      { ...base, type: "REACTION_WINDOW_OPENED", playerId: "p2" },
      { ...base, type: "REACTION_PASSED", playerId: "p2" },
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "a" },
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "b", defenderInstanceId: "z" },
    ] as GameEvent[]);
    const result = stats(state);
    expect(result.attacks).toBe(2);
    expect(result.direct_attacks).toBe(1);
  });

  it("un Objet Brisé en réaction, et une réponse à un Bris adverse", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const state = finished(
      [
        { ...base, type: "OBJECT_BROKEN", playerId: "p2", instanceId: "o", cardId: "le-seau", fromHand: true },
        { ...base, type: "REACTION_ACTIVATED", playerId: "p1", sourceInstanceId: harpon.instanceId },
        { ...base, type: "OBJECT_BROKEN", playerId: "p1", instanceId: "o2", cardId: "le-seau", fromHand: true },
      ] as GameEvent[],
      { p1: { graveyard: [harpon] } }
    );
    const result = stats(state);
    expect(result.break_in_reaction).toBe(1);
    expect(result.react_to_break).toBe(1);
    expect(result.break_objects_from_hand).toBe(1);
  });

  it("victoire nette : à 1 Ancrage, sans perte, rapide, sans Déraison", () => {
    const state = finished(
      [
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "TURN_STARTED", playerId: "p2" },
        { ...base, type: "TURN_STARTED", playerId: "p1" },
        { ...base, type: "GAME_ENDED", winnerId: "p1", reason: "concede" },
      ] as GameEvent[],
      { p1: { anchor: 1 } }
    );
    const result = stats(state, true);
    expect(result).toMatchObject({
      win_matches: 1,
      win_bot_matches: 1,
      win_by_concede: 1,
      win_at_one_anchor: 1,
      win_without_losing_unit: 1,
      win_without_ship_damage: 1,
      win_without_deraison: 1,
      win_within_5_turns: 1,
      win_within_7_turns: 1,
      win_within_10_turns: 1,
      max_win_anchor: 1,
    });
    expect(result.lose_matches).toBeUndefined();
    expect(stats(state, false).lose_matches).toBe(1);
  });

  it("Déraison : dette cumulée, plus grosse dette, victoire en Déraison", () => {
    const state = finished(
      [
        { ...base, type: "DERAISON_SETTLED", playerId: "p1", debt: 2, anchorDamage: 2 },
        { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 2, targetAnchorAfter: 20 },
        { ...base, type: "DERAISON_SETTLED", playerId: "p1", debt: 5, anchorDamage: 5 },
      ] as GameEvent[],
      { p1: { reason: -1 } }
    );
    const result = stats(state, true);
    expect(result).toMatchObject({ deraison_debt: 7, max_deraison_debt: 5, deraison_turns: 2, win_while_deraison: 1, take_ship_damage: 2 });
    expect(result.win_without_deraison).toBeUndefined();
    expect(result.win_without_ship_damage).toBeUndefined();
  });

  it("records par tour : dégâts et cartes jouées sur le TOUR entier, phases comprises", () => {
    const state = finished([
      { ...base, type: "TURN_STARTED", playerId: "p1" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "ptit-bout" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "b", cardId: "ptit-bout" },
      { ...base, type: "PHASE_CHANGED", playerId: "p1", phase: "combatPhase" },
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "a" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 4, targetAnchorAfter: 20, combat: "strike" },
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: "b" },
      { ...base, type: "DAMAGE", targetPlayerId: "p2", amount: 3, targetAnchorAfter: 17, combat: "strike" },
      { ...base, type: "TURN_STARTED", playerId: "p2" },
      { ...base, type: "TURN_STARTED", playerId: "p1" },
      { ...base, type: "PLAY_CARD", playerId: "p1", instanceId: "c", cardId: "ptit-bout" },
    ] as GameEvent[]);
    const result = stats(state);
    expect(result).toMatchObject({ max_damage_in_turn: 7, max_single_hit: 4, max_cards_played_in_turn: 2, deal_ship_damage: 7, play_cards: 3 });
  });
});

describe("temps et volume de jeu", () => {
  it("durée bornée, tours joués, premier joueur, Raison engagée", () => {
    const start = 1_000_000;
    const state: GameState = {
      ...finished([
        { ...base, timestamp: start, type: "TURN_STARTED", playerId: "p1" },
        { ...base, timestamp: start + 60_000, type: "PLAY_CARD", playerId: "p1", instanceId: "a", cardId: "ptit-bout" },
        { ...base, timestamp: 0, type: "TURN_STARTED", playerId: "p2" },
        { ...base, timestamp: start + 125_400, type: "TURN_STARTED", playerId: "p1" },
      ] as GameEvent[]),
      createdAt: start,
    };
    expect(stats(state, true)).toMatchObject({ play_seconds: 125, own_turns: 2, play_first: 1, win_first: 1, play_bot_matches: 1, spend_reason: 1 });
    expect(stats(state, false, "p2", false)).toMatchObject({ own_turns: 1, play_pvp_matches: 1 });
    expect(stats(state, false, "p2").play_first).toBeUndefined();

    const marathon = { ...state, eventLog: [...state.eventLog, { ...base, timestamp: start + 10 * 3600_000, type: "END_TURN", playerId: "p1" } as GameEvent] };
    expect(stats(marathon, true).play_seconds).toBe(MAX_MATCH_SECONDS);
  });

  it("un nul se compte à part (et reste une non-victoire)", () => {
    const state = finished([{ ...base, type: "GAME_ENDED", reason: "oceanJudgment" }] as GameEvent[]);
    expect(stats(state, false)).toMatchObject({ draw_matches: 1, lose_matches: 1 });
    const lost = finished([{ ...base, type: "GAME_ENDED", winnerId: "p2", reason: "anchorZero" }] as GameEvent[]);
    expect(stats(lost, false).draw_matches).toBeUndefined();
  });
});
