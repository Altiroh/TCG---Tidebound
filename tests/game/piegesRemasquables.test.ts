/**
 * GRAMMAIRE DES STRUCTURES-PIÈGES — les trois issues après déclenchement
 * (22/09/2026).
 *
 * Le design en prévoit trois : la Structure reste révélée, elle est
 * détruite, ou elle se referme. Les deux premières existaient déjà — le
 * défaut, et un `saborde`/`destroy` sur soi. Ces tests couvrent la
 * troisième, et surtout vérifient qu'elle n'abîme aucune des deux autres ni
 * les états qui existaient : VISIBLE, masquée par la Marée, cachée en
 * réaction, information privée.
 *
 * CARTES DE TEST. Le comportement se déclare sur la CARTE
 * (`TriggeredAbility.afterHiddenReaction`), et aucune carte du catalogue ne
 * l'utilise aujourd'hui — c'est une décision de design, pas de moteur. On
 * enregistre donc deux pièges de test dans le catalogue le temps du
 * fichier, l'un qui se referme et l'autre non, pour comparer deux
 * comportements sur des cartes par ailleurs identiques.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import { dispatch } from "@/game/engine";
import { toPlayerView } from "@/game/state/playerView";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

const PIEGE_QUI_RESTE = "test-piege-qui-reste";
const PIEGE_QUI_SE_REFERME = "test-piege-qui-se-referme";

/**
 * Deux pièges identiques à un champ près. Ils affaiblissent l'attaquant —
 * un effet qui ne retire PAS la carte du plateau, sans quoi il n'y aurait
 * rien à remasquer.
 */
function piegeDeTest(id: string, remasquable: boolean): CardDefinition {
  return {
    id,
    name: id,
    type: "structure",
    cost: 2,
    health: 2,
    durationTurns: 5,
    visibleDuringTide: ["calme"],
    text: "Carte de test.",
    abilities: [
      {
        trigger: "onUnitAttackDeclared",
        mode: "optional",
        hiddenReaction: true,
        oncePerTurnKey: `${id}-tir`,
        condition: { selfHidden: true },
        ...(remasquable ? { afterHiddenReaction: "remasquable" as const } : {}),
        description: "Affaiblit l'unité qui attaque.",
        effects: [{ type: "modifyAttackerPower", target: { kind: "controllerPlayer" }, amount: { kind: "flat", value: 1 } }],
      },
    ],
  };
}

// `CARD_DATABASE` est typé en lecture seule pour le reste du projet ; c'est
// ici le seul point d'entrée possible pour une carte de test, et elle est
// retirée juste après.
const base = CARD_DATABASE as Map<string, CardDefinition>;
beforeAll(() => {
  base.set(PIEGE_QUI_RESTE, piegeDeTest(PIEGE_QUI_RESTE, false));
  base.set(PIEGE_QUI_SE_REFERME, piegeDeTest(PIEGE_QUI_SE_REFERME, true));
});
afterAll(() => {
  base.delete(PIEGE_QUI_RESTE);
  base.delete(PIEGE_QUI_SE_REFERME);
});

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

const board = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.board;

/**
 * p2 possède le piège, masqué (la Marée est en Houle, il n'est visible
 * qu'en Calme) ; p1 a une unité prête à attaquer.
 */
function tableAvecPiege(cardId: string): { state: GameState; attaquant: string; piege: string } {
  const attaquant = instance("marin-des-jetees", "p1", { summoningSick: false });
  const piege = instance(cardId, "p2", { turnsRemaining: 5 });
  return {
    attaquant: attaquant.instanceId,
    piege: piege.instanceId,
    state: testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle" }),
      players: [
        testPlayer("p1", { board: [attaquant] }),
        testPlayer("p2", { shipId: "le-goliath", board: [piege] }),
      ],
    }),
  };
}

/** Déclare l'attaque de p1, ce qui ouvre la fenêtre d'interception de p2. */
function attaquer(state: GameState, attaquant: string) {
  return dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant });
}

