import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import { applyBotAction, botHasSomethingToDo, unstickAction } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Parties FIGÉES après la mort d'une Poisson-Bombe (retour du 19/10/2026) :
 * sa capacité « à sa mort » ouvre une fenêtre qui attend son propriétaire,
 * même pendant le tour adverse. Personne ne doit rester sans action légale.
 */

const pret = (cardId: string, owner: string) => instance(cardId, owner, { summoningSick: false });
function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, overrides: Partial<GameState> = {}): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
    ...overrides,
  });
}
function attaquer(state: GameState, attaquant: CardInstance, defenderInstanceId: string, playerId: string): GameState {
  const r = dispatch({ ...state, phase: "combatPhase" }, { type: "attack", playerId, attackerInstanceId: attaquant.instanceId, defenderInstanceId });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("Poisson-Bombe : jamais de partie figée", () => {
  it("tuée pendant le tour adverse : la fenêtre attend son propriétaire, qui peut toujours passer", () => {
    const bombe = instance("poisson-bombe", "p1");
    const crabe = pret("crabe-de-fer", "p2");
    const autre = instance("couveuse-difforme", "p2");
    const state = attaquer(table({ board: [bombe] }, { board: [crabe, autre] }, { activePlayerId: "p2" }), crabe, bombe.instanceId, "p2");
    expect(state.pendingReaction?.awaitingPlayerId).toBe("p1");
    const passe = dispatch(state, unstickAction(state, "p1"));
    expect(passe.ok).toBe(true);
  });

  it("la Bombe du BOT, morte pendant SON tour : il répond, et sa boucle va au bout du tour", () => {
    const bombe = pret("poisson-bombe", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const autre = instance("couveuse-difforme", "p2");
    let state = attaquer(table({ board: [bombe] }, { board: [crabe, autre] }), bombe, crabe.instanceId, "p1");
    expect(state.pendingReaction?.awaitingPlayerId).toBe("p1");
    for (let i = 0; i < 20 && botHasSomethingToDo(state, "p1"); i++) {
      const step = applyBotAction(state, "p1", chooseBotAction(state, "p1", "moyen"));
      // « Terminé » ne se dit jamais tant que le bot a encore la main : la boucle de l'écran s'arrêterait.
      expect(step.done && step.state.status === "active" && botHasSomethingToDo(step.state, "p1")).toBe(false);
      state = step.state;
    }
    expect(botHasSomethingToDo(state, "p1")).toBe(false);
  });

  it("une action refusée se replie, et le repli ne déclare pas « terminé » si le bot a encore la main", () => {
    const bombe = pret("poisson-bombe", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const autre = instance("couveuse-difforme", "p2");
    const state = attaquer(table({ board: [bombe] }, { board: [crabe, autre] }), bombe, crabe.instanceId, "p1");
    // Une cible inexistante : refusée par le moteur, le bot passe la fenêtre…
    const step = applyBotAction(state, "p1", { type: "activateReaction", playerId: "p1", sourceInstanceId: "inconnue", abilityIndex: 0 } as never);
    expect(step.state.pendingReaction).toBeUndefined();
    // … et c'est toujours SON tour : il n'a pas fini.
    expect(botHasSomethingToDo(step.state, "p1")).toBe(true);
    expect(step.done).toBe(false);
  });
});
