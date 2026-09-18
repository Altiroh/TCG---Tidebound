import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { discardFromHand, pruneGraveyardArrivals } from "@/game/state/discard";
import { RULES } from "@/game/rules/constants";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * La VOIE UNIQUE de la défausse (`game/state/discard.ts`).
 *
 * Le Lot 13 fait réagir des cartes à une défausse ; encore faut-il que les
 * trois endroits qui défaussent — un effet, la limite de taille de main, les
 * dégâts de Marée — produisent le même signal. Ils écrivaient chacun leur
 * boucle, et leur `CARD_MOVED` ne portait ni l'identité de la carte ni son
 * propriétaire : un observateur ne pouvait pas savoir CE QUI venait d'être
 * défaussé. Ces tests tiennent ce contrat-là, indépendamment des cartes qui
 * s'en serviront.
 */

const CARD_MOVED_TO_GRAVEYARD = (events: readonly { type: string; fromZone?: string; toZone?: string }[]) =>
  events.filter((e) => e.type === "CARD_MOVED" && e.fromZone === "hand" && e.toZone === "graveyard");

describe("défausse — voie unique", () => {
  it("nomme la carte et son propriétaire sur l'événement, et inscrit l'arrivée au Cimetière", () => {
    // Mousse des Quarts : « À son arrivée, piochez 1 carte puis défaussez
    // 1 carte. » — le plus court chemin jusqu'à une défausse par un effet.
    const mousse = instance("mousse-des-quarts", "p1");
    const enMain = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [mousse, enMain], deck: [instance("crabe-de-fer", "p1")] }),
        testPlayer("p2", { shipId: "lerrant" }),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mousse.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const moved = CARD_MOVED_TO_GRAVEYARD(result.events) as { cardId?: string; ownerId?: string }[];
    expect(moved).toHaveLength(1);
    // Sans ces deux champs, aucun déclencheur de défausse ne peut savoir de
    // quelle carte il s'agit : elle a quitté la main, c'est l'événement qui
    // porte désormais son identité.
    expect(moved[0]!.cardId).toBeDefined();
    expect(moved[0]!.ownerId).toBe("p1");

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.graveyardArrivals).toHaveLength(1);
    expect(p1.graveyardArrivals![0]).toMatchObject({ fromZone: "hand", turnNumber: state.turnNumber });
    expect(p1.graveyard.at(-1)!.graveyardCause).toBe("discarded");
  });

  it("traite la limite de taille de main comme une défausse, pas comme un cas à part", () => {
    const hand = Array.from({ length: RULES.MAX_HAND_SIZE + 2 }, () => instance("marin-des-jetees", "p1"));
    const state = testGameState({
      players: [
        testPlayer("p1", { hand, deck: [instance("crabe-de-fer", "p1"), instance("crabe-de-fer", "p1")] }),
        testPlayer("p2", { shipId: "lerrant", deck: [instance("crabe-de-fer", "p2")] }),
      ],
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const moved = CARD_MOVED_TO_GRAVEYARD(result.events) as { cardId?: string; ownerId?: string }[];
    expect(moved).toHaveLength(2);
    for (const event of moved) {
      expect(event.cardId).toBe("marin-des-jetees");
      expect(event.ownerId).toBe("p1");
    }

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand).toHaveLength(RULES.MAX_HAND_SIZE);
    expect(p1.graveyardArrivals?.every((a) => a.fromZone === "hand")).toBe(true);
  });

  it("défausse ce qu'il y a quand la main est plus courte que demandé", () => {
    const state = testGameState({
      players: [testPlayer("p1", { hand: [instance("marin-des-jetees", "p1")] }), testPlayer("p2", { shipId: "lerrant" })],
    });

    const result = discardFromHand(state, "p1", { count: 3 }, { turnNumber: 1, timestamp: 0 });
    expect(result.discarded).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });

  it("retire des exemplaires DÉSIGNÉS quand on les nomme, pas le début de la main", () => {
    const premier = instance("marin-des-jetees", "p1");
    const vise = instance("crabe-de-fer", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [premier, vise] }), testPlayer("p2", { shipId: "lerrant" })],
    });

    const result = discardFromHand(state, "p1", { instanceIds: [vise.instanceId] }, { turnNumber: 1, timestamp: 0 });
    expect(result.discarded.map((c) => c.instanceId)).toEqual([vise.instanceId]);
    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.map((c) => c.instanceId)).toEqual([premier.instanceId]);
  });

  it("élague le journal des arrivées sans amputer « depuis votre dernier tour »", () => {
    const player = testPlayer("p1", {
      graveyardArrivals: [
        { cardId: "marin-des-jetees", turnNumber: 2, fromZone: "hand" },
        { cardId: "crabe-de-fer", turnNumber: 5, fromZone: "hand" },
        { cardId: "poisson-lanterne", turnNumber: 6, fromZone: "board" },
      ],
    });

    // Au tour 6 qui commence, la fenêtre « depuis votre dernier tour »
    // couvre le tour adverse qui vient de s'écouler : le tour 5 reste.
    const pruned = pruneGraveyardArrivals(player, 6);
    expect(pruned.graveyardArrivals!.map((a) => a.turnNumber)).toEqual([5, 6]);
  });
});