/**
 * Remet l'attaquant en état d'attaquer, `nbTours` plus tard. Une unité
 * n'attaque qu'une fois par tour : sans ce réarmement, la seconde attaque
 * serait refusée pour une raison qui n'a rien à voir avec les pièges.
 */
function toursPlusTard(state: GameState, attaquant: string, nbTours: number): GameState {
  return {
    ...state,
    turnNumber: state.turnNumber + nbTours,
    phase: "combatPhase",
    players: state.players.map((p) =>
      p.id === "p1"
        ? { ...p, board: p.board.map((u) => (u.instanceId === attaquant ? { ...u, hasAttackedThisTurn: false } : u)) }
        : p
    ) as GameState["players"],
  };
}

describe("après déclenchement : rester révélée (le défaut, inchangé)", () => {
  it("la révélation est définitive et la Réaction cachée n'est plus proposée", () => {
    const { state, attaquant } = tableAvecPiege(PIEGE_QUI_RESTE);
    const declaree = attaquer(state, attaquant);
    ok(declaree);
    expect(pendingCandidates(declaree.state).some((c) => c.cardId === PIEGE_QUI_RESTE)).toBe(true);

    const tire = activateReactionFor(declaree.state, PIEGE_QUI_RESTE);
    ok(tire);
    expect(board(tire.state, "p2")[0]!.revealed).toBe(true);
    expect(tire.events.some((e) => e.type === "STRUCTURE_REVEALED")).toBe(true);
    expect(tire.events.some((e) => e.type === "STRUCTURE_REHIDDEN")).toBe(false);

    // Une seconde attaque, un tour plus tard : le piège est connu, sa
    // moitié cachée ne se repropose pas.
    const encore = attaquer(toursPlusTard(tire.state, attaquant, 2), attaquant);
    ok(encore);
    expect(pendingCandidates(encore.state).some((c) => c.cardId === PIEGE_QUI_RESTE)).toBe(false);
  });
});

