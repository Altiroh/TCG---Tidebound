import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { CARD_DATABASE } from "@/game/cards/sets/core";
import type { CardDefinition, CardInstance } from "@/game/cards/types";
import { computeEffectiveStats } from "@/game/cards/stats";
import { hasKeywordInContext } from "@/game/rules/validation";
import { processSummonEnterTriggers, processTrigger } from "@/game/triggers/triggerBus";
import { deriveReactionTriggerEvents } from "@/game/reactions/reactionWindow";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerState } from "@/game/state/types";
import { activateReactionFor, answerHandDiscard, instance, pendingCandidates, testEnvironment, testGameState, testPlayer, enFinDeTour } from "./testHelpers";

/**
 * Revue cartes ↔ moteur, phase 2 — Lot 10 (Cra-Poiscail), Lot 11 (Théâtre
 * Englouti) et Lot 13 (Un Dead). Chaque bloc joue la carte via `dispatch` et
 * vérifie l'effet observable, avec le cas qui était faux avant.
 */

const p = (state: GameState, id: string): PlayerState => state.players.find((x) => x.id === id)!;
const unit = (state: GameState, instanceId: string) => state.players.flatMap((x) => x.board).find((u) => u.instanceId === instanceId);
const sum = (u: CardInstance | undefined, stat: "attack" | "health") => (u?.modifiers ?? []).reduce((s, m) => s + m[stat], 0);
const filler = (ownerId: string, n = 4) => Array.from({ length: n }, () => instance("marin-des-jetees", ownerId));

function ok(result: ReturnType<typeof dispatch>): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Passe toutes les fenêtres de réaction ouvertes (entames de tour, Marée…). */
function passAll(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 10 && s.pendingReaction; i++) {
    s = ok(dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId }));
  }
  return s;
}

function endTurn(state: GameState, playerId: string): GameState {
  return passAll(ok(dispatch(enFinDeTour(passAll(state)), { type: "endTurn", playerId })));
}

function eventsOf(result: ReturnType<typeof dispatch>): GameEvent[] {
  if (!result.ok) throw new Error(result.error);
  return result.events;
}

describe("Il Dottore des Noyés — « jusqu'à VOTRE prochain tour »", () => {
  it("le malus posé sur une unité adverse tient pendant tout le tour adverse et tombe à l'entame du tour du lanceur", () => {
    const dottore = instance("il-dottore-des-noyes", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    let state = testGameState({
      turnNumber: 1,
      players: [
        testPlayer("p1", { hand: [dottore], deck: filler("p1") }),
        testPlayer("p2", { shipId: "le-goliath", board: [crabe], deck: filler("p2") }),
      ],
    });
    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: dottore.instanceId }));
    const malus = pendingCandidates(state).find((c) => c.cardId === "il-dottore-des-noyes" && c.abilityIndex === 1)!;
    state = ok(
      dispatch(state, {
        type: "activateReaction",
        playerId: "p1",
        sourceInstanceId: malus.sourceInstanceId,
        abilityIndex: malus.abilityIndex,
        targetInstanceId: crabe.instanceId,
      })
    );
    expect(sum(unit(state, crabe.instanceId), "attack")).toBe(-2);

    // Tour de p2 : avant la correction, le malus tombait ICI (début du tour
    // du propriétaire de l'unité).
    state = endTurn(state, "p1");
    expect(state.activePlayerId).toBe("p2");
    expect(sum(unit(state, crabe.instanceId), "attack")).toBe(-2);
    expect(sum(unit(state, crabe.instanceId), "health")).toBe(-2);

    // Prochain tour de p1 : le malus a fait son office.
    state = endTurn(state, "p2");
    expect(state.activePlayerId).toBe("p1");
    expect(unit(state, crabe.instanceId)!.modifiers).toEqual([]);
  });
});

