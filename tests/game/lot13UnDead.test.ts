import { describe, expect, it } from "vitest";
import { CORE_SET, UN_DEAD, VEILLEE_DES_DISPARUS, getCardDefinition } from "@/game/cards/sets/core";
import { dispatch } from "@/game/engine";
import { hasGraveyardArrival } from "@/game/effects/resolveEffect";
import { answerHandDiscard, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Lot 13 — Un Dead / La Veillée des Disparus.
 *
 * Le lot repose entièrement sur des primitives neuves : « quand cette carte
 * est défaussée », « une carte rejoint votre Cimetière depuis votre main »,
 * « une carte a rejoint votre Cimetière ce tour », « vous récupérez une
 * carte depuis votre Cimetière ». Ces tests les jouent par `dispatch`, avec
 * les cartes qui s'en servent, et vérifient l'effet OBSERVABLE.
 */

const LOT_13 = CORE_SET.filter((def) => def.setCode === VEILLEE_DES_DISPARUS);

function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  if (!result.ok) throw new Error("ok" in result && !result.ok ? String((result as { error?: string }).error) : "échec");
}

describe("catalogue du Lot 13", () => {
  it("apporte les 17 cartes STANDARD et la variante Abyssale de la page du lot", () => {
    expect(LOT_13).toHaveLength(18);
    expect(LOT_13.filter((def) => def.id.endsWith("-abyssal"))).toHaveLength(1);
  });

  it("marque la famille d'un SOUS-TYPE, jamais d'un archétype", () => {
    // Un archétype ferait compter les Un Dead dans les seuils Cra-Poiscail
    // (`countArchetypeUnits`), ce qui n'a aucun sens.
    for (const def of LOT_13) {
      expect(def.archetype).toBeUndefined();
      expect(def.subtype).toBe(UN_DEAD);
    }
  });

  it("garde une Abyssale adossée à sa STANDARD, comme la règle du lot l'exige", () => {
    // « Une carte ABYSSALE n'existe jamais seule. »
    const abyssale = getCardDefinition("maman-revient-abyssal");
    const standard = getCardDefinition("maman-revient");
    expect(abyssale.name).toBe(standard.name);
    expect(abyssale.maxCopies).toBe(1);
  });
});

describe("Lot 13 — la défausse comme moteur", () => {
  /**
   * Pose Mousse des Quarts (« piochez 1 carte puis défaussez 1 carte ») pour
   * provoquer une défausse, avec `observateurs` déjà en jeu.
   */
  function defausseProvoquee(observateurs: ReturnType<typeof instance>[], aDefausser: ReturnType<typeof instance>) {
    const mousse = instance("mousse-des-quarts", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", {
          hand: [mousse, aDefausser],
          deck: [instance("crabe-de-fer", "p1")],
          board: observateurs,
          reason: 10,
        }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });
    const joue = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
    ok(joue);
    return { state: joue.state, aDefausser };
  }

  it("P'tit Bout rend 1 Raison en étant défaussé", () => {
    const ptitBout = instance("ptit-bout", "p1");
    const { state } = defausseProvoquee([], ptitBout);
    const avant = state.players.find((p) => p.id === "p1")!.reason;

    const apres = answerHandDiscard(state, [ptitBout.instanceId]);
    ok(apres);
    expect(apres.state.players.find((p) => p.id === "p1")!.reason).toBe(avant + 1);
  });

  it("Cache-Cache gagne +1 Puissance quand une carte part de la main au Cimetière", () => {
    const cacheCache = instance("cache-cache", "p1");
    const { state, aDefausser } = defausseProvoquee([cacheCache], instance("marin-des-jetees", "p1"));

    const apres = answerHandDiscard(state, [aDefausser.instanceId]);
    ok(apres);
    const enJeu = apres.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === cacheCache.instanceId)!;
    expect(enJeu.modifiers.reduce((sum, m) => sum + m.attack, 0)).toBe(1);
  });

  it("La Marelle cogne le Navire adverse à la première défausse du tour", () => {
    const marelle = instance("la-marelle", "p1");
    const { state, aDefausser } = defausseProvoquee([marelle], instance("marin-des-jetees", "p1"));
    const avant = state.players.find((p) => p.id === "p2")!.anchor;

    const apres = answerHandDiscard(state, [aDefausser.instanceId]);
    ok(apres);
    expect(apres.state.players.find((p) => p.id === "p2")!.anchor).toBe(avant - 1);
  });

  it("On avait dit tous ensemble ne cogne qu'UNE fois par tour, défausse ou mort confondues", () => {
    const def = getCardDefinition("on-avait-dit-tous-ensemble");
    // Deux déclencheurs, une seule clé : `oncePerTurnFlags` est porté par la
    // carte, donc la clé partagée donne « une fois par tour » au total.
    const cles = new Set((def.abilities ?? []).map((a) => a.oncePerTurnKey));
    expect(cles.size).toBe(1);
    expect((def.abilities ?? []).map((a) => a.trigger).sort()).toEqual(["onCardDiscardedFromHand", "onDeath"]);
  });
});