describe("après déclenchement : se refermer (nouveau, déclaré par la carte)", () => {
  it("la révélation retombe une fois les effets résolus, et le journal le dit", () => {
    const { state, attaquant } = tableAvecPiege(PIEGE_QUI_SE_REFERME);
    const declaree = attaquer(state, attaquant);
    ok(declaree);

    const tire = activateReactionFor(declaree.state, PIEGE_QUI_SE_REFERME);
    ok(tire);
    // Le piège est toujours là, et de nouveau secret.
    expect(board(tire.state, "p2")).toHaveLength(1);
    expect(board(tire.state, "p2")[0]!.revealed).toBeUndefined();
    // L'ordre du journal raconte la transition complète : découverte, puis
    // refermeture. L'adversaire a vu la carte — il n'en perd pas le souvenir.
    const types = tire.events.map((e) => e.type);
    expect(types.indexOf("STRUCTURE_REVEALED")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("STRUCTURE_REHIDDEN")).toBeGreaterThan(types.indexOf("STRUCTURE_REVEALED"));
  });

  it("elle peut tirer de nouveau — mais pas deux fois dans le même tour", () => {
    const { state, attaquant } = tableAvecPiege(PIEGE_QUI_SE_REFERME);
    const declaree = attaquer(state, attaquant);
    ok(declaree);
    const premier = activateReactionFor(declaree.state, PIEGE_QUI_SE_REFERME);
    ok(premier);

    // MÊME tour : `oncePerTurnKey` tient, sans quoi le piège rouvrirait une
    // fenêtre à chaque attaque — le défaut des 43 fenêtres par partie.
    const memeTour = attaquer(toursPlusTard(premier.state, attaquant, 0), attaquant);
    ok(memeTour);
    expect(pendingCandidates(memeTour.state).some((c) => c.cardId === PIEGE_QUI_SE_REFERME)).toBe(false);

    // Deux tours plus tard, il est de nouveau armé.
    const plusTard = attaquer(toursPlusTard(premier.state, attaquant, 2), attaquant);
    ok(plusTard);
    expect(pendingCandidates(plusTard.state).some((c) => c.cardId === PIEGE_QUI_SE_REFERME)).toBe(true);
  });

  it("l'information privée revient : l'adversaire ne voit de nouveau qu'un Slot occupé", () => {
    const { state, attaquant, piege } = tableAvecPiege(PIEGE_QUI_SE_REFERME);
    const declaree = attaquer(state, attaquant);
    ok(declaree);
    const tire = activateReactionFor(declaree.state, PIEGE_QUI_SE_REFERME);
    ok(tire);

    // Le propriétaire voit sa carte, l'attaquant ne voit qu'un Slot.
    const vueDuProprietaire = toPlayerView(tire.state, "p2");
    expect(vueDuProprietaire.players.find((p) => p.id === "p2")!.board[0]!.cardId).toBe(PIEGE_QUI_SE_REFERME);

    const vueDeLAdversaire = toPlayerView(tire.state, "p1");
    const masquee = vueDeLAdversaire.players.find((p) => p.id === "p2")!.board[0]!;
    expect(masquee.instanceId).toBe(piege);
    expect(masquee.cardId).not.toBe(PIEGE_QUI_SE_REFERME);
  });

  it("une Structure qui se referme reste masquée par la MARÉE, pas par son tir — visible en Calme, elle se voit", () => {
    const { state, attaquant } = tableAvecPiege(PIEGE_QUI_SE_REFERME);
    const declaree = attaquer(state, attaquant);
    ok(declaree);
    const tire = activateReactionFor(declaree.state, PIEGE_QUI_SE_REFERME);
    ok(tire);

    // La Marée passe en Calme, où ce piège est visible : refermé ou non, la
    // visibilité reste la règle de la Marée.
    const enCalme: GameState = { ...tire.state, environment: { ...tire.state.environment, tideState: "calme" } };
    const vueDeLAdversaire = toPlayerView(enCalme, "p1");
    expect(vueDeLAdversaire.players.find((p) => p.id === "p2")!.board[0]!.cardId).toBe(PIEGE_QUI_SE_REFERME);
  });

  it("ne referme rien si la carte a quitté le plateau entre-temps", () => {
    // Le piège qui se Sabordé en tirant est le cas « détruite » de la
    // grammaire : la refermeture ne doit pas ressusciter son drapeau.
    const { state, attaquant } = tableAvecPiege(PIEGE_QUI_SE_REFERME);
    const declaree = attaquer(state, attaquant);
    ok(declaree);
    const sansPiege: GameState = {
      ...declaree.state,
      players: declaree.state.players.map((p) => (p.id === "p2" ? { ...p, board: [] } : p)) as GameState["players"],
    };
    // La fenêtre ne propose plus rien : la carte n'est plus là.
    expect(pendingCandidates(sansPiege).some((c) => c.cardId === PIEGE_QUI_SE_REFERME)).toBe(false);
  });
});

describe("la grammaire reste déclarée par la carte", () => {
  it("aucune carte du catalogue ne se referme sans que le design l'ait dit", () => {
    // Le comportement est une décision de design, pas un automatisme : une
    // Structure ne doit JAMAIS se remasquer parce que le moteur en a décidé.
    for (const def of CARD_DATABASE.values()) {
      if (def.id.startsWith("test-")) continue;
      for (const ability of def.abilities ?? []) {
        expect(ability.afterHiddenReaction, `${def.id} se referme sans décision de design`).toBeUndefined();
      }
    }
  });

  it("les deux pièges de test ne diffèrent que par ce champ", () => {
    const reste = getCardDefinition(PIEGE_QUI_RESTE).abilities![0]!;
    const referme = getCardDefinition(PIEGE_QUI_SE_REFERME).abilities![0]!;
    expect(reste.afterHiddenReaction).toBeUndefined();
    expect(referme.afterHiddenReaction).toBe("remasquable");
    expect({ ...reste, afterHiddenReaction: undefined, oncePerTurnKey: "" }).toEqual({
      ...referme,
      afterHiddenReaction: undefined,
      oncePerTurnKey: "",
    });
  });
});
