import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getPlayer, type GameState } from "@/game/state/types";
import { answerHandDiscard, instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Mineurs de Fond au Standard Verrier (30/09/2026) : « un piège part, la
 * troupe grandit ». Joué par `dispatch` : un Sabordage de Structure.
 */

const puissance = (state: GameState, id: string) =>
  getPlayer(state, "p1").board.find((u) => u.instanceId === id)!.modifiers.reduce((sum, m) => sum + m.attack, 0);

function sabordage(observateurs: ReturnType<typeof instance>[], structures = [instance("caisses-arrimees", "p1")]) {
  const state = testGameState({
    phase: "mainPhase",
    players: [
      testPlayer("p1", {
        board: [...observateurs, ...structures],
        hand: [instance("tetard-fesse", "p1")],
        deck: [instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1")],
        reason: 10,
      }),
      testPlayer("p2", { shipId: "le-goliath" }),
    ],
  });
  const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: structures[0]!.instanceId });
  if (!result.ok) throw new Error(result.error);
  return { state: result.state, structures };
}

describe("Mineurs — un piège part, la troupe grandit", () => {
  it("Bernard-l'Ermite d'Acier gagne +1 Puissance, conservée, quand une de vos Structures est Sabordée", () => {
    const bernard = instance("bernard-lermite-dacier", "p1");
    const { state } = sabordage([bernard]);
    expect(puissance(state, bernard.instanceId)).toBe(1);
  });

  it("une seule fois par tour, même si deux Structures partent", () => {
    const bernard = instance("bernard-lermite-dacier", "p1");
    const deux = [instance("caisses-arrimees", "p1"), instance("caisses-arrimees", "p1")];
    const { state } = sabordage([bernard], deux);
    const encore = dispatch(state, { type: "saborder", playerId: "p1", instanceId: deux[1]!.instanceId });
    if (!encore.ok) throw new Error(encore.error);
    expect(puissance(encore.state, bernard.instanceId)).toBe(1);
  });

  it("Charpentier des Épaves filtre (pioche puis défausse au choix) ET gagne +1 Puissance", () => {
    const charpentier = instance("charpentier-des-epaves", "p1");
    const { state } = sabordage([charpentier]);
    const main = getPlayer(state, "p1").hand;
    const repondu = answerHandDiscard(state, [main[0]!.instanceId]);
    if (!repondu.ok) throw new Error(repondu.error);
    expect(getPlayer(repondu.state, "p1").hand).toHaveLength(main.length - 1);
    expect(puissance(repondu.state, charpentier.instanceId)).toBe(1);
  });
});
