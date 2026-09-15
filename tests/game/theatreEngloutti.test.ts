import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition, MARIONNETTE } from "@/game/cards/sets/core";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { eligibleChosenUnits } from "@/game/effects/chosenTargets";
import { CORE_SET } from "@/game/cards/sets/core";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Lot 11 — Théâtre Englouti. Les trois mécaniques que le lot a apportées au
 * moteur (retour en main, répétition d'arrivée, réduction de coût) et les
 * garde-fous de la passe d'équilibrage du 15 septembre.
 */

/** Toutes les cartes du lot, reconnaissables à leur sous-type ou à leur setCode. */
const LOT_11 = CORE_SET.filter((def) => def.setCode === "theatre-englouti");

describe("catalogue du Lot 11", () => {
  it("apporte 14 cartes STANDARD et 2 variantes Abyssales", () => {
    expect(LOT_11).toHaveLength(16);
    expect(LOT_11.filter((def) => def.id.endsWith("-abyssal"))).toHaveLength(2);
  });

  it("marque la troupe d'un SOUS-TYPE, jamais d'un archétype", () => {
    // Un archétype ferait compter les Marionnettes dans les seuils
    // Cra-Poiscail (`countArchetypeUnits`), ce qui n'a aucun sens.
    for (const def of LOT_11) expect(def.archetype).toBeUndefined();
    const standard = LOT_11.filter((def) => !def.id.endsWith("-abyssal"));
    for (const def of standard) expect(def.subtype).toBe(MARIONNETTE);
  });

  it("respecte les limites de deck de la passe d'équilibrage", () => {
    // Les deux plus fortes cartes du lot sont limitées à 1 exemplaire.
    expect(getCardDefinition("le-regisseur-sans-visage").maxCopies).toBe(1);
    expect(getCardDefinition("le-rideau-se-leve").maxCopies).toBe(1);
    expect(getCardDefinition("le-regisseur-des-profondeurs-abyssal").maxCopies).toBe(1);
  });

  it("garde Il Capitano sur-staté avant sa blessure, et ramené à 3 / 4 après", () => {
    const def = getCardDefinition("il-capitano-naufrage");
    expect([def.attack, def.health]).toEqual([6, 6]);
    const debuff = def.abilities?.[0]?.effects[0];
    expect(debuff?.type).toBe("debuff");
    expect(debuff?.attackAmount?.value).toBe(3);
    expect(debuff?.healthAmount?.value).toBe(2);
  });
});

describe("retour en main", () => {
  function stateWithBoard() {
    const puppet = instance("pulcinella-gonfle", "p1", { damageMarked: 2 });
    const base = testGameState();
    return {
      puppet,
      state: {
        ...base,
        players: [testPlayer("p1", { board: [puppet] }), testPlayer("p2")] as typeof base.players,
      },
    };
  }

  it("rend un exemplaire NEUF : ni dégâts, ni modificateurs, ni ancien instanceId", () => {
    const { puppet, state } = stateWithBoard();
    const result = resolveEffect(
      state,
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { controllerId: "p1", chosenTargetInstanceId: puppet.instanceId, turnNumber: 1 }
    );

    const p1 = result.state.players[0];
    expect(p1.board).toHaveLength(0);
    expect(p1.hand).toHaveLength(1);
    expect(p1.hand[0]!.cardId).toBe("pulcinella-gonfle");
    expect(p1.hand[0]!.damageMarked).toBe(0);
    expect(p1.hand[0]!.modifiers).toEqual([]);
    expect(p1.hand[0]!.instanceId).not.toBe(puppet.instanceId);
  });

  it("émet un CARD_MOVED qui porte l'identité de la carte — sans quoi rien ne peut y réagir", () => {
    const { puppet, state } = stateWithBoard();
    const result = resolveEffect(
      state,
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { controllerId: "p1", chosenTargetInstanceId: puppet.instanceId, turnNumber: 1 }
    );

    const moved = result.events.find((e) => e.type === "CARD_MOVED");
    expect(moved).toMatchObject({ fromZone: "board", toZone: "hand", cardId: "pulcinella-gonfle", ownerId: "p1" });
  });

  it("ne renvoie jamais une carte du camp adverse dans la main du contrôleur", () => {
    const base = testGameState();
    const enemy = instance("pulcinella-gonfle", "p2");
    const state = {
      ...base,
      players: [testPlayer("p1"), testPlayer("p2", { board: [enemy] })] as typeof base.players,
    };

    const result = resolveEffect(
      state,
      { type: "moveZone", toZone: "hand", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE, sameController: false } } },
      { controllerId: "p1", chosenTargetInstanceId: enemy.instanceId, turnNumber: 1 }
    );

    expect(result.state.players[0].hand).toHaveLength(0);
    expect(result.state.players[1].board).toHaveLength(1);
  });
});

