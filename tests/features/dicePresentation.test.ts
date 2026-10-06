import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { nextInt } from "@/game/rng";
import type { DieSize, GameState } from "@/game/state/types";
import { beforeDieDisplay, DIE_READ_MS, dieHoldMs, freshDieRoll } from "@/features/match/dicePresentation";
import { dieSettleMs } from "@/features/match/dice/diceTimings";
import { instance, testEnvironment, testGameState, testPlayer } from "../game/testHelpers";

/**
 * Jet de dé résolu d'office : tant que le dé roule, le plateau montre la
 * carte posée et payée, mais pas encore l'issue de son jet (retour du
 * 06/10/2026 : « les effets s'appliquent avant de voir le résultat »).
 */

/** Graine dont le premier tirage d'un dé à `die` faces donne `face`. */
function graine(die: DieSize, face: number): number {
  for (let s = 1; s < 100_000; s += 1) if (nextInt(s, die).value + 1 === face) return s;
  throw new Error(`aucune graine pour ${face} sur D${die}`);
}

function table(hand: GameState["players"][0]["hand"], rngState: number): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    rngState,
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, hand, deck: pioche("p1") }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2") }),
    ],
  });
}

describe("jet résolu d'office : l'issue attend que le dé soit posé", () => {
  const gaston = instance("gaston-aventurier-de-ladalle", "p1");
  const before = table([gaston], graine(6, 1));
  const r = dispatch(before, { type: "playCard", playerId: "p1", instanceId: gaston.instanceId });
  if (!r.ok) throw new Error(r.error);
  const after = r.state;
  const events = after.eventLog.slice(before.eventLog.length);

  it("repère le jet apparu et fermé dans le même lot, et retient le temps de le poser puis de le lire", () => {
    const hold = freshDieRoll(events, before)!;
    expect(hold.die).toBe(6);
    expect(events[hold.index]!.type).toBe("DIE_RESOLVED");
    expect(dieHoldMs(hold)).toBe(dieSettleMs(6) + DIE_READ_MS);
  });

  it("montre Gaston posé et payé, mais pas son Échec critique (1 dégât)", () => {
    const hold = freshDieRoll(events, before)!;
    const shown = beforeDieDisplay(before, after, events, hold);
    const p1 = shown.players[0];
    expect(p1.hand.some((card) => card.instanceId === gaston.instanceId)).toBe(false);
    const pose = p1.board.find((unit) => unit.instanceId === gaston.instanceId)!;
    expect(pose).toBeDefined();
    expect(pose.damageMarked ?? 0).toBe(0);
    expect(p1.reason).toBe(10 - 2);
    // Le dégât, lui, est bien dans l'état réel.
    const reel = after.players[0].board.find((unit) => unit.instanceId === gaston.instanceId);
    expect(reel?.damageMarked).toBe(1);
    // Le journal affiché s'arrête avant le jet.
    expect(shown.eventLog.some((event) => event.type === "DIE_RESOLVED")).toBe(false);
  });

  it("ne retient rien quand le jet était déjà ouvert : le dé est posé depuis longtemps", () => {
    const ouvert: GameState = {
      ...before,
      pendingChoice: { kind: "dieRoll", playerId: "p1", die: 6, value: 3, rolls: [3], successAt: 4 } as unknown as GameState["pendingChoice"],
    };
    expect(freshDieRoll(events, ouvert)).toBeNull();
  });
});
