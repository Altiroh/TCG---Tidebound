import { describe, expect, it } from "vitest";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { evaluateState } from "@/game/bot/evaluateState";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Le bot voit la Marée qui vient (`tideOutlook`, `evaluateState.ts`) : un
 * plateau qui s'apprête à grandir, ou à disparaître, vaut en conséquence.
 */

const pioche = (n: number, o: string) => Array.from({ length: n }, () => instance("tetard-fesse", o));

function avecMaree(board: ReturnType<typeof instance>[], tide: { tideState: "calme" | "houle" | "tempete" | "abysses"; tideRemainingTurns: number; tideOrientation: "montante" | "descendante" }, extra = {}): GameState {
  return testGameState({
    phase: "mainPhase",
    environment: testEnvironment(tide),
    players: [
      testPlayer("p1", { board, deck: pioche(20, "p1"), ...extra }),
      testPlayer("p2", { shipId: "le-goliath", deck: pioche(20, "p2") }),
    ],
  });
}

describe("la Marée qui vient, vue par le bot", () => {
  // Masse-Sombre : 3/4, inactive en Calme, 4/4 en Abysses.
  it("un plateau qui va grandir vaut plus quand le changement approche", () => {
    const proche = evaluateState(avecMaree([instance("masse-sombre", "p1")], { tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }), "p1");
    const loin = evaluateState(avecMaree([instance("masse-sombre", "p1")], { tideState: "tempete", tideRemainingTurns: 3, tideOrientation: "montante" }), "p1");
    expect(proche).toBeGreaterThan(loin);
  });

  it("le sens compte : vers les Abysses, Masse-Sombre y gagne ; vers la Houle, rien", () => {
    const versAbysses = evaluateState(avecMaree([instance("masse-sombre", "p1")], { tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "montante" }), "p1");
    const versHoule = evaluateState(avecMaree([instance("masse-sombre", "p1")], { tideState: "tempete", tideRemainingTurns: 1, tideOrientation: "descendante" }), "p1");
    expect(versAbysses).toBeGreaterThan(versHoule);
  });

  it("une unité que la prochaine Marée emporte perd sa valeur d'avance", () => {
    const table = CARD_DATABASE as Map<string, CardDefinition>;
    const fragile = { id: "test-fragile-au-calme", name: "Fragile", type: "creature", cost: 2, attack: 2, health: 2, text: "", tideAffinity: { calme: { destroyed: true } } } as unknown as CardDefinition;
    table.set(fragile.id, fragile);
    try {
      const menacee = evaluateState(avecMaree([instance(fragile.id, "p1")], { tideState: "houle", tideRemainingTurns: 1, tideOrientation: "descendante" }), "p1");
      const tranquille = evaluateState(avecMaree([instance(fragile.id, "p1")], { tideState: "houle", tideRemainingTurns: 1, tideOrientation: "montante" }), "p1");
      expect(menacee).toBeLessThan(tranquille);
    } finally {
      table.delete(fragile.id);
    }
  });

  it("le bot pilote : il raccourcit la Marée quand la suivante sert son plateau", () => {
    const sondeur = instance("sondeur-des-mauvaises-eaux", "p1");
    const state = avecMaree(
      [sondeur, instance("masse-sombre", "p1"), instance("masse-sombre", "p1")],
      { tideState: "tempete", tideRemainingTurns: 2, tideOrientation: "montante" },
      { reason: 6 }
    );
    expect(chooseBotAction(state, "p1", "moyen", () => 0.99)).toMatchObject({ type: "activateAbility", sourceInstanceId: sondeur.instanceId });
  });
});