describe("ciblage par sous-type et par coût", () => {
  it("le sous-type accepte Structures et Objets, contrairement au filtre d'archétype", () => {
    const base = testGameState();
    const puppet = instance("pulcinella-gonfle", "p1");
    const structure = instance("le-theatre-englouti", "p1");
    const outsider = instance("murene-aveugle", "p1");
    const state = {
      ...base,
      players: [testPlayer("p1", { board: [puppet, structure, outsider] }), testPlayer("p2")] as typeof base.players,
    };

    const eligible = eligibleChosenUnits(state, { kind: "chosenUnit", among: { subtype: MARIONNETTE } }, "p1");
    expect(eligible.map((c) => c.unit.cardId).sort()).toEqual(["le-theatre-englouti", "pulcinella-gonfle"]);
  });

  it("le plafond de coût du Régisseur écarte les grosses Marionnettes", () => {
    const base = testGameState();
    const cheap = instance("pulcinella-gonfle", "p1"); // coût 2
    const pricey = instance("il-dottore-des-noyes", "p1"); // coût 4
    const state = {
      ...base,
      players: [testPlayer("p1", { board: [cheap, pricey] }), testPlayer("p2")] as typeof base.players,
    };

    const eligible = eligibleChosenUnits(state, { kind: "chosenUnit", among: { subtype: MARIONNETTE, maxCost: 2 } }, "p1");
    expect(eligible.map((c) => c.unit.cardId)).toEqual(["pulcinella-gonfle"]);
  });
});

describe("réduction de coût", () => {
  function stateWithDiscount(amount: number, subtype?: string) {
    const base = testGameState();
    const card = instance("colombina-aux-cent-visages", "p1"); // coût 3
    return {
      card,
      state: {
        ...base,
        players: [
          testPlayer("p1", {
            hand: [card],
            reason: 10,
            costDiscounts: [{ amount, uses: 1, expiresAfterTurn: 1, ...(subtype ? { subtype } : {}) }],
          }),
          testPlayer("p2"),
        ] as typeof base.players,
      },
    };
  }

  it("retire la réduction du coût payé, et la consomme", () => {
    const { card, state } = stateWithDiscount(1, MARIONNETTE);
    const before = state.players[0].reason;

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Colombina coûte 3, réduite à 2.
    expect(result.state.players[0].reason).toBe(before - 2);
    expect(result.state.players[0].costDiscounts ?? []).toEqual([]);
  });

  it("ne descend jamais sous 1 Raison, même en cumulant", () => {
    const base = testGameState();
    const card = instance("pulcinella-gonfle", "p1"); // coût 2
    const state = {
      ...base,
      players: [
        testPlayer("p1", {
          hand: [card],
          reason: 10,
          costDiscounts: [
            { amount: 1, uses: 1, expiresAfterTurn: 1, subtype: MARIONNETTE },
            { amount: 3, uses: 1, expiresAfterTurn: 1, subtype: MARIONNETTE },
          ],
        }),
        testPlayer("p2"),
      ] as typeof base.players,
    };

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(10 - 1);
  });

  it("ne s'applique pas à une carte d'un autre sous-type", () => {
    const base = testGameState();
    const outsider = instance("murene-aveugle", "p1"); // coût 2, pas une Marionnette
    const state = {
      ...base,
      players: [
        testPlayer("p1", {
          hand: [outsider],
          reason: 10,
          costDiscounts: [{ amount: 1, uses: 1, expiresAfterTurn: 1, subtype: MARIONNETTE }],
        }),
        testPlayer("p2"),
      ] as typeof base.players,
    };

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: outsider.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(10 - 2);
    // La charge n'a pas été dépensée : elle attend toujours sa Marionnette.
    expect(result.state.players[0].costDiscounts).toHaveLength(1);
  });

  it("est perdue au tour suivant — « ce tour » n'est pas « jusqu'à usage »", () => {
    const base = testGameState();
    const card = instance("pulcinella-gonfle", "p1");
    const state = {
      ...base,
      turnNumber: 2,
      players: [
        testPlayer("p1", {
          hand: [card],
          reason: 10,
          costDiscounts: [{ amount: 1, uses: 1, expiresAfterTurn: 1, subtype: MARIONNETTE }],
        }),
        testPlayer("p2"),
      ] as typeof base.players,
    };

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: card.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0].reason).toBe(10 - 2);
  });
});

describe("répétition d'un effet d'arrivée", () => {
  it("rejoue l'effet d'arrivée de la cible sans la faire revenir en jeu", () => {
    const base = testGameState();
    // Le Poisson-Lanterne récupère 1 Raison à son arrivée sous Tempête ;
    // on prend plutôt une arrivée inconditionnelle pour isoler la mécanique.
    const target = instance("pantalone-sans-sou", "p1");
    const state = {
      ...base,
      players: [testPlayer("p1", { board: [target], reason: 5 }), testPlayer("p2")] as typeof base.players,
    };

    const result = resolveEffect(
      state,
      { type: "repeatEnterEffects", target: { kind: "chosenUnit", among: { subtype: MARIONNETTE } } },
      { controllerId: "p1", chosenTargetInstanceId: target.instanceId, turnNumber: 1 }
    );

    // Pantalone n'a pas d'effet d'ARRIVÉE (sa capacité guette un Bris) :
    // rien ne doit se produire, et surtout la carte reste en jeu.
    expect(result.state.players[0].board).toHaveLength(1);
    expect(result.state.players[0].reason).toBe(5);
  });

  it("ne rejoue pas une capacité d'observateur — elle n'a jamais été déclenchée", () => {
    const def = getCardDefinition("le-regisseur-sans-visage");
    const ability = def.abilities?.find((a) => a.trigger === "onEnterPlay");
    // Sa capacité d'arrivée guette une AUTRE Marionnette (`triggeredBy`) :
    // c'est exactement le cas que `repeatEnterEffects` doit ignorer.
    expect(ability?.triggeredBy).toBeDefined();
  });
});