describe("Le Régisseur Sans Visage — « renvoyer une AUTRE unité Marionnette »", () => {
  function setup() {
    const regisseur = instance("le-regisseur-sans-visage", "p1");
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const arlecchino = instance("arlecchino-des-profondeurs", "p1");
    const state = testGameState({
      turnNumber: 1,
      players: [
        testPlayer("p1", { board: [regisseur, pulcinella], hand: [arlecchino] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    return { pulcinella, arlecchino, state: ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: arlecchino.instanceId })) };
  }

  it("ne peut pas renvoyer la Marionnette qui vient d'arriver", () => {
    const { arlecchino, state } = setup();
    expect(activateReactionFor(state, "le-regisseur-sans-visage", arlecchino.instanceId).ok).toBe(false);
  });

  it("renvoie une autre Marionnette de coût 2 ou moins, et la prochaine unité Marionnette coûte 1 de moins", () => {
    const { pulcinella, state } = setup();
    const after = ok(activateReactionFor(state, "le-regisseur-sans-visage", pulcinella.instanceId));
    expect(p(after, "p1").board.some((u) => u.instanceId === pulcinella.instanceId)).toBe(false);
    expect(p(after, "p1").hand.some((c) => c.cardId === "pulcinella-gonfle")).toBe(true);
    expect(p(after, "p1").costDiscounts?.[0]).toMatchObject({ amount: 1, subtype: "marionnette", cardTypes: ["marin", "creature"] });
  });
});

describe("arrivée JOUÉE, invoquée ou REJOUÉE (`onlyPlayed`, arrivée rejouée invisible des observateurs)", () => {
  it("Le Rideau se Lève ne se consomme pas sur sa propre pose : la Marionnette jouée ensuite est répétée", () => {
    const rideau = instance("le-rideau-se-leve", "p1");
    const pulcinella = instance("pulcinella-gonfle", "p1");
    let state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { hand: [rideau, pulcinella], reason: 10 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const poseRideau = dispatch(state, { type: "playCard", playerId: "p1", instanceId: rideau.instanceId });
    expect(eventsOf(poseRideau).some((e) => e.type === "ENTER_EFFECTS_REPEATED")).toBe(false);
    state = passAll(ok(poseRideau));

    const posePulcinella = dispatch(state, { type: "playCard", playerId: "p1", instanceId: pulcinella.instanceId });
    expect(eventsOf(posePulcinella).filter((e) => e.type === "ENTER_EFFECTS_REPEATED")).toHaveLength(1);
  });

  it("une arrivée REJOUÉE ne consomme ni Le Rideau ni Le Régisseur des Profondeurs", () => {
    const rideau = instance("le-rideau-se-leve", "p1", { turnsRemaining: 2 });
    const regisseur = instance("le-regisseur-des-profondeurs-abyssal", "p1");
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [rideau, regisseur, pulcinella] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const rejouee: GameEvent = {
      type: "ENTER_EFFECTS_REPEATED",
      turnNumber: 1,
      timestamp: 0,
      playerId: "p1",
      instanceId: pulcinella.instanceId,
      cardId: "pulcinella-gonfle",
    };
    const result = processSummonEnterTriggers(state, [rejouee], 1);
    // Avant : chacun « répétait » à son tour l'arrivée rejouée et brûlait son
    // usage du tour.
    expect(result.events.some((e) => e.type === "ENTER_EFFECTS_REPEATED")).toBe(false);
    expect(unit(result.state, rideau.instanceId)!.oncePerTurnFlags ?? {}).toEqual({});
    expect(unit(result.state, regisseur.instanceId)!.oncePerTurnFlags ?? {}).toEqual({});
  });

  it("une carte INVOQUÉE n'est pas « jouée » pour Le Rideau, mais arrive bien pour le Régisseur des Profondeurs", () => {
    const rideau = instance("le-rideau-se-leve", "p1", { turnsRemaining: 2 });
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [rideau, pulcinella] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const invocation = { trigger: "onEnterPlay" as const, playerId: "p1", cardId: "pulcinella-gonfle", sourceInstanceId: pulcinella.instanceId, fromSummon: true };
    expect(processTrigger(state, invocation, 1).events.some((e) => e.type === "ENTER_EFFECTS_REPEATED")).toBe(false);

    const regisseur = instance("le-regisseur-des-profondeurs-abyssal", "p1");
    const avecRegisseur = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [regisseur, pulcinella] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    expect(processTrigger(avecRegisseur, invocation, 1).events.some((e) => e.type === "ENTER_EFFECTS_REPEATED")).toBe(true);
  });

  it("une arrivée REJOUÉE ne réveille pas un piège adverse « une unité adverse arrive » (La Nasse Trop Pleine)", () => {
    const marionnettes = ["pulcinella-gonfle", "arlequin-raccommodeur", "marin-des-jetees", "marin-des-jetees"].map((id) => instance(id, "p1"));
    const nasse = instance("la-nasse-trop-pleine", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      turnNumber: 1,
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: marionnettes }), testPlayer("p2", { shipId: "le-goliath", board: [nasse] })],
    });
    const arrivee = { trigger: "onEnterPlay" as const, playerId: "p1", cardId: "pulcinella-gonfle", sourceInstanceId: marionnettes[0]!.instanceId };
    const degats = (r: { events: GameEvent[] }) => r.events.filter((e) => e.type === "DAMAGE").length;
    // Rejouée (Colombina) : l'unité était déjà là, la Nasse ne bouge pas.
    expect(degats(processTrigger(state, { ...arrivee, repeatedArrival: true }, 1))).toBe(0);
    // Une vraie arrivée, elle, la déclenche.
    expect(degats(processTrigger(state, arrivee, 1))).toBeGreaterThan(0);
  });

  it("la fenêtre de réaction distingue pose, invocation et arrivée rejouée", () => {
    const state = testGameState({ turnNumber: 1 });
    const base = { turnNumber: 1, timestamp: 0, playerId: "p1", instanceId: "x", cardId: "pulcinella-gonfle" };
    const [pose, invoque, rejoue] = deriveReactionTriggerEvents(state, [
      { ...base, type: "SUMMON", played: true },
      { ...base, type: "SUMMON" },
      { ...base, type: "ENTER_EFFECTS_REPEATED" },
    ]);
    expect(pose).not.toHaveProperty("fromSummon");
    expect(pose).not.toHaveProperty("repeatedArrival");
    expect(invoque).toMatchObject({ fromSummon: true });
    expect(rejoue).toMatchObject({ repeatedArrival: true });
  });
});

