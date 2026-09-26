import { describe, expect, it } from "vitest";
import {
  AUDIENCE_MAX_LOSS_SHARE,
  AUDIENCE_MILESTONES,
  analyzeMatch,
  audienceMilestonesReached,
  audienceMood,
  audiencePrize,
  liveAudience,
  liveAudienceDelta,
  nextAudience,
  nextAudienceMilestone,
  readMatchFacts,
  readMoments,
} from "@/game/audience";
import { computeMatchReward, sponsorPointsForMatch, sponsorWatches } from "@/game/progression";
import { getShipDefinition } from "@/game";
import type { GameState } from "@/game";

/**
 * MOTEUR D'AUDIENCE — le public juge une partie sur son journal. Parties
 * réduites à ce que le moteur lit : joueurs (Navire, Ancrage, zones), tour,
 * vainqueur, statut, journal.
 */
const SHIP = "le-courlis";
const START = getShipDefinition(SHIP).startingAnchor;

function game(
  events: unknown[],
  opts: { turnNumber?: number; winnerId?: string; status?: string; myAnchor?: number; theirAnchor?: number } = {}
): GameState {
  return {
    status: opts.status ?? "finished",
    turnNumber: opts.turnNumber ?? 16,
    winnerId: opts.winnerId,
    players: [
      { id: "p1", shipId: SHIP, anchor: opts.myAnchor ?? START, board: [], graveyard: [], hand: [], deck: [] },
      { id: "p2", shipId: SHIP, anchor: opts.theirAnchor ?? 0, board: [], graveyard: [], hand: [], deck: [] },
    ],
    eventLog: events,
  } as unknown as GameState;
}

const base = { turnNumber: 1, timestamp: 0 };
const at = (turnNumber: number) => ({ turnNumber, timestamp: 0 });
const play = (cardId: string, playerId = "p1") => ({ ...base, type: "PLAY_CARD", playerId, instanceId: cardId, cardId });
const endTurn = (playerId = "p1") => ({ ...base, type: "END_TURN", playerId });
const turnOf = (playerId: string, turn = 1) => ({ ...at(turn), type: "TURN_STARTED", playerId });
const hit = (targetPlayerId: string, after: number, amount = 1) => ({ ...base, type: "DAMAGE", targetPlayerId, amount, targetAnchorAfter: after });
const attack = (attackerInstanceId: string, defenderInstanceId?: string, playerId = "p1") => ({ ...base, type: "ATTACK", playerId, attackerInstanceId, defenderInstanceId });
const destroy = (instanceId: string, reason = "combat") => ({ ...base, type: "DESTROY", instanceId, reason });
const summon = (instanceId: string, playerId: string, cardId = "x") => ({ ...base, type: "SUMMON", playerId, instanceId, cardId });

