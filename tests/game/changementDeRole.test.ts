import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { previewPlayCardReason } from "@/game/actions/playCard";
import { recalledInstanceId } from "@/game/effects/resolveEffect";
import { getCardDefinition } from "@/game/cards/sets/core";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Changement de rôle ! (refonte des Objets, 13/10/2026) : « Renvoyez une
 * Marionnette alliée en main. Une autre Marionnette de votre main coûte 1 de
 * moins ce tour (minimum 1). » Plus de gratuité ni de limite par nom.
 */

function joue(state: GameState, action: Parameters<typeof dispatch>[1]): GameState {
  const result = dispatch(state, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function scene() {
  const sortante = instance("pulcinella-gonfle", "p1"); // coût 2
  const autre = instance("arlecchino-des-profondeurs", "p1"); // coût 2
  const entrante = instance("la-prima-noyee", "p1"); // coût 3
  const raccommodeur = instance("arlequin-raccommodeur", "p1"); // coût 2
  const changement = instance("changement-de-role", "p1");
  const second = instance("changement-de-role", "p1");
  const state = testGameState({
    phase: "mainPhase",
    players: [
      testPlayer("p1", {
        board: [sortante, autre],
        hand: [changement, second, entrante, raccommodeur],
        reason: 10,
        deck: [instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1")],
      }),
      testPlayer("p2", { deck: [instance("crabe-de-fer", "p2"), instance("crabe-de-fer", "p2")] }),
    ],
  });
  const apres = joue(state, {
    type: "playCard",
    playerId: "p1",
    instanceId: changement.instanceId,
    targetInstanceId: sortante.instanceId,
  });
  return { apres, sortante, autre, entrante, raccommodeur, second };
}

describe("Changement de rôle ! — une Marionnette sort, une autre coûte 1 de moins", () => {
  it("renvoie la Marionnette désignée, et une AUTRE Marionnette de la main coûte 1 de moins", () => {
    const { apres, sortante, entrante } = scene();
    const main = getPlayer(apres, "p1").hand.map((c) => c.instanceId);
    expect(main).toContain(recalledInstanceId(sortante.instanceId, apres.turnNumber));

    expect(previewPlayCardReason(apres, "p1", entrante.instanceId)?.cost).toBe(getCardDefinition("la-prima-noyee").cost - 1);
    const raison = getPlayer(apres, "p1").reason;
    const posee = joue(apres, { type: "playCard", playerId: "p1", instanceId: entrante.instanceId });
    expect(getPlayer(posee, "p1").reason).toBe(raison - (getCardDefinition("la-prima-noyee").cost - 1));
    expect(getPlayer(posee, "p1").board.some((u) => u.instanceId === entrante.instanceId)).toBe(true);
  });

  it("la Marionnette qui vient de sortir n'en profite pas : elle paie son coût", () => {
    const { apres, sortante } = scene();
    const revenue = recalledInstanceId(sortante.instanceId, apres.turnNumber);
    expect(previewPlayCardReason(apres, "p1", revenue)?.cost).toBe(getCardDefinition("pulcinella-gonfle").cost);
  });

  it("une seule réduction : la Marionnette suivante paie de nouveau plein tarif", () => {
    const { apres, entrante, raccommodeur } = scene();
    const posee = joue(apres, { type: "playCard", playerId: "p1", instanceId: entrante.instanceId });
    expect(previewPlayCardReason(posee, "p1", raccommodeur.instanceId)?.cost).toBe(getCardDefinition("arlequin-raccommodeur").cost);
  });

  it("plus de limite par nom : un second Changement de rôle ! se joue le même tour (Objet Marionnette, il profite de la réduction)", () => {
    const { apres, autre, entrante, second } = scene();
    // « Une autre Marionnette de votre main » : l'Objet Marionnette en est une.
    expect(previewPlayCardReason(apres, "p1", second.instanceId)?.cost).toBe(1);
    const raison = getPlayer(apres, "p1").reason;
    const deux = joue(apres, {
      type: "playCard",
      playerId: "p1",
      instanceId: second.instanceId,
      targetInstanceId: autre.instanceId,
    });
    expect(getPlayer(deux, "p1").reason).toBe(raison - 1);
    expect(getPlayer(deux, "p1").board.some((u) => u.instanceId === autre.instanceId)).toBe(false);
    // La réduction du premier est consommée, celle du second attend : 3 - 1.
    expect(previewPlayCardReason(deux, "p1", entrante.instanceId)?.cost).toBe(2);
  });

  it("(minimum 1) : cumulée à une autre réduction, la Marionnette coûte encore 1", () => {
    const { apres, raccommodeur } = scene();
    const p1 = getPlayer(apres, "p1");
    // Une seconde réduction de 1 sur les Marionnettes, déjà acquise ce tour.
    const cumul: GameState = {
      ...apres,
      players: apres.players.map((p) =>
        p.id === "p1"
          ? { ...p, costDiscounts: [...(p1.costDiscounts ?? []), { amount: 1, uses: 1, expiresAfterTurn: apres.turnNumber, subtype: "marionnette" }] }
          : p
      ) as GameState["players"],
    };
    // Coût 2, deux réductions de 1 : plancher à 1.
    expect(previewPlayCardReason(cumul, "p1", raccommodeur.instanceId)?.cost).toBe(1);
  });
});

describe("Chacun sa Place et Abandonnez le Navire ! — coûts du 01/10/2026", () => {
  it("Chacun sa Place coûte 3, Abandonnez le Navire ! coûte 2", () => {
    expect(getCardDefinition("chacun-sa-place").cost).toBe(3);
    expect(getCardDefinition("abandonnez-le-navire").cost).toBe(2);
  });
});
