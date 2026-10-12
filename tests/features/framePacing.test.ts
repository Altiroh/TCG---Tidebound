import { describe, expect, it } from "vitest";
import { BASE_FRAME_MS, framePaceMs, READ_AFTER_MS } from "@/features/match/framePacing";
import { ATTACK_TOTAL_MS } from "@/features/match/useAttackPresentation";
import { volleyLandingMs, deriveEffectVolley } from "@/features/match/effectPresentation";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";
import type { GameEvent, GameState } from "@/game";

const base = { turnNumber: 3, timestamp: 0 };

function withEvents(state: GameState, events: GameEvent[]): GameState {
  return { ...state, eventLog: [...state.eventLog, ...events] };
}

describe("framePaceMs — chaque coup du tour adverse a le temps de sa mise en scène", () => {
  const attaquant = instance("murene-aveugle", "p2");
  const cible = instance("marin-des-jetees", "p1");
  const before = testGameState({ players: [testPlayer("p1", { board: [cible] }), testPlayer("p2", { board: [attaquant] })] });

  it("un coup qui ne montre rien se voit quand même passer", () => {
    expect(framePaceMs(before, before)).toBe(BASE_FRAME_MS);
  });

  it("une attaque se joue jusqu'au retour de l'attaquant, plus le temps de la lire", () => {
    const after = withEvents(before, [
      { ...base, type: "ATTACK", playerId: "p2", attackerInstanceId: attaquant.instanceId, defenderInstanceId: cible.instanceId },
      { ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 3, combat: "strike" },
    ] as GameEvent[]);
    expect(framePaceMs(before, after)).toBe(ATTACK_TOTAL_MS + READ_AFTER_MS);
  });

  it("un sort lancé de la main attend que sa comète ait touché", () => {
    const events = [{ ...base, type: "DAMAGE", targetInstanceId: cible.instanceId, amount: 1, cause: "effect", origin: { playerId: "p2" } }] as GameEvent[];
    const after = withEvents(before, events);
    const volley = deriveEffectVolley(events, before, after, 0)!;
    expect(framePaceMs(before, after)).toBe(Math.max(BASE_FRAME_MS, volleyLandingMs(volley) + READ_AFTER_MS));
    expect(framePaceMs(before, after)).toBeGreaterThan(BASE_FRAME_MS);
  });
});
