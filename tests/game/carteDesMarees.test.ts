import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { DECK_LE_GRAND_BANC, DECK_LE_THEATRE_ENGLOUTI } from "@/game/cards/decks/precon";
import { drawTideChart, forceTideTransition, tickTide, tideDurationFor } from "@/game/environment/tide";
import { TIDE_STATES_ORDER } from "@/game/environment/types";
import type { TideAdvancedEvent } from "@/game/events/types";
import { RULES } from "@/game/rules/constants";
import { createGameState } from "@/game/state/createGameState";
import { enFinDeTour, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

const CHART = { calme: 2, houle: 1, tempete: 3, abysses: 1 };

function newGame(seed: number) {
  return createGameState({
    gameId: "carte-des-marees",
    player1: { id: "p1", deck: DECK_LE_GRAND_BANC },
    player2: { id: "p2", deck: DECK_LE_THEATRE_ENGLOUTI },
    seed,
  });
}

/** Fin du tour de p2 (`turnNumber` 2 → 3) : le tour de table est complet, la Marée décompte. */
function finDeTourDeTable(environment: ReturnType<typeof testEnvironment>) {
  const filler = (ownerId: string) => [instance("marin-des-jetees", ownerId)];
  const state = testGameState({
    turnNumber: 2,
    activePlayerId: "p2",
    priorityPlayerId: "p2",
    players: [testPlayer("p1", { deck: filler("p1") }), testPlayer("p2", { deck: filler("p2") })],
    environment,
  });
  const result = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p2" });
  if (!result.ok) throw new Error(result.error);
  const tick = result.state.eventLog.filter((e): e is TideAdvancedEvent => e.type === "TIDE_ADVANCED").at(-1);
  return { state: result.state, tick };
}

describe("carte des marées — durées tirées à chaque partie", () => {
  it("chaque état dure entre TIDE_DURATION_MIN et TIDE_DURATION_MAX tours de table, et deux parties n'ont pas toutes le même rythme", () => {
    const charts = Array.from({ length: 40 }, (_, seed) => drawTideChart(seed).value);
    for (const chart of charts) {
      for (const id of TIDE_STATES_ORDER) {
        expect(chart[id]).toBeGreaterThanOrEqual(RULES.TIDE_DURATION_MIN);
        expect(chart[id]).toBeLessThanOrEqual(RULES.TIDE_DURATION_MAX);
      }
    }
    expect(new Set(charts.map((c) => JSON.stringify(c))).size).toBeGreaterThan(5);
    // Toutes les valeurs de la plage finissent par sortir, pour chaque état.
    for (const id of TIDE_STATES_ORDER) {
      expect(new Set(charts.map((c) => c[id])).size).toBe(RULES.TIDE_DURATION_MAX - RULES.TIDE_DURATION_MIN + 1);
    }
  });

  it("la partie porte sa carte, publique dès GAME_STARTED, reproductible pour une même graine", () => {
    const a = newGame(7);
    const b = newGame(7);
    expect(a.environment.tideDurations).toEqual(b.environment.tideDurations);
    expect(a.environment.tideRemainingTurns).toBe(a.environment.tideDurations!.calme);
    expect(a.environment.tideRenverseChancePercent).toBe(RULES.TIDE_RENVERSE_CHANCE_PERCENT);
    const started = a.eventLog.find((e) => e.type === "GAME_STARTED");
    expect(started && "tideDurations" in started ? started.tideDurations : undefined).toEqual(a.environment.tideDurations);
  });

  it("tirer la carte ne change pas les mains : les decks d'une graine restent les mêmes", () => {
    const tirée = newGame(11);
    const imposée = createGameState({
      gameId: "carte-des-marees",
      player1: { id: "p1", deck: DECK_LE_GRAND_BANC },
      player2: { id: "p2", deck: DECK_LE_THEATRE_ENGLOUTI },
      seed: 11,
      tideDurations: CHART,
    });
    expect(imposée.environment.tideDurations).toEqual(CHART);
    expect(imposée.environment.tideRemainingTurns).toBe(2);
    expect(imposée.players.map((p) => p.hand.map((c) => c.cardId))).toEqual(tirée.players.map((p) => p.hand.map((c) => c.cardId)));
  });

  it("l'état atteint par le décompte prend la durée de LA carte de la partie (Houle → Tempête 3)", () => {
    const { state } = finDeTourDeTable(testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideDurations: CHART }));
    expect(state.environment.tideState).toBe("tempete");
    expect(state.environment.tideRemainingTurns).toBe(3);
  });

  it("sans carte (anciennes parties, tutoriel), les durées fixes de RULES s'appliquent", () => {
    const { state } = finDeTourDeTable(testEnvironment({ tideState: "houle", tideRemainingTurns: 1 }));
    expect(state.environment.tideRemainingTurns).toBe(RULES.TIDE_STATE_DURATION.tempete);
  });

  it("une transition forcée par une carte entre aussi dans l'état avec la durée de la carte des marées", () => {
    const env = testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideDurations: CHART });
    expect(forceTideTransition(env, "avancer").tideRemainingTurns).toBe(3);
    expect(forceTideTransition(env, "reculer").tideRemainingTurns).toBe(2);
    expect(tideDurationFor(env, "abysses")).toBe(1);
  });
});