describe("Pied marin des invocations (Fesses en Avant !, Le Grand Saut)", () => {
  it("les Péons peuvent attaquer ET portent le mot-clé jusqu'à la fin du tour", () => {
    const fesses = instance("fesses-en-avant", "p1");
    let state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { hand: [fesses], deck: filler("p1") }), testPlayer("p2", { shipId: "le-goliath", deck: filler("p2") })],
    });
    state = passAll(ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: fesses.instanceId })));
    const peons = p(state, "p1").board.filter((u) => u.cardId === "peon-cra-poiscail");
    expect(peons).toHaveLength(2);
    const contexte = (s: GameState) => ({ tideState: s.environment.tideState, controllerBoard: p(s, "p1").board, controllerReason: p(s, "p1").reason });
    for (const peon of peons) {
      expect(peon.summoningSick).toBe(false);
      expect(hasKeywordInContext(peon, "pied-marin", contexte(state))).toBe(true);
    }
    state = endTurn(state, "p1");
    const apres = p(state, "p1").board.find((u) => u.cardId === "peon-cra-poiscail")!;
    expect(hasKeywordInContext(apres, "pied-marin", contexte(state))).toBe(false);
  });
});

describe("Roi Cra-Poiscail", () => {
  it("invoque 2 Péons s'il y a déjà 2 autres unités Cra-Poiscail, et donne +1 Puissance aux autres", () => {
    const roi = instance("roi-cra-poiscail", "p1");
    const a = instance("ptite-fesse", "p1");
    const b = instance("ptite-fesse", "p1");
    const state = ok(
      dispatch(
        testGameState({ turnNumber: 1, players: [testPlayer("p1", { hand: [roi], board: [a, b] }), testPlayer("p2", { shipId: "le-goliath" })] }),
        { type: "playCard", playerId: "p1", instanceId: roi.instanceId }
      )
    );
    const board = p(state, "p1").board;
    expect(board.filter((u) => u.cardId === "peon-cra-poiscail")).toHaveLength(2);
    const ctx = { controllerBoard: board, controllerReason: p(state, "p1").reason };
    const base = computeEffectiveStats(instance("ptite-fesse", "p1"), state.environment.tideState).attack;
    expect(computeEffectiveStats(unit(state, a.instanceId)!, state.environment.tideState, ctx).attack).toBe(base + 1);
    // Le Roi ne se donne pas son propre bonus.
    const roiDef = CARD_DATABASE.get("roi-cra-poiscail")!;
    expect(computeEffectiveStats(unit(state, roi.instanceId)!, state.environment.tideState, ctx).attack).toBe(roiDef.attack);
  });

  it("n'invoque rien avec une seule autre unité Cra-Poiscail", () => {
    const roi = instance("roi-cra-poiscail", "p1");
    const state = ok(
      dispatch(
        testGameState({
          turnNumber: 1,
          players: [testPlayer("p1", { hand: [roi], board: [instance("ptite-fesse", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
        }),
        { type: "playCard", playerId: "p1", instanceId: roi.instanceId }
      )
    );
    expect(p(state, "p1").board.some((u) => u.cardId === "peon-cra-poiscail")).toBe(false);
  });
});

describe("Cache-Cache — « la première fois PENDANT VOTRE TOUR »", () => {
  const MEULEUR = {
    id: "test-meuleur-adverse",
    name: "Meuleur d'essai",
    type: "objet",
    cost: 1,
    text: "À son arrivée, placez les 2 premières cartes de la pioche adverse dans son Cimetière.",
    onPlayEffects: [{ type: "mill", target: { kind: "opponentPlayer" }, amount: { kind: "flat", value: 2 } }],
  } as unknown as CardDefinition;

  it("ne grandit pas quand ses cartes rejoignent le Cimetière pendant le tour adverse", () => {
    const table = CARD_DATABASE as Map<string, CardDefinition>;
    table.set(MEULEUR.id, MEULEUR);
    try {
      const cacheCache = instance("cache-cache", "p1");
      const meuleur = instance(MEULEUR.id, "p2");
      const state = testGameState({
        turnNumber: 1,
        activePlayerId: "p2",
        priorityPlayerId: "p2",
        players: [
          testPlayer("p1", { board: [cacheCache], deck: filler("p1") }),
          testPlayer("p2", { shipId: "le-goliath", hand: [meuleur] }),
        ],
      });
      const after = passAll(ok(dispatch(state, { type: "playCard", playerId: "p2", instanceId: meuleur.instanceId })));
      expect(p(after, "p1").graveyard).toHaveLength(2);
      expect(unit(after, cacheCache.instanceId)!.modifiers).toEqual([]);
    } finally {
      table.delete(MEULEUR.id);
    }
  });
});

describe("Le Goûter — la carte source ne remplit pas sa propre condition", () => {
  it("brisé avec une défausse NON Un Dead, il ne pioche qu'une carte", () => {
    const gouter = instance("le-gouter", "p1");
    const crabe = instance("crabe-de-fer", "p1");
    let state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [gouter], hand: [crabe], deck: filler("p1") }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: gouter.instanceId }));
    state = ok(answerHandDiscard(state, [crabe.instanceId]));
    // Avant : Le Goûter (Un Dead) venait d'entrer au Cimetière et
    // déclenchait la pioche bonus — la main finissait à 2.
    expect(p(state, "p1").hand).toHaveLength(1);
  });
});

describe("On rentre bientôt — défaussez PUIS piochez", () => {
  it("la défausse se choisit AVANT de voir la carte piochée, puis +1 Résistance", () => {
    const orb = instance("on-rentre-bientot", "p1");
    const crabe = instance("crabe-de-fer", "p1");
    const murene = instance("murene-aveugle", "p1");
    let state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { hand: [orb, crabe], deck: [murene, ...filler("p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: orb.instanceId }));
    state = ok(activateReactionFor(state, "on-rentre-bientot"));
    // La question de défausse arrive main inchangée : la carte de la pioche
    // n'y est pas encore.
    expect(state.pendingChoice?.kind).toBe("handDiscard");
    expect(p(state, "p1").hand.map((c) => c.instanceId)).toEqual([crabe.instanceId]);
    state = ok(answerHandDiscard(state, [crabe.instanceId]));
    expect(p(state, "p1").hand.map((c) => c.instanceId)).toEqual([murene.instanceId]);
    expect(sum(unit(state, orb.instanceId), "health")).toBe(1);
  });

  it("main vide : rien à défausser, la capacité n'est pas proposée", () => {
    const orb = instance("on-rentre-bientot", "p1");
    const state = ok(
      dispatch(
        testGameState({ turnNumber: 1, players: [testPlayer("p1", { hand: [orb], deck: filler("p1") }), testPlayer("p2", { shipId: "le-goliath" })] }),
        { type: "playCard", playerId: "p1", instanceId: orb.instanceId }
      )
    );
    expect(pendingCandidates(state).some((c) => c.cardId === "on-rentre-bientot")).toBe(false);
  });
});

describe("Tu viens jouer ? — la réduction porte sur la carte repêchée", () => {
  it("seule l'unité repêchée coûte 1 de moins, pas une autre unité Un Dead de la main", () => {
    const tvj = instance("tu-viens-jouer", "p1");
    const papa = instance("papa-est-en-mer", "p1");
    const autre = instance("encore-cinq-minutes", "p1");
    const gros = instance("on-avait-dit-tous-ensemble", "p1");
    let state = testGameState({
      turnNumber: 1,
      players: [
        testPlayer("p1", {
          hand: [tvj, autre, gros],
          graveyard: [papa],
          reason: 30,
          reasonMax: 30,
          graveyardArrivals: [{ cardId: "ptit-bout", turnNumber: 1, fromZone: "board", destructionCause: "combat" }],
        }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    state = passAll(ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: tvj.instanceId, chosenGraveyardInstanceId: papa.instanceId })));

    // Avant : On avait dit tous ensemble (coût 5) passait à 4, et Encore
    // cinq minutes pouvait voler la réduction.
    let before = p(state, "p1").reason;
    state = passAll(ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: gros.instanceId })));
    expect(p(state, "p1").reason).toBe(before - 5);
    before = p(state, "p1").reason;
    state = passAll(ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: autre.instanceId })));
    expect(p(state, "p1").reason).toBe(before - 2);
    before = p(state, "p1").reason;
    state = passAll(ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: papa.instanceId })));
    expect(p(state, "p1").reason).toBe(before - 1);
  });
});

