import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * « PIOCHEZ PUIS DÉFAUSSEZ » (règle du 05/10/2026) : la carte que l'effet
 * vient de faire piocher ne peut pas être celle qu'on défausse. Sans autre
 * carte en main à défausser, l'effet ne s'applique pas — ni pioche, ni
 * défausse.
 *
 * Mousse des Quarts : « À son arrivée, piochez 1 carte puis défaussez
 * 1 carte. » — même forme que Vigie aux Fissures, sans déclencheur à monter.
 */

function jouerMousse(handExtra: ReturnType<typeof instance>[]) {
  const mousse = instance("mousse-des-quarts", "p1");
  const piochee = instance("crabe-de-fer", "p1");
  const state = testGameState({
    players: [
      testPlayer("p1", { hand: [mousse, ...handExtra], deck: [piochee] }),
      testPlayer("p2", { shipId: "le-goliath" }),
    ],
  });
  const joue = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
  if (!joue.ok) throw new Error(joue.error);
  return { joue, piochee };
}

describe("piochez puis défaussez", () => {
  it("la carte piochée est hors d'atteinte de la défausse", () => {
    const enMain = instance("marin-des-jetees", "p1");
    const { joue, piochee } = jouerMousse([enMain]);
    const choice = joue.state.pendingChoice;
    expect(choice?.kind).toBe("handDiscard");
    if (choice?.kind !== "handDiscard") return;
    expect(choice.excludedInstanceIds).toEqual([piochee.instanceId]);
    expect(choice.count).toBe(1);

    const refus = dispatch(joue.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { discardInstanceIds: [piochee.instanceId] },
    });
    expect(refus.ok).toBe(false);

    const ok = dispatch(joue.state, { type: "resolveChoice", playerId: "p1", choice: { discardInstanceIds: [enMain.instanceId] } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const p1 = ok.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.map((c) => c.instanceId)).toEqual([piochee.instanceId]);
    expect(p1.graveyard.some((c) => c.instanceId === enMain.instanceId)).toBe(true);
  });

  it("sans autre carte en main, l'effet ne s'applique pas : ni pioche, ni défausse", () => {
    const { joue, piochee } = jouerMousse([]);
    expect(joue.state.pendingChoice).toBeUndefined();
    const p1 = joue.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toHaveLength(0);
    expect(p1.deck.map((c) => c.instanceId)).toEqual([piochee.instanceId]);
  });

  it("le bot ne propose jamais de défausser la carte piochée", () => {
    const enMain = instance("marin-des-jetees", "p1");
    const { joue, piochee } = jouerMousse([enMain]);
    const actions = enumerateCandidateActions(joue.state, "p1");
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      if (action.type === "resolveChoice" && typeof action.choice === "object" && "discardInstanceIds" in action.choice) {
        expect(action.choice.discardInstanceIds).not.toContain(piochee.instanceId);
      }
    }
    const choisie = chooseBotAction(joue.state, "p1", "moyen");
    expect(dispatch(joue.state, choisie).ok).toBe(true);
  });
});
