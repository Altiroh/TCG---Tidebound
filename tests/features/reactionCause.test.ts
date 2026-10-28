import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import type { GameState } from "@/game/state/types";
import { describeReactionCause, reactionCauseVisual } from "@/features/match/reactionCause";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * Retour joueur du 27/10/2026 : la fenêtre de réaction doit dire À QUOI l'on
 * répond. Le candidat porte l'événement qui l'a rendu éligible
 * (`PendingReactionCandidate.cause`), et l'interface le raconte.
 */
function propositions(state: GameState, playerId: string) {
  const fenetre = state.pendingReaction;
  if (!fenetre) return [];
  return eligibleCandidatesFor(state, fenetre.events, playerId, fenetre.turnNumber, fenetre.usedCandidateKeys);
}

describe("Fenêtre de réaction : ce à quoi l'on répond", () => {
  it("le Harpon à Ressort répond à l'attaque de la Murène, et la fenêtre le dit", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const attaquant = instance("murene-aveugle", "p2", { summoningSick: false });
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", hand: [harpon] }),
        testPlayer("p2", { shipId: "le-goliath", board: [attaquant] }),
      ],
      activePlayerId: "p2",
    });

    const attaque = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
    expect(attaque.ok).toBe(true);
    if (!attaque.ok) return;

    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort");
    expect(candidat?.cause).toBeDefined();
    expect(describeReactionCause(attaque.state, candidat!.cause, "p1")).toBe("Murène Aveugle (adverse) attaque votre Navire");
  });

  it("le visuel montre l'attaquant, les épées et la cible — ici votre Navire", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const attaquant = instance("murene-aveugle", "p2", { summoningSick: false });
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", hand: [harpon] }),
        testPlayer("p2", { shipId: "le-goliath", board: [attaquant] }),
      ],
      activePlayerId: "p2",
    });
    const attaque = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
    expect(attaque.ok).toBe(true);
    if (!attaque.ok) return;
    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort");
    expect(reactionCauseVisual(attaque.state, candidat!.cause, "p1")).toEqual({
      action: "attack",
      source: { kind: "card", cardId: "murene-aveugle" },
      target: { kind: "ship", shipId: "le-brise-lames", mine: true },
    });
  });

  it("un sort joué avec une cible : son illustration, l'étincelle, la cible ; une unité posée n'a pas de visuel", () => {
    const cible = instance("murene-aveugle", "p1");
    const sort = instance("fievre-salee", "p2");
    const state = testGameState({
      players: [testPlayer("p1", { board: [cible] }), testPlayer("p2")],
      chainStack: [{ linkId: "l1", playerId: "p2", card: sort, targetInstanceId: cible.instanceId } as never],
    });
    expect(reactionCauseVisual(state, { trigger: "onObjectPlayed", sourceInstanceId: sort.instanceId, playerId: "p2" } as never, "p1")).toEqual({
      action: "spell",
      source: { kind: "card", cardId: "fievre-salee" },
      target: { kind: "card", cardId: "murene-aveugle" },
    });
    expect(reactionCauseVisual(state, { trigger: "onCardPlayed", cardId: "murene-aveugle", playerId: "p1" } as never, "p2")).toBeNull();
  });

  it("sans événement, rien à raconter", () => {
    expect(describeReactionCause(testGameState(), undefined, "p1")).toBeNull();
  });
});
