import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS, tutorialProgress } from "@/game/tutorial/steps";
import { BORROWED_DECKS } from "@/game";
import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES } from "@/game/cards/types";
import { COACH_GAP, placeCoach } from "@/features/tutorial/coachPlacement";
import { TUTORIAL_OPENING_TYPES } from "@/game/tutorial/steps";
import { createGameState } from "@/game/state/createGameState";
import { RULES } from "@/game/rules/constants";
import { instance, testGameState, testPlayer } from "./testHelpers";

const base = { turnNumber: 1, timestamp: 0 };

function stateAfterPlaying(cardIds: string[]) {
  const state = testGameState();
  return {
    ...state,
    eventLog: cardIds.map((cardId, index) => ({
      ...base,
      type: "PLAY_CARD" as const,
      playerId: "p1",
      instanceId: `i${index}`,
      cardId,
    })),
  };
}

describe("étapes du tutoriel", () => {
  it("donne une ancre à chaque étape — le guide doit savoir où se poser", () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.anchor, `étape « ${step.id} » sans ancre`).toBeTruthy();
    }
  });

  it("valide « un corps sur le pont » avec un Marin comme avec une Créature", () => {
    // LE bug remonté : le deck d'emprunt compte plus de Marins que de
    // Créatures, et une main d'ouverture sans Créature bloquait l'étape
    // pendant que le joueur posait carte sur carte.
    const withMarin = tutorialProgress(stateAfterPlaying(["marin-des-jetees"]), "p1");
    expect(withMarin.index).toBeGreaterThan(0);

    const withCreature = tutorialProgress(stateAfterPlaying(["murene-aveugle"]), "p1");
    expect(withCreature.index).toBeGreaterThan(0);
  });

  it("ne valide pas la première étape sur une carte qui n'est pas une unité", () => {
    // Un Équipement ou une Structure ne met aucun corps sur le pont.
    const progress = tutorialProgress(stateAfterPlaying(["treuil-rouille"]), "p1");
    expect(progress.index).toBe(0);
  });

  it("reste franchissable avec le deck réellement distribué au joueur", () => {
    // Garde-fou contre la classe de bug remontée : une étape dont l'objectif
    // n'existe pas dans le deck du tutoriel est un cul-de-sac.
    const deck = BORROWED_DECKS[1] ?? BORROWED_DECKS[0]!;
    const types = new Set(deck.cardIds.map((id) => getCardDefinition(id).type));
    expect([...UNIT_CARD_TYPES].some((type) => types.has(type)), "aucune unité dans le deck").toBe(true);
    expect(types.has("objet"), "aucun Objet : deux étapes deviennent infranchissables").toBe(true);
  });

  it("n'avance jamais à reculons, même si le joueur perd ce qu'il a posé", () => {
    const played = stateAfterPlaying(["marin-des-jetees", "murene-aveugle"]);
    const advanced = tutorialProgress(played, "p1");
    // Plateau vidé, mais le journal garde la trace : l'étape reste acquise.
    const wiped = { ...played, players: [testPlayer("p1"), testPlayer("p2")] as typeof played.players };
    expect(tutorialProgress(wiped, "p1", advanced.index).index).toBeGreaterThanOrEqual(advanced.index);
  });
});