describe("renverse — le courant tourne de lui-même", () => {
  it("en Houle, une renverse inverse le sens sans toucher au décompte, et l'annonce aux deux joueurs", () => {
    const { state, tick } = finDeTourDeTable(
      testEnvironment({ tideState: "houle", tideRemainingTurns: 2, tideDurations: CHART, tideRenverseChancePercent: 100 })
    );
    expect(state.environment.tideState).toBe("houle");
    expect(state.environment.tideRemainingTurns).toBe(1);
    expect(state.environment.tideOrientation).toBe("descendante");
    expect(tick?.renverse).toBe(true);
    expect(tick?.tideOrientation).toBe("descendante");
  });

  it("une Marée qui entre en Tempête en montant peut repartir aussitôt vers le Calme", () => {
    const { state, tick } = finDeTourDeTable(
      testEnvironment({ tideState: "houle", tideRemainingTurns: 1, tideDurations: CHART, tideRenverseChancePercent: 100 })
    );
    expect(state.environment.tideState).toBe("tempete");
    expect(state.environment.tideRemainingTurns).toBe(3);
    expect(state.environment.tideOrientation).toBe("descendante");
    expect(tick?.stateChanged).toBe(true);
    expect(tick?.renverse).toBe(true);
  });

  it("jamais en Calme ni en Abysses, dont le sens est imposé", () => {
    const calme = finDeTourDeTable(testEnvironment({ tideState: "calme", tideRemainingTurns: 2, tideRenverseChancePercent: 100 }));
    expect(calme.state.environment.tideOrientation).toBe("montante");
    expect(calme.tick?.renverse).toBeUndefined();
    const abysses = finDeTourDeTable(
      testEnvironment({ tideState: "abysses", tideOrientation: "descendante", tideRemainingTurns: 2, tideRenverseChancePercent: 100 })
    );
    expect(abysses.state.environment.tideOrientation).toBe("descendante");
    expect(abysses.tick?.renverse).toBeUndefined();
  });

  it("jamais pendant un Maintien : la Marée est figée", () => {
    const { state, tick } = finDeTourDeTable(
      testEnvironment({
        tideState: "houle",
        tideRemainingTurns: 2,
        tideRenverseChancePercent: 100,
        pendingTideModifiers: [{ kind: "maintain", remainingTriggers: 1 }],
      })
    );
    expect(state.environment.tideOrientation).toBe("montante");
    expect(tick?.renverse).toBeUndefined();
  });

  it("au tour du second joueur, pas de tirage : la Marée ne décompte qu'au tour de table", () => {
    const state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { deck: [instance("marin-des-jetees", "p1")] }), testPlayer("p2", { deck: [instance("marin-des-jetees", "p2")] })],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 2, tideRenverseChancePercent: 100 }),
    });
    const result = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
    expect(result.ok && result.state.environment.tideOrientation).toBe("montante");
  });

  it("tickTide pur : la renverse demandée n'a d'effet que sur un état intermédiaire", () => {
    const base = testEnvironment({ tideState: "calme", tideRemainingTurns: 1, tideDurations: CHART });
    // Calme → Houle (montante), puis renverse : redescend vers le Calme.
    const tick = tickTide(base, { renverse: true });
    expect(tick.tideState).toBe("houle");
    expect(tick.tideRemainingTurns).toBe(1);
    expect(tick.tideOrientation).toBe("descendante");
    expect(tickTide({ ...base, tideRemainingTurns: 2 }, { renverse: true }).renverse).toBeUndefined();
  });
});
