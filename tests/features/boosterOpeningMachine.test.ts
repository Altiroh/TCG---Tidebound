import { describe, expect, it } from "vitest";
import {
  boosterOpeningReducer,
  createBoosterOpeningState,
  isCardInteractive,
  type BoosterOpeningEvent,
  type BoosterOpeningState,
} from "@/features/boosters/opening/boosterOpeningMachine";

function run(state: BoosterOpeningState, events: BoosterOpeningEvent[]): BoosterOpeningState {
  return events.reduce(boosterOpeningReducer, state);
}

const INTRO: BoosterOpeningEvent[] = [
  { type: "assetsReady" },
  { type: "packSettled" },
  { type: "packTorn" },
  { type: "cardsPlaced" },
];

describe("boosterOpeningReducer", () => {
  it("enchaîne les phases d'introduction dans l'ordre", () => {
    let state = createBoosterOpeningState(5);
    expect(state.phase).toBe("idle");
    const phases = INTRO.map((event) => {
      state = boosterOpeningReducer(state, event);
      return state.phase;
    });
    expect(phases).toEqual(["enter", "opening", "cardsSpawning", "cardsReady"]);
  });

  it("ignore les événements hors séquence", () => {
    const state = createBoosterOpeningState(5);
    expect(boosterOpeningReducer(state, { type: "packTorn" })).toBe(state);
    expect(boosterOpeningReducer(state, { type: "cardsPlaced" })).toBe(state);
  });

  it("refuse toute révélation avant que les cartes soient posées", () => {
    const spawning = run(createBoosterOpeningState(5), INTRO.slice(0, 3));
    expect(spawning.phase).toBe("cardsSpawning");
    expect(isCardInteractive(spawning, 0)).toBe(false);
    expect(boosterOpeningReducer(spawning, { type: "revealRequested", index: 0, withPause: false })).toBe(spawning);
  });

  it("passe par charging pour une carte avec pause, et ne se retourne qu'une fois", () => {
    const ready = run(createBoosterOpeningState(2), INTRO);
    const charging = boosterOpeningReducer(ready, { type: "revealRequested", index: 1, withPause: true });
    expect(charging.cards[1]).toBe("charging");
    expect(charging.phase).toBe("revealing");
    expect(isCardInteractive(charging, 1)).toBe(false);
    expect(boosterOpeningReducer(charging, { type: "revealRequested", index: 1, withPause: true })).toBe(charging);
    // Un reveal ne peut pas sauter le flip.
    expect(boosterOpeningReducer(charging, { type: "cardRevealed", index: 1 })).toBe(charging);
  });

  it("termine l'ouverture quand toutes les cartes sont révélées", () => {
    const ready = run(createBoosterOpeningState(2), INTRO);
    const done = run(ready, [
      { type: "revealRequested", index: 0, withPause: false },
      { type: "revealRequested", index: 1, withPause: true },
      { type: "cardRevealed", index: 0 },
      { type: "flipStarted", index: 1 },
    ]);
    expect(done.phase).toBe("revealing");
    const completed = boosterOpeningReducer(done, { type: "cardRevealed", index: 1 });
    expect(completed.cards).toEqual(["revealed", "revealed"]);
    expect(completed.phase).toBe("completed");
  });
});