describe("Lot 13 — le Cimetière comme ressource", () => {
  it("Le Goûter pioche une carte de plus si un Un Dead a rejoint le Cimetière ce tour", () => {
    // La défausse du Goûter lui-même remplit la condition quand c'est un
    // Un Dead qui part : c'est tout l'intérêt du texte, et la raison pour
    // laquelle la condition vit sur l'EFFET et non sur la carte.
    const gouter = instance("le-gouter", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", {
          board: [gouter],
          hand: [ptitBout],
          deck: [instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1")],
          reason: 10,
        }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });

    const brise = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: gouter.instanceId });
    ok(brise);
    const apres = answerHandDiscard(brise.state, [ptitBout.instanceId]);
    ok(apres);

    // 1 pioche + 1 défausse (P'tit Bout) + 1 pioche bonus : la main part de
    // 1 carte et finit à 2.
    expect(apres.state.players.find((p) => p.id === "p1")!.hand).toHaveLength(2);
  });

  it("La Petite Chanson repêche un Un Dead de coût 1, et Maman revient cogne au passage", () => {
    const chanson = instance("la-petite-chanson", "p1");
    const maman = instance("maman-revient", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [chanson, maman], graveyard: [ptitBout], deck: [instance("crabe-de-fer", "p1")], reason: 10 }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });
    const ancrageAvant = state.players.find((p) => p.id === "p2")!.anchor;

    const brise = dispatch(state, {
      type: "breakObject",
      playerId: "p1",
      instanceId: chanson.instanceId,
      chosenGraveyardInstanceId: ptitBout.instanceId,
    });
    ok(brise);

    const p1 = brise.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.map((c) => c.instanceId)).toContain(ptitBout.instanceId);
    expect(p1.graveyard.map((c) => c.instanceId)).not.toContain(ptitBout.instanceId);
    // « La première fois à chaque tour que vous récupérez une carte… »
    expect(brise.state.players.find((p) => p.id === "p2")!.anchor).toBe(ancrageAvant - 1);
  });

  it("Promis, j'attends lit la fenêtre « depuis votre dernier tour », pas seulement le tour courant", () => {
    const def = getCardDefinition("promis-jattends");
    const condition = (def.abilities ?? [])[0]?.condition?.graveyardArrival;
    expect(condition).toMatchObject({ subtype: UN_DEAD, since: "lastOwnTurn" });

    // La fenêtre elle-même : au tour 6, « depuis votre dernier tour » voit le
    // tour adverse (5) en plus du tour courant, « ce tour » non.
    const state = testGameState({
      turnNumber: 6,
      players: [
        testPlayer("p1", { graveyardArrivals: [{ cardId: "ptit-bout", turnNumber: 5, fromZone: "hand" }] }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });
    expect(hasGraveyardArrival(state, "p1", { subtype: UN_DEAD, since: "lastOwnTurn" })).toBe(true);
    expect(hasGraveyardArrival(state, "p1", { subtype: UN_DEAD, since: "thisTurn" })).toBe(false);
    // Et le sous-type filtre bien : une carte hors famille ne compte pas.
    expect(hasGraveyardArrival(state, "p1", { subtype: "volatile", since: "lastOwnTurn" })).toBe(false);
  });
});

describe("Lot 13 — l'attrition", () => {
  it("Le Copain du dessous cogne le Navire adverse en mourant", () => {
    const copain = instance("le-copain-du-dessous", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [copain], reason: 10 }), testPlayer("p2", { shipId: "lerrant" })],
    });
    const avant = state.players.find((p) => p.id === "p2")!.anchor;

    // Le Sabordage est la voie la plus courte jusqu'à une mort, sans passer
    // par le combat — et il déclenche `onDeath` comme n'importe quelle
    // destruction.
    const saborde = dispatch(state, { type: "saborder", playerId: "p1", instanceId: copain.instanceId });
    ok(saborde);
    expect(saborde.state.players.find((p) => p.id === "p2")!.anchor).toBe(avant - 1);
  });

  it("Encore cinq minutes se sauve une fois par tour, quelle que soit la Marée", () => {
    const def = getCardDefinition("encore-cinq-minutes");
    // `tideStateIn` absent : la Revenante de la Fosse ne survit qu'en
    // Abysses, celle-ci survit partout.
    expect(def.survivesLethalOncePerTurn).toBeDefined();
    expect(def.survivesLethalOncePerTurn?.tideStateIn).toBeUndefined();
  });

  it("Doudou ne s'équipe qu'à un Un Dead", () => {
    const def = getCardDefinition("doudou");
    expect(def.type).toBe("equipement");
    expect(def.equipTargetSubtype).toBe(UN_DEAD);
    expect((def.abilities ?? [])[0]?.triggeredBy?.equippedUnit).toBe(true);
  });
});

