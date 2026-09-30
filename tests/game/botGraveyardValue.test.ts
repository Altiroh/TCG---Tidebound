import { describe, expect, it } from "vitest";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { evaluateState } from "@/game/bot/evaluateState";
import type { GameState, PlayerState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Le bot voit le Cimetière et le Jugement de l'Océan (`game/bot/graveyardValue.ts`) :
 * sans ça, le banc d'essai ne pouvait pas juger La Veillée ni les Épavistes.
 */

function withTestCard<T>(def: CardDefinition, run: () => T): T {
  const table = CARD_DATABASE as Map<string, CardDefinition>;
  table.set(def.id, def);
  try {
    return run();
  } finally {
    table.delete(def.id);
  }
}

function state(p1: Partial<PlayerState>, p2: Partial<PlayerState> = {}): GameState {
  return testGameState({ players: [testPlayer("p1", p1), testPlayer("p2", { shipId: "le-goliath", ...p2 })] });
}

const deck = (n: number, owner: string) => Array.from({ length: n }, () => instance("tetard-fesse", owner));

describe("valeur du Cimetière pour le bot", () => {
  it("une cible repêchable vaut quelque chose quand on tient de quoi la repêcher — et seulement alors", () => {
    // Grappin de Récupération : « une Structure ou un Équipement coûtant 2 ou moins ».
    const grappin = instance("grappin-de-recuperation", "p1");
    const eligible = instance("caisses-arrimees", "p1");
    const horsFiltre = instance("tetard-fesse", "p1");

    const avecCible = evaluateState(state({ hand: [grappin], graveyard: [eligible] }), "p1");
    const sansCible = evaluateState(state({ hand: [grappin], graveyard: [horsFiltre] }), "p1");
    expect(avecCible).toBeGreaterThan(sansCible);

    // Sans repêcheur en main ni en jeu, le contenu du Cimetière est indifférent.
    const sansGrappinA = evaluateState(state({ graveyard: [eligible] }), "p1");
    const sansGrappinB = evaluateState(state({ graveyard: [horsFiltre] }), "p1");
    expect(sansGrappinA).toBeCloseTo(sansGrappinB);
  });

  it("un montant compté sur le Cimetière vaut ce qu'il compte déjà, par tranche et jusqu'au plafond", () => {
    const compteur: CardDefinition = {
      id: "test-compteur-du-cimetiere",
      name: "Compteur du Cimetière",
      type: "objet",
      cost: 3,
      text: "Infligez 1 dégât au Navire adverse par tranche de 2 cartes Un Dead dans votre Cimetière (maximum 2).",
      onPlayEffects: [
        { type: "damage", target: { kind: "opponentPlayer" }, amount: { kind: "graveyardCount", subtype: "un-dead", perCards: 2, max: 2 } },
      ],
    } as unknown as CardDefinition;

    withTestCard(compteur, () => {
      const main = [instance(compteur.id, "p1")];
      const unDead = (n: number) => Array.from({ length: n }, () => instance("ptit-bout", "p1"));
      const score = (graveyard: PlayerState["graveyard"]) => evaluateState(state({ hand: main, graveyard }), "p1");

      expect(score(unDead(2))).toBeGreaterThan(score(unDead(1)));
      expect(score(unDead(4))).toBeGreaterThan(score(unDead(2)));
      // Plafond atteint : au-delà, plus rien.
      expect(score(unDead(8))).toBeCloseTo(score(unDead(4)));
      // Hors sous-type : ne compte pas.
      expect(score([instance("tetard-fesse", "p1"), instance("tetard-fesse", "p1")])).toBeCloseTo(score([]));
    });
  });
});

describe("Jugement de l'Océan vu par le bot", () => {
  it("en tête, une pioche qui s'épuise rapproche la victoire ; en retard, elle l'éloigne", () => {
    const enTete = { anchor: 26, reason: 6 };
    const enRetard = { anchor: 14, reason: 2 };

    const loin = evaluateState(state({ ...enTete, deck: deck(30, "p1") }, { ...enRetard, deck: deck(30, "p2") }), "p1");
    const proche = evaluateState(state({ ...enTete, deck: deck(1, "p1") }, { ...enRetard, deck: deck(30, "p2") }), "p1");
    expect(proche).toBeGreaterThan(loin);

    const loinRetard = evaluateState(state({ ...enRetard, deck: deck(30, "p1") }, { ...enTete, deck: deck(30, "p2") }), "p1");
    const procheRetard = evaluateState(state({ ...enRetard, deck: deck(1, "p1") }, { ...enTete, deck: deck(30, "p2") }), "p1");
    expect(procheRetard).toBeLessThan(loinRetard);
  });

  it("loin de l'échéance, la taille de la pioche ne compte pas", () => {
    const a = evaluateState(state({ deck: deck(30, "p1") }, { deck: deck(30, "p2") }), "p1");
    const b = evaluateState(state({ deck: deck(12, "p1") }, { deck: deck(20, "p2") }), "p1");
    expect(a).toBeCloseTo(b);
  });
});