describe("moteur d'audience — le verdict de fin", () => {
  it("une partie expédiée ennuie le public", () => {
    const quick = analyzeMatch(game([play("chope"), endTurn()], { turnNumber: 5, winnerId: "p1" }), "p1");
    const full = analyzeMatch(game([play("chope"), endTurn()], { turnNumber: 18, winnerId: "p1" }), "p1");
    expect(quick.spectacle).toBeLessThan(full.spectacle);
    expect(quick.highlights).toContain("Trop vite expédiée");
  });

  it("un adversaire qui quitte tôt la table ne vaut pas « trop vite expédiée » au gagnant", () => {
    const forfeit = analyzeMatch(game([{ ...base, type: "GAME_ENDED", winnerId: "p1", reason: "concede" }], { turnNumber: 4, winnerId: "p1" }), "p1");
    expect(forfeit.signals.map((signal) => signal.id)).not.toContain("tempo.expedited");
    expect(forfeit.facts.opponentLeft).toBe(true);
    expect(forfeit.facts.conceded).toBe(false);
  });

  it("un retournement — sauvé au bord du naufrage — enflamme le public", () => {
    const comeback = analyzeMatch(game([hit("p1", 2), hit("p2", 0)], { winnerId: "p1", myAnchor: 2 }), "p1");
    const easy = analyzeMatch(game([hit("p2", 0)], { winnerId: "p1" }), "p1");
    expect(comeback.spectacle).toBeGreaterThan(easy.spectacle + 20);
    expect(comeback.highlights[0]).toBe("Un retournement de haut vol");
  });

  it("une avance qui change franchement de camp compte comme un duel indécis", () => {
    const facts = readMatchFacts(game([hit("p2", START / 2), hit("p1", START / 4), hit("p2", 1)]), "p1");
    expect(facts.leadChanges).toBe(2);
  });

  it("un écart minime ne fait pas un changement de meneur", () => {
    // Chacun perd un point à tour de rôle : jamais d'avance franche, donc aucun retournement.
    const facts = readMatchFacts(game([hit("p2", START - 1), hit("p1", START - 1), hit("p2", START - 2), hit("p1", START - 2)]), "p1");
    expect(facts.leadChanges).toBe(0);
  });

  it("les erreurs déçoivent : délais laissés filer, tours passés, abandon", () => {
    const clean = analyzeMatch(game([play("chope"), endTurn()]), "p1");
    const sloppy = analyzeMatch(
      game([
        { ...base, type: "TURN_TIMED_OUT", playerId: "p1", missedDeadlines: 1, limit: 3 },
        endTurn(),
        endTurn(),
        endTurn(),
        { ...base, type: "GAME_ENDED", winnerId: "p2", reason: "concede" },
      ]),
      "p1"
    );
    expect(sloppy.spectacle).toBeLessThan(clean.spectacle);
    expect(sloppy.spectacle).toBeGreaterThanOrEqual(0);
    // Le tour qui a expiré n'est compté qu'une fois : comme délai, pas aussi comme tour passé.
    expect(sloppy.facts.timeouts).toBe(1);
    expect(sloppy.facts.idleTurns).toBe(2);
    expect(sloppy.facts.conceded).toBe(true);
  });

  it("aucun fait n'est jugé deux fois : la conduite n'entre pas dans le bilan des moments", () => {
    const idle = game([endTurn(), endTurn(), endTurn()]);
    expect(readMatchFacts(idle, "p1").momentsTotal).toBe(0);
    const signals = analyzeMatch(idle, "p1").signals.map((signal) => signal.id);
    expect(signals).toContain("erreur.idle");
    expect(signals).not.toContain("moments.costly");
  });

  it("une seule manie ne coûte pas tout : les manquements sont plafonnés", () => {
    const timeouts = Array.from({ length: 6 }, () => ({ ...base, type: "TURN_TIMED_OUT", playerId: "p1", missedDeadlines: 1, limit: 9 }));
    const weight = analyzeMatch(game(timeouts), "p1").signals.find((signal) => signal.id === "erreur.timeout")!.weight;
    expect(weight).toBe(-30);
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
});

describe("moments — le public réagit coup par coup, avec discernement", () => {
  const live = (events: unknown[]) => liveAudience(1000, game(events, { status: "active" }), "p1");

  it("abattre une unité adverse fait monter la salle", () => {
    const kill = readMoments(game([summon("a", "p1"), summon("d", "p2"), attack("a", "d"), destroy("d")], { status: "active" }), "p1");
    expect(kill.map((m) => m.id)).toEqual(["moment.kill"]);
    expect(live([summon("a", "p1"), summon("d", "p2"), attack("a", "d"), destroy("d")])).toBeGreaterThan(1000);
  });

  it("perdre une unité par le fait de l'adversaire fait baisser la salle", () => {
    const events = [turnOf("p2"), summon("u", "p1"), { ...base, type: "UNIT_TARGETED", instanceId: "u", byPlayerId: "p2" }, destroy("u", "effect")];
    expect(readMoments(game(events, { status: "active" }), "p1").map((m) => m.id)).toEqual(["moment.unitLost"]);
    expect(live(events)).toBeLessThan(1000);
  });

  it("sacrifier ou saborder sa propre unité n'est pas une perte subie", () => {
    const events = [turnOf("p1"), summon("u", "p1"), { ...base, type: "SABORDED", playerId: "p1", instanceId: "u" }, destroy("u", "effect")];
    expect(readMoments(game(events, { status: "active" }), "p1")).toEqual([]);
  });

  it("l'adversaire qui sacrifie sa propre unité ne vous rapporte rien", () => {
    const events = [turnOf("p2"), summon("d", "p2"), destroy("d", "effect")];
    expect(readMoments(game(events, { status: "active" }), "p1")).toEqual([]);
  });

  it("un sort qui détruit une unité adverse, hors combat, est un coup d'éclat", () => {
    const events = [turnOf("p1"), summon("d", "p2"), destroy("d", "effect")];
    expect(readMoments(game(events, { status: "active" }), "p1").map((m) => m.id)).toEqual(["moment.spellKill"]);
  });

  it("un Objet ou un Équipement qui tombe n'émeut pas la salle", () => {
    const events = [turnOf("p1"), summon("o", "p2", "rappel-du-public"), destroy("o", "effect")];
    expect(readMoments(game(events, { status: "active" }), "p1")).toEqual([]);
  });

  it("une attaque mal engagée (l'attaquant tombe, la cible tient) coûte de l'audience", () => {
    const moments = readMoments(game([summon("a", "p1"), summon("d", "p2"), attack("a", "d"), destroy("a"), endTurn("p1")], { status: "active" }), "p1");
    // L'attaque était un geste : le tour n'est pas « passé sans rien tenter ».
    expect(moments.map((m) => m.id)).toEqual(["moment.badTrade"]);
    expect(moments[0]!.weight).toBeLessThan(0);
  });

  it("une frappe se mesure en part de l'Ancrage : une bordée pèse plus qu'une piqûre", () => {
    const [pique] = readMoments(game([hit("p2", START - 1, 1)], { status: "active" }), "p1");
    const [bordee] = readMoments(game([hit("p2", START - 6, 6)], { status: "active" }), "p1");
    expect(pique!.id).toBe("moment.hit");
    expect(bordee!.id).toBe("moment.heavyHit");
    expect(bordee!.weight).toBeGreaterThan(pique!.weight * 3);
  });

  it("le même coup répété dans le même tour émeut de moins en moins", () => {
    const pings = readMoments(game([hit("p2", START - 2, 2), hit("p2", START - 4, 2), hit("p2", START - 6, 2)], { status: "active" }), "p1");
    const weights = pings.filter((m) => m.id === "moment.hit").map((m) => m.weight);
    expect(weights).toHaveLength(3);
    expect(weights[1]!).toBeLessThan(weights[0]!);
    expect(weights[2]!).toBeLessThan(weights[1]!);
  });

  it("quand un Navire est au bord du naufrage, chaque coup compte davantage", () => {
    const [calme] = readMoments(game([hit("p2", START - 2, 2)], { status: "active" }), "p1");
    const [enjeu] = readMoments(game([hit("p2", 2, 2)], { status: "active", theirAnchor: 2 }), "p1");
    expect(enjeu!.weight).toBeGreaterThan(calme!.weight);
  });

  it("se faire remonter par l'adversaire fait baisser la salle", () => {
    const moments = readMoments(game([hit("p2", START / 2), hit("p1", START / 4)], { status: "active" }), "p1");
    expect(moments.map((m) => m.id)).toContain("moment.leadLost");
    expect(live([hit("p2", START / 2), hit("p1", START / 4)])).toBeLessThan(live([hit("p2", START / 2)]));
  });

  it("un tour passé sans rien tenter est une faute de conduite, pas un tour joué", () => {
    const idle = readMoments(game([endTurn("p1")], { status: "active" }), "p1");
    expect(idle.map((m) => [m.id, m.kind])).toEqual([["moment.idle", "conduite"]]);
    expect(readMoments(game([play("chope"), endTurn("p1")], { status: "active" }), "p1")).toEqual([]);
  });

  it("le bilan des moments infléchit le spectacle de fin, borné", () => {
    const kills = Array.from({ length: 20 }, (_, i) => [turnOf("p1", i + 1), summon(`d${i}`, "p2"), { ...at(i + 1), type: "DESTROY", instanceId: `d${i}`, reason: "effect" }]).flat();
    const brilliant = analyzeMatch(game(kills, { winnerId: "p1" }), "p1");
    const plain = analyzeMatch(game([], { winnerId: "p1" }), "p1");
    expect(brilliant.spectacle - plain.spectacle).toBe(15);
  });

  it("le compteur en direct suit les moments, conduite comprise", () => {
    const state = game([endTurn("p1")], { status: "active" });
    expect(liveAudienceDelta(state, "p1")).toBeLessThan(0);
    expect(liveAudience(0, state, "p1")).toBe(0);
  });
});

describe("l'audience varie en douceur", () => {
  it("elle tend vers 25 × le spectacle tenu, et elle monte comme elle descend", () => {
    let audience = 0;
    for (let i = 0; i < 60; i += 1) audience = nextAudience(audience, 80);
    expect(audience).toBeGreaterThan(1950);
    expect(audience).toBeLessThanOrEqual(2000);
    expect(nextAudience(audience, 10)).toBeLessThan(audience);
  });

  it("une seule partie ratée ne défait pas des semaines de jeu", () => {
    const audience = 1500;
    const after = nextAudience(audience, 0);
    expect(after).toBe(Math.round(audience * (1 - AUDIENCE_MAX_LOSS_SHARE)));
  });

  it("une partie contre le bot pèse moitié moins", () => {
    const pvp = nextAudience(500, 60) - 500;
    const bot = nextAudience(500, 60, { vsBot: true }) - 500;
    expect(bot).toBeGreaterThan(0);
    expect(bot).toBeCloseTo(pvp / 2, 0);
  });

  it("un mécène qui regarde ne détourne pas les yeux pour une seule partie terne", () => {
    expect(sponsorWatches(1000, 1000)).toBe(true);
    expect(sponsorWatches(1000, 900)).toBe(false);
    // Déjà franchi par le record : il tient jusqu'à 85 % du seuil.
    expect(sponsorWatches(1000, 900, 1100)).toBe(true);
    expect(sponsorWatches(1000, 800, 1100)).toBe(false);
    const points = sponsorPointsForMatch({ audience: 900, best: 1100, analysis: { spectacle: 70, traits: { panache: 80, endurance: 50, ferveur: 70 } } });
    expect(points["compagnie-du-mousquet"]).toBeGreaterThan(0);
  });
});

describe("prime du public — chaque partie paie son spectacle", () => {
  const input = (overrides: Partial<Parameters<typeof computeMatchReward>[0]> = {}) => ({
    mode: "matchmaking" as const,
    outcome: "loss" as const,
    progression: { xpTotal: 0, level: 1 },
    isFirstWinOfDay: false,
    matchesFinishedToday: 0,
    ...overrides,
  });

  it("plus la salle a vibré, plus la prime est belle", () => {
    expect(audiencePrize(30)).toMatchObject({ xp: 0, tides: 0, label: null });
    expect(audiencePrize(45)).toMatchObject({ xp: 5, tides: 0 });
    expect(audiencePrize(65)).toMatchObject({ xp: 10, tides: 1 });
    expect(audiencePrize(90)).toMatchObject({ xp: 20, tides: 3, label: "Le public est debout" });
  });

  it("contre le bot : XP de moitié, jamais de Tides (règle de partie contre le bot)", () => {
    expect(audiencePrize(90, { vsBot: true })).toMatchObject({ xp: 10, tides: 0 });
  });

  it("s'ajoute à la récompense de partie, victoire comme défaite héroïque", () => {
    const plain = computeMatchReward(input());
    const loved = computeMatchReward(input({ spectacle: 85 }));
    expect(loved.xp - plain.xp).toBe(20);
    expect(loved.tides - plain.tides).toBe(3);
    expect(loved.audiencePrize).toMatchObject({ xp: 20, tides: 3 });
    expect(plain.audiencePrize).toBeNull();
  });

  it("une partie abandonnée sans jeu réel ne touche rien", () => {
    const afk = computeMatchReward(input({ spectacle: 85, activity: { cardsPlayed: 0, attacks: 0, turns: 0 } }));
    expect(afk.audiencePrize).toMatchObject({ xp: 0, tides: 0 });
  });
});

describe("paliers d'audience — ce que le public rapporte", () => {
  it("se lisent sur le record, du plus bas au plus haut", () => {
    const thresholds = AUDIENCE_MILESTONES.map((milestone) => milestone.threshold);
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    expect(audienceMilestonesReached(0)).toEqual([]);
    expect(audienceMilestonesReached(1000).map((milestone) => milestone.threshold)).toEqual(thresholds.filter((value) => value <= 1000));
    expect(nextAudienceMilestone(1000)?.threshold).toBe(thresholds.find((value) => value > 1000));
    expect(nextAudienceMilestone(1_000_000)).toBeNull();
  });

  it("chaque palier rapporte quelque chose", () => {
    for (const milestone of AUDIENCE_MILESTONES) expect(milestone.rewards.length).toBeGreaterThan(0);
  });
});