describe("Bonne nuit", () => {
  it("remet une unité Un Dead de coût 2 ou moins en main, puis fait perdre 1 Raison", () => {
    const bonneNuit = instance("bonne-nuit", "p1");
    const papa = instance("papa-est-en-mer", "p1");
    const gros = instance("on-avait-dit-tous-ensemble", "p1");
    const state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [bonneNuit], graveyard: [papa, gros] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    expect(
      dispatch(state, { type: "breakObject", playerId: "p1", instanceId: bonneNuit.instanceId, chosenGraveyardInstanceId: gros.instanceId }).ok
    ).toBe(false);
    const after = ok(
      dispatch(state, { type: "breakObject", playerId: "p1", instanceId: bonneNuit.instanceId, chosenGraveyardInstanceId: papa.instanceId })
    );
    expect(p(after, "p1").hand.map((c) => c.instanceId)).toEqual([papa.instanceId]);
    expect(p(after, "p1").reason).toBe(p(state, "p1").reason - 1);
  });
});

describe("morts d'unités Un Dead : Tout le monde à table, Doudou", () => {
  function detruire(state: GameState, ids: string[]): GameState {
    return {
      ...state,
      players: state.players.map((x) => ({
        ...x,
        board: x.board.map((u) => (ids.includes(u.instanceId) ? { ...u, pendingRemoval: "destroyed" as const } : u)),
      })) as [PlayerState, PlayerState],
    };
  }

  it("Tout le monde à table : deux unités détruites ne donnent qu'une pioche et une défausse", () => {
    const table = instance("tout-le-monde-a-table", "p1", { turnsRemaining: 4 });
    const a = instance("ptit-bout", "p1");
    const b = instance("cache-cache", "p1");
    let state = testGameState({
      turnNumber: 1,
      // Une carte en main : la défausse ne peut pas viser la carte piochée.
      players: [testPlayer("p1", { board: [table, a, b], hand: [instance("crabe-de-fer", "p1")], deck: filler("p1") }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(detruire(state, [a.instanceId, b.instanceId]), { type: "advancePhase", playerId: "p1" }));
    expect(p(state, "p1").hand).toHaveLength(2);
    expect(state.pendingChoice?.kind).toBe("handDiscard");
    state = passAll(ok(answerHandDiscard(state)));
    expect(p(state, "p1").hand).toHaveLength(1);
    expect(p(state, "p1").deck).toHaveLength(3);
  });

  it("Doudou : quand l'unité équipée est détruite, piochez 1 carte puis défaussez 1 carte", () => {
    const porteur = instance("ptit-bout", "p1");
    const doudou = instance("doudou", "p1", { attachedToInstanceId: porteur.instanceId });
    let state = testGameState({
      turnNumber: 1,
      players: [testPlayer("p1", { board: [porteur, doudou], hand: [instance("crabe-de-fer", "p1")], deck: filler("p1") }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(detruire(state, [porteur.instanceId]), { type: "advancePhase", playerId: "p1" }));
    expect(p(state, "p1").hand).toHaveLength(2);
    expect(state.pendingChoice?.kind).toBe("handDiscard");
    state = ok(answerHandDiscard(state));
    expect(p(state, "p1").hand).toHaveLength(1);
  });
});
