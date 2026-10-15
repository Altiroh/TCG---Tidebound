import { describe, expect, it } from "vitest";
import { botHasSomethingToDo, createGameState, dispatch, PLAYABLE_DECKS, stepBotTurn, toPlayerView, type GameState } from "@/game";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { extendLogHash, hashEventLog, nextKnownLog, packFrames, parseKnownLog, unpackFrames } from "@/features/matches/matchFrames";

/**
 * JOURNAL EN DELTA (`features/matches/matchFrames.ts`) : le client annonce
 * la longueur et l'empreinte du journal qu'il possède, la réponse n'en porte
 * que la suite — sauf si un ancien événement a été re-projeté entre-temps.
 */

/**
 * Une partie simulée, vue depuis le siège de `p1` : chaque « réponse » est
 * le coup de p1 suivi de tout ce que le bot joue ensuite, projeté pour p1 —
 * exactement ce qu'enchaînent un coup et ses tranches de bot.
 */
function simulatedResponses(seed: number, maxMoves = 300): GameState[][] {
  let state = createGameState({
    gameId: `delta-${seed}`,
    player1: { id: "p1", deck: PLAYABLE_DECKS[seed % PLAYABLE_DECKS.length]! },
    player2: { id: "bot", deck: PLAYABLE_DECKS[(seed + 1) % PLAYABLE_DECKS.length]! },
    firstPlayer: "player1",
  });
  const responses: GameState[][] = [];
  for (let move = 0; move < maxMoves && state.status === "active"; move += 1) {
    const frames: GameState[] = [];
    if (!botHasSomethingToDo(state, "bot")) {
      const played = dispatch(state, chooseBotAction(state, "p1", "facile"));
      if (!played.ok) break;
      state = played.state;
      frames.push(state);
    }
    for (let step = 0; step < 120 && state.status === "active" && botHasSomethingToDo(state, "bot"); step += 1) {
      const next = stepBotTurn(state, "bot", "facile");
      if (next.state === state) break;
      state = next.state;
      frames.push(state);
    }
    if (frames.length === 0) break;
    responses.push(frames.map((frame) => toPlayerView(frame, "p1")));
  }
  return responses;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

describe("empreinte chaînée du journal", () => {
  it("s'étend par la suite seule : hash(a + b) = extend(hash(a), b)", () => {
    const [views] = simulatedResponses(1, 4);
    const log = views![views!.length - 1]!.eventLog;
    const cut = Math.floor(log.length / 2);
    expect(extendLogHash(hashEventLog(log.slice(0, cut)), log.slice(cut))).toBe(hashEventLog(log));
    expect(hashEventLog(log, cut)).toBe(hashEventLog(log.slice(0, cut)));
    expect(hashEventLog(log)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("change dès qu'un événement ancien change", () => {
    const [views] = simulatedResponses(2, 4);
    const log = views![0]!.eventLog;
    const altered = log.map((event, index) => (index === 1 ? { ...event, cardId: "carte-masquee" } : event)) as typeof log;
    expect(hashEventLog(altered)).not.toBe(hashEventLog(log));
  });

  it("rejette une annonce mal formée", () => {
    expect(parseKnownLog({ length: 3, hash: "0123456789abcdef" })).toEqual({ length: 3, hash: "0123456789abcdef" });
    for (const junk of [null, 3, { length: -1, hash: "0123456789abcdef" }, { length: 1.5, hash: "0123456789abcdef" }, { length: 2, hash: "xyz" }]) {
      expect(parseKnownLog(junk)).toBeUndefined();
    }
  });
});

describe("packFrames / unpackFrames en delta", () => {
  it("restitue chaque vue à l'identique sur toute une partie, en ne transportant que la suite", () => {
    const responses = simulatedResponses(3);
    expect(responses.length).toBeGreaterThan(5);
    let known: { log: GameState["eventLog"]; hash: string } = { log: [], hash: hashEventLog([]) };
    let deltas = 0;
    for (const views of responses) {
      const packed = JSON.parse(JSON.stringify(packFrames(views, { length: known.log.length, hash: known.hash })));
      if (packed.logBase !== undefined) deltas += 1;
      const restored = unpackFrames(packed, known.log);
      const expected: GameState[] = JSON.parse(JSON.stringify(views));
      const finalLog = expected[expected.length - 1]!.eventLog;
      // La vue finale à l'identique ; les étapes, journal compris, comme sans delta
      // (projeté comme à la fin du coup, voir l'en-tête de `matchFrames.ts`).
      expect(restored[restored.length - 1]).toEqual(expected[expected.length - 1]);
      restored.forEach((view, index) => {
        expect({ ...view, eventLog: [] }).toEqual({ ...expected[index]!, eventLog: [] });
        expect(view.eventLog).toEqual(finalLog.slice(0, expected[index]!.eventLog.length));
      });
      known = nextKnownLog(packed, restored, known);
      expect(known.hash).toBe(hashEventLog(views[views.length - 1]!.eventLog));
    }
    // Toutes en delta sauf la première — et celles qui suivent une re-projection.
    expect(deltas).toBeGreaterThan(responses.length * 0.8);
  });

  it("retombe sur le journal complet quand un ancien événement a été re-projeté (Structure révélée depuis)", () => {
    const [first, second] = simulatedResponses(4, 3);
    const clientLog = first![first!.length - 1]!.eventLog;
    // Ce que le client a reçu avant que la Structure ne soit révélée : le même événement, masqué.
    const masked = clientLog.map((event, index) => (index === 0 ? { ...event, cardId: "__hidden__" } : event)) as typeof clientLog;
    const packed = packFrames(second!, { length: masked.length, hash: hashEventLog(masked) });
    expect(packed.logBase).toBeUndefined();
    expect(unpackFrames(packed, masked)).toEqual(second);
  });

  it("refuse de recoller une réponse en delta sans le journal annoncé", () => {
    const [first, second] = simulatedResponses(5, 3);
    const clientLog = first![first!.length - 1]!.eventLog;
    const packed = packFrames(second!, { length: clientLog.length, hash: hashEventLog(clientLog) });
    expect(packed.logBase).toBe(clientLog.length);
    expect(() => unpackFrames(packed)).toThrow();
    expect(() => unpackFrames(packed, clientLog.slice(0, 1))).toThrow();
  });

  it("MESURE : taille des réponses avant/après sur des parties simulées", () => {
    const full: number[] = [];
    const delta: number[] = [];
    const hashMs: number[] = [];
    let fallbacks = 0;
    for (let seed = 0; seed < 6; seed += 1) {
      let known: { log: GameState["eventLog"]; hash: string } = { log: [], hash: hashEventLog([]) };
      for (const views of simulatedResponses(seed)) {
        full.push(JSON.stringify(packFrames(views)).length);
        const startedAt = performance.now();
        const packed = packFrames(views, { length: known.log.length, hash: known.hash });
        hashMs.push(performance.now() - startedAt);
        if (known.log.length > 0 && packed.logBase === undefined) fallbacks += 1;
        delta.push(JSON.stringify(packed).length);
        known = nextKnownLog(packed, unpackFrames(packed, known.log), known);
      }
    }
    const report = {
      reponses: full.length,
      avant: { mediane: quantile(full, 0.5), p95: quantile(full, 0.95) },
      apres: { mediane: quantile(delta, 0.5), p95: quantile(delta, 0.95) },
      journalComplet: fallbacks,
      packFramesMs: { mediane: quantile(hashMs, 0.5), p95: quantile(hashMs, 0.95) },
    };
    if (process.env.MESURE_FRAMES) console.log(JSON.stringify(report));
    // Le journal pèse la majeure partie d'une réponse : la médiane doit au moins diminuer de moitié.
    expect(report.apres.mediane).toBeLessThan(report.avant.mediane * 0.5);
    expect(report.apres.p95).toBeLessThan(report.avant.p95);
  });
});
