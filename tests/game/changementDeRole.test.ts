import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { previewPlayCardReason } from "@/game/actions/playCard";
import { recalledInstanceId } from "@/game/effects/resolveEffect";
import { getCardDefinition } from "@/game/cards/sets/core";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Changement de rôle ! refondu (décision du 01/10/2026) : « renvoyez une
 * unité Marionnette que vous contrôlez dans votre main. Vous pouvez jouer une
 * autre Marionnette depuis votre main ce tour sans payer son coût de Raison.
 * Une seule carte nommée Changement de rôle ! peut être Brisée par tour. »
 */

function joue(state: GameState, action: Parameters<typeof dispatch>[1]): GameState {
  const result = dispatch(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function scene() {
  const sortante = instance("pulcinella-gonfle", "p1");
  const entrante = instance("la-prima-noyee", "p1");
  const changement = instance("changement-de-role", "p1");
  const second = instance("changement-de-role", "p1");
  const state = testGameState({
    phase: "mainPhase",
    players: [
      testPlayer("p1", {
        board: [sortante, changement, second],
        hand: [entrante],
        reason: 5,
        deck: [instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1")],
      }),
      testPlayer("p2", { deck: [instance("crabe-de-fer", "p2"), instance("crabe-de-fer", "p2")] }),
    ],
  });
  const apres = joue(state, {
    type: "breakObject",
    playerId: "p1",
    instanceId: changement.instanceId,
    targetInstanceId: sortante.instanceId,
  });
  return { apres, sortante, entrante, second };
}

describe("Changement de rôle ! — une Marionnette sort, une autre entre", () => {
  it("renvoie la Marionnette désignée, et une AUTRE Marionnette se joue sans payer de Raison", () => {
    const { apres, sortante, entrante } = scene();
    const main = getPlayer(apres, "p1").hand.map((c) => c.instanceId);
    expect(main).toContain(recalledInstanceId(sortante.instanceId, apres.turnNumber));

    expect(previewPlayCardReason(apres, "p1", entrante.instanceId)?.cost).toBe(0);
    const raison = getPlayer(apres, "p1").reason;
    const posee = joue(apres, { type: "playCard", playerId: "p1", instanceId: entrante.instanceId });
    expect(getPlayer(posee, "p1").reason).toBe(raison);
    expect(getPlayer(posee, "p1").board.some((u) => u.instanceId === entrante.instanceId)).toBe(true);
  });

  it("la Marionnette qui vient de sortir n'en profite pas : elle paie son coût", () => {
    const { apres, sortante } = scene();
    const revenue = recalledInstanceId(sortante.instanceId, apres.turnNumber);
    expect(previewPlayCardReason(apres, "p1", revenue)?.cost).toBe(getCardDefinition("pulcinella-gonfle").cost);
  });

  it("une seule gratuité : la Marionnette suivante paie de nouveau", () => {
    const { apres, sortante, entrante } = scene();
    const posee = joue(apres, { type: "playCard", playerId: "p1", instanceId: entrante.instanceId });
    const revenue = recalledInstanceId(sortante.instanceId, apres.turnNumber);
    expect(previewPlayCardReason(posee, "p1", revenue)?.cost).toBe(getCardDefinition("pulcinella-gonfle").cost);
  });

  it("une seule carte nommée Changement de rôle ! peut être Brisée par tour", () => {
    const { apres, entrante, second } = scene();
    const posee = joue(apres, { type: "playCard", playerId: "p1", instanceId: entrante.instanceId });
    const refus = dispatch(posee, {
      type: "breakObject",
      playerId: "p1",
      instanceId: second.instanceId,
      targetInstanceId: entrante.instanceId,
    });
    expect(refus.ok).toBe(false);
  });
});

describe("Chacun sa Place et Abandonnez le Navire ! — coûts du 01/10/2026", () => {
  it("Chacun sa Place coûte 3, Abandonnez le Navire ! coûte 2", () => {
    expect(getCardDefinition("chacun-sa-place").cost).toBe(3);
    expect(getCardDefinition("abandonnez-le-navire").cost).toBe(2);
  });
});
