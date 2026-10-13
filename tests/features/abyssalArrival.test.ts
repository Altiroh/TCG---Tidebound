import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { abyssalArrivals } from "@/features/match/abyssalArrival";
import { instance, testEnvironment, testGameState, testPlayer } from "../game/testHelpers";

/** L'arrivée d'une Abyssale se met en scène (tremblement, voile) ; une Standard, non. */
describe("arrivée d'une Abyssale", () => {
  function poser(cardId: string) {
    const carte = instance(cardId, "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "calme" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", reason: 10, reasonMax: 10, hand: [carte] }),
        testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10 }),
      ],
    });
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId });
    expect(pose.ok).toBe(true);
    return { carte, events: pose.ok ? pose.events : [] };
  }

  it("une Abyssale posée est repérée", () => {
    const { carte, events } = poser("marin-aux-yeux-rouges-abyssal");
    expect(abyssalArrivals(events)).toEqual([carte.instanceId]);
  });

  it("sa variante Standard ne l'est pas", () => {
    const { events } = poser("marin-aux-yeux-rouges");
    expect(abyssalArrivals(events)).toEqual([]);
  });
});
