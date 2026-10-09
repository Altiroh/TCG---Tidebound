import { describe, expect, it } from "vitest";
import { abilityValue } from "@/game/bot/abilityValue";
import { evaluateState } from "@/game/bot/evaluateState";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Le bot donne une valeur aux capacités déclenchées des permanents
 * (`game/bot/abilityValue.ts`) : un moteur posé ne vaut plus sa seule Résistance.
 */

const state = testGameState();
const player = state.players[0];
const value = (cardId: string, overrides = {}) => abilityValue(state, instance(cardId, "p1", overrides), player);

describe("valeur des capacités d'un permanent", () => {
  it("une carte sans capacité déclenchée ne gagne rien", () => {
    expect(value("ptite-fesse")).toBe(0);
  });

  it("une Structure de moteur (La Marelle : défausse → dégâts au Navire) rapporte", () => {
    expect(value("la-marelle")).toBeGreaterThan(1);
  });

  it("le revenu suit la durée restante : une Structure qui expire rapporte moins", () => {
    expect(value("la-marelle", { turnsRemaining: 1 })).toBeLessThan(value("la-marelle", { turnsRemaining: 4 }));
    expect(value("la-marelle", { turnsRemaining: 0 })).toBe(0);
  });

  it("Équipage de Verre : se blesser chaque tour pour grandir est un revenu, pas une perte", () => {
    expect(value("eclaireur-ebreche")).toBeGreaterThan(0);
  });

  it("un coût à venir se compte aussi (Il Capitano perdra 3 Puissance et 2 Résistance)", () => {
    expect(value("il-capitano-naufrage")).toBeLessThan(0);
  });

  it("à Résistance égale, le plateau qui porte le moteur vaut plus", () => {
    const avecMoteur = testGameState({
      players: [testPlayer("p1", { board: [instance("la-marelle", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const structureNue = testGameState({
      players: [testPlayer("p1", { board: [instance("brise-vague-de-fortune", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    // Brise-Vague de Fortune : même Résistance 4, mais aucun revenu à chaque tour — seulement une protection contre la Tempête.
    expect(evaluateState(avecMoteur, "p1")).toBeGreaterThan(evaluateState(structureNue, "p1"));
  });

  it("un carburant vaut ce qu'il fait tourner : meuler sa pioche vaut plus avec La Marelle en jeu", () => {
    const meuleur = {
      id: "test-meuleur-de-tour",
      name: "Meuleur de tour",
      type: "structure",
      cost: 3,
      health: 4,
      durationTurns: 4,
      text: "Durée : 4 tours de table. Au début de votre tour, placez les 2 premières cartes de votre pioche dans votre Cimetière.",
      abilities: [{ trigger: "startOfTurn", effects: [{ type: "mill", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 2 } }] }],
    } as unknown as CardDefinition;
    const table = CARD_DATABASE as Map<string, CardDefinition>;
    table.set(meuleur.id, meuleur);
    try {
      const puits = instance(meuleur.id, "p1");
      const seul = testPlayer("p1", { board: [puits] });
      const avecMarelle = testPlayer("p1", { board: [puits, instance("la-marelle", "p1")] });
      expect(abilityValue(state, puits, avecMarelle)).toBeGreaterThan(abilityValue(state, puits, seul));
    } finally {
      table.delete(meuleur.id);
    }
  });
});