describe("Lot 13 — choisir une carte du Cimetière ailleurs que sur un Bris", () => {
  it("Tu viens jouer ? repêche à SON ARRIVÉE la carte que le joueur désigne", () => {
    const tuViensJouer = instance("tu-viens-jouer", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    // Hors filtre : coût 5, et pas dans le Cimetière du bon profil.
    const trop = instance("on-avait-dit-tous-ensemble", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [tuViensJouer], graveyard: [ptitBout, trop], reason: 10 }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });

    // Sans désignation, la pose est refusée : il y avait une carte éligible,
    // et le moteur ne choisit pas à la place du joueur.
    const sansChoix = dispatch(state, { type: "playCard", playerId: "p1", instanceId: tuViensJouer.instanceId });
    expect(sansChoix.ok).toBe(false);

    // Une carte hors filtre est refusée elle aussi.
    const horsFiltre = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: tuViensJouer.instanceId,
      chosenGraveyardInstanceId: trop.instanceId,
    });
    expect(horsFiltre.ok).toBe(false);

    const joue = dispatch(state, {
      type: "playCard",
      playerId: "p1",
      instanceId: tuViensJouer.instanceId,
      chosenGraveyardInstanceId: ptitBout.instanceId,
    });
    ok(joue);
    const p1 = joue.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.map((c) => c.instanceId)).toContain(ptitBout.instanceId);
    expect(p1.graveyard.map((c) => c.instanceId)).not.toContain(ptitBout.instanceId);
  });

  it("Tu viens jouer ? ne réduit le coût que si un Un Dead a été DÉTRUIT ce tour", () => {
    function pose(arrivals: { cardId: string; turnNumber: number; fromZone: "hand" | "board" | "deck" }[]) {
      const tuViensJouer = instance("tu-viens-jouer", "p1");
      const ptitBout = instance("ptit-bout", "p1");
      const state = testGameState({
        players: [
          testPlayer("p1", { hand: [tuViensJouer], graveyard: [ptitBout], graveyardArrivals: arrivals, reason: 10 }),
          testPlayer("p2", { shipId: "lerrant" }),
        ],
      });
      const joue = dispatch(state, {
        type: "playCard",
        playerId: "p1",
        instanceId: tuViensJouer.instanceId,
        chosenGraveyardInstanceId: ptitBout.instanceId,
      });
      ok(joue);
      return joue.state.players.find((p) => p.id === "p1")!.costDiscounts ?? [];
    }

    // Défaussé ce tour : ce n'est pas « détruite », le texte ne paie pas.
    expect(pose([{ cardId: "ptit-bout", turnNumber: 1, fromZone: "hand" }])).toHaveLength(0);
    // Détruit ce tour : la réduction est posée.
    expect(pose([{ cardId: "ptit-bout", turnNumber: 1, fromZone: "board" }])).toHaveLength(1);
  });

  it("une destruction s'inscrit au journal des arrivées, comme une défausse", () => {
    // Sans ça, « une carte Un Dead a rejoint votre Cimetière ce tour » ne
    // verrait que les défausses, et un Un Dead tué ne compterait pas.
    const copain = instance("le-copain-du-dessous", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [copain], reason: 10 }), testPlayer("p2", { shipId: "lerrant" })],
    });
    const saborde = dispatch(state, { type: "saborder", playerId: "p1", instanceId: copain.instanceId });
    ok(saborde);
    const arrivals = saborde.state.players.find((p) => p.id === "p1")!.graveyardArrivals ?? [];
    expect(arrivals).toContainEqual({ cardId: "le-copain-du-dessous", turnNumber: 1, fromZone: "board" });
  });

  it("Tu m'avais promis se propose en réaction, et attend une carte du Cimetière", () => {
    const def = getCardDefinition("tu-mavais-promis");
    const ability = (def.abilities ?? [])[0]!;
    // « vous pouvez » → fenêtre de réaction ; la désignation du Cimetière
    // vient après, et `needsGraveyardTarget` la réclame.
    expect(ability.mode).toBe("optional");
    expect(ability.effects[0]?.type).toBe("moveGraveyardCardToHand");
    expect(ability.effects[0]?.filter).toMatchObject({ subtype: UN_DEAD, maxCost: 1 });
  });
});