describe("main d'ouverture garantie", () => {
  const decks = (() => {
    const player = BORROWED_DECKS[1] ?? BORROWED_DECKS[0]!;
    return { player, opponent: BORROWED_DECKS.find((d) => d.id !== player.id) ?? player };
  })();

  function openingTypes(seed: number): string[] {
    const state = createGameState({
      gameId: `t${seed}`,
      player1: { id: "p1", deck: decks.player },
      player2: { id: "p2", deck: decks.opponent },
      seed,
      guaranteedOpeningTypes: TUTORIAL_OPENING_TYPES,
    });
    return state.players[0].hand.map((card) => getCardDefinition(card.cardId).type);
  }

  it("contient toujours une unité et DEUX Objets, quelle que soit la graine", () => {
    // Deux Objets et non un : l'étape 4 en pose un, l'étape 5 en brise un
    // autre depuis la main. C'est la garantie qui empêche le joueur de se
    // condamner tout seul.
    for (let seed = 1; seed <= 40; seed++) {
      const types = openingTypes(seed);
      expect(types.filter((t) => (UNIT_CARD_TYPES as readonly string[]).includes(t)).length, `graine ${seed}`).toBeGreaterThanOrEqual(1);
      expect(types.filter((t) => t === "objet").length, `graine ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("garde une main de la bonne taille et ne duplique aucun exemplaire", () => {
    const state = createGameState({
      gameId: "t",
      player1: { id: "p1", deck: decks.player },
      player2: { id: "p2", deck: decks.opponent },
      seed: 7,
      guaranteedOpeningTypes: TUTORIAL_OPENING_TYPES,
    });
    const hand = state.players[0].hand;
    expect(hand).toHaveLength(RULES.STARTING_HAND_SIZE);
    // La main sort du deck : rien n'est inventé, rien n'est en double.
    expect(hand.length + state.players[0].deck.length).toBe(decks.player.cardIds.length);
    const ids = [...hand, ...state.players[0].deck].map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ne trafique pas la main quand aucun type n'est garanti", () => {
    const plain = createGameState({
      gameId: "t",
      player1: { id: "p1", deck: decks.player },
      player2: { id: "p2", deck: decks.opponent },
      seed: 99,
    });
    expect(plain.players[0].hand).toHaveLength(RULES.STARTING_HAND_SIZE);
  });
});

describe("cartes autorisées par étape", () => {
  function handOf(cardIds: string[]) {
    const state = testGameState();
    return {
      ...state,
      players: [
        testPlayer("p1", { hand: cardIds.map((id) => instance(id, "p1")) }),
        testPlayer("p2"),
      ] as typeof state.players,
    };
  }

  it("n'autorise que les unités à la première étape", () => {
    const state = handOf(["marin-des-jetees", "murene-aveugle", "treuil-rouille", "thermos-du-dernier-quart"]);
    const eligible = TUTORIAL_STEPS[0]!.eligibleHandCards!(state, "p1");
    const types = eligible.map((id) => getCardDefinition(state.players[0].hand.find((c) => c.instanceId === id)!.cardId).type);
    expect(types.sort()).toEqual(["creature", "marin"]);
  });

  it("écarte les Objets de la deuxième étape — les étapes 4 et 5 en ont besoin", () => {
    const state = handOf(["marin-des-jetees", "thermos-du-dernier-quart"]);
    const eligible = TUTORIAL_STEPS[1]!.eligibleHandCards!(state, "p1");
    expect(eligible).toHaveLength(1);
    expect(state.players[0].hand.find((c) => c.instanceId === eligible[0])!.cardId).toBe("marin-des-jetees");
  });

  it("laisse le plateau libre aux étapes qui ne demandent pas de poser une carte", () => {
    // Attaquer, observer la Marée, finir la partie : rien à restreindre.
    for (const id of ["attack", "tide", "finish"]) {
      const step = TUTORIAL_STEPS.find((s) => s.id === id)!;
      expect(step.eligibleHandCards, `étape « ${id} »`).toBeUndefined();
    }
  });
});

describe("placement de la fiche du guide", () => {
  const viewport = { width: 1600, height: 900 };
  const panel = { width: 300, height: 220 };

  it("se pose À CÔTÉ de la main plutôt qu'au-dessus — sinon elle masque où déposer", () => {
    // Cas réel : la main commence après le Navire, il reste de la place à
    // sa gauche. Au-dessus, la fiche couvrait les emplacements du plateau.
    const hand = { left: 430, top: 760, width: 1150, height: 134 };
    const placed = placeCoach(hand, panel, viewport);
    expect(placed.side).toBe("left");
    expect(placed.left + panel.width).toBeLessThanOrEqual(hand.left);
  });

  it("bascule au-dessus quand la zone large touche les deux bords", () => {
    const fullWidth = { left: 60, top: 400, width: viewport.width - 120, height: 176 };
    const placed = placeCoach(fullWidth, panel, viewport);
    expect(placed.side).toBe("top");
    expect(placed.top + panel.height).toBeLessThanOrEqual(fullWidth.top);
  });

  it("se pose À CÔTÉ d'une zone haute et étroite, comme la colonne de droite", () => {
    const rail = { left: 1480, top: 120, width: 100, height: 700 };
    const placed = placeCoach(rail, panel, viewport);
    expect(placed.side).toBe("left");
    expect(placed.left + panel.width).toBeLessThanOrEqual(rail.left);
  });

  it("ne sort jamais de l'écran, même quand l'ancre colle à un bord", () => {
    for (const anchor of [
      { left: 0, top: 0, width: 80, height: 80 },
      { left: viewport.width - 80, top: viewport.height - 80, width: 80, height: 80 },
      { left: 0, top: viewport.height - 40, width: viewport.width, height: 40 },
    ]) {
      const placed = placeCoach(anchor, panel, viewport);
      expect(placed.left).toBeGreaterThanOrEqual(0);
      expect(placed.top).toBeGreaterThanOrEqual(0);
      expect(placed.left + panel.width).toBeLessThanOrEqual(viewport.width);
      expect(placed.top + panel.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  it("laisse toujours un écart entre la fiche et la zone qu'elle commente", () => {
    const centre = { left: 600, top: 380, width: 400, height: 140 };
    const placed = placeCoach(centre, panel, viewport);
    const gap =
      placed.side === "top"
        ? centre.top - (placed.top + panel.height)
        : placed.side === "bottom"
          ? placed.top - (centre.top + centre.height)
          : placed.side === "left"
            ? centre.left - (placed.left + panel.width)
            : placed.left - (centre.left + centre.width);
    expect(gap).toBeGreaterThanOrEqual(COACH_GAP - 1);
  });

  it("retombe sur le côté le plus dégagé quand aucun ne suffit", () => {
    // Écran minuscule : la fiche ne tient nulle part, elle doit quand même
    // sortir un placement utilisable plutôt que rien.
    const tiny = { width: 360, height: 640 };
    const placed = placeCoach({ left: 20, top: 300, width: 320, height: 120 }, panel, tiny);
    expect(["top", "bottom", "left", "right"]).toContain(placed.side);
    expect(placed.left).toBeGreaterThanOrEqual(0);
  });
});
