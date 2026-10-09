import { describe, expect, it } from "vitest";
import {
  TUTORIAL_CARDS,
  TUTORIAL_START_TURN,
  TUTORIAL_STEPS,
  applyTutorialScenario,
  tutorialAnchor,
  tutorialCardsExist,
  tutorialProgress,
} from "@/game/tutorial";
import { PRECON_DECKS } from "@/game";
import { dispatch } from "@/game/engine";
import { runBotTurn } from "@/game/bot/runBotTurn";
import { createGameState } from "@/game/state/createGameState";
import { COACH_GAP, placeCoach, unionRect } from "@/features/tutorial/coachPlacement";
import type { GameState, PlayerAction } from "@/game";
import { enFinDeTour } from "./testHelpers";

/**
 * TUTORIEL (refonte du 06/10/2026) : une partie reprise en cours de route
 * sur un scénario préparé, des LEÇONS qui attendent « Compris » et des
 * ACTIONS qui se valident sur l'état réel — conditionnelles quand le geste
 * n'est pas encore possible.
 */

const decks = (() => {
  const player = PRECON_DECKS[1] ?? PRECON_DECKS[0]!;
  return { player, opponent: PRECON_DECKS.find((d) => d.id !== player.id) ?? player };
})();

function scenario(seed = 7): GameState {
  return applyTutorialScenario(
    createGameState({ gameId: `tuto${seed}`, player1: { id: "p1", deck: decks.player }, player2: { id: "p2", deck: decks.opponent }, seed })
  );
}

function act(state: GameState, action: PlayerAction): GameState {
  const result = dispatch(state, action);
  if (!result.ok) throw new Error(`${action.type} : ${result.error}`);
  return result.state;
}

const inHand = (state: GameState, cardId: string) => state.players[0].hand.find((c) => c.cardId === cardId)!.instanceId;
const onBoard = (state: GameState, playerIndex: 0 | 1, cardId: string) => state.players[playerIndex].board.find((c) => c.cardId === cardId)?.instanceId;
const indexOf = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);

/** Joue le premier tour comme le guide le demande, puis le tour du bot. */
function firstTurnThenBot(seed: number): GameState {
  let state = scenario(seed);
  state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.unit) });
  state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.piedMarin) });
  state = act(state, { type: "breakObject", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.object), fromHand: true });
  state = act(state, { type: "saborder", playerId: "p1", instanceId: onBoard(state, 0, TUTORIAL_CARDS.structure)! });
  state = act(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
  state = runBotTurn(state, "p2", "facile");
  // Les fenêtres facultatives de l'entame (capacité de Navire à l'annonce de la Marée) : le joueur passe.
  for (let guard = 0; state.pendingReaction && guard < 5; guard++) {
    state = act(state, { type: "passReaction", playerId: state.pendingReaction.awaitingPlayerId });
  }
  return state;
}

describe("étapes du tutoriel", () => {
  it("chaque étape a un chapitre, un titre et une consigne", () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.chapter.trim(), step.id).not.toBe("");
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.instruction.trim(), step.id).not.toBe("");
    }
  });

  it("couvre l'interface, le premier tour, les gestes, le combat, la Marée et le public", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    for (const id of ["hand", "deck-graveyard", "anchor", "reason", "ship-ability", "opponent", "pied-marin", "break", "saborder", "discard", "end-turn", "opponent-turn", "garde", "attack", "lande", "lande-play", "tide", "audience"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("nomme des cartes qui existent au catalogue", () => {
    expect(tutorialCardsExist()).toBe(true);
  });

  it("une leçon arrête la course : elle attend « Compris »", () => {
    const progress = tutorialProgress(scenario(), "p1");
    expect(progress.step?.id).toBe("welcome");
    expect(progress.step?.isDone).toBeUndefined();
    expect(tutorialProgress(scenario(), "p1", 1).step?.id).toBe("hand");
  });

  it("une action déjà faite se valide en arrivant dessus", () => {
    let state = scenario();
    state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.unit) });
    // Le joueur a posé la Gabière pendant les leçons : l'étape « pose-la » tombe d'elle-même.
    expect(tutorialProgress(state, "p1", indexOf("play-unit")).step?.id).toBe("summoning-sickness");
  });

  it("chaque ancre désigne quelque chose pendant le premier tour", () => {
    const state = scenario();
    for (const step of TUTORIAL_STEPS) {
      if (!step.anchor) continue;
      expect(tutorialAnchor(step, state, "p1"), step.id).toBeTruthy();
    }
  });
});

describe("partie scénarisée", () => {
  it("reprend au troisième tour du joueur, avec ce que les leçons demandent", () => {
    const state = scenario();
    expect(state.turnNumber).toBe(TUTORIAL_START_TURN);
    expect(state.activePlayerId).toBe("p1");
    const hand = state.players[0].hand.map((c) => c.cardId);
    expect(hand).toEqual(expect.arrayContaining([TUTORIAL_CARDS.unit, TUTORIAL_CARDS.piedMarin, TUTORIAL_CARDS.object, TUTORIAL_CARDS.lande]));
    expect(onBoard(state, 0, TUTORIAL_CARDS.structure)).toBeTruthy();
    expect(onBoard(state, 1, TUTORIAL_CARDS.garde)).toBeTruthy();
    expect(onBoard(state, 1, TUTORIAL_CARDS.threat)).toBeTruthy();
    expect(state.environment.tideRemainingTurns).toBe(1);
  });

  it("donne assez de Raison pour les gestes du premier tour", () => {
    let state = scenario();
    state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.unit) });
    state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.piedMarin) });
    state = act(state, { type: "breakObject", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.object), fromHand: true });
    expect(state.players[0].reason).toBeGreaterThanOrEqual(0);
  });

  it("n'invente ni ne duplique aucun exemplaire du préconstruit", () => {
    const state = scenario();
    const ids = [...state.players[0].hand, ...state.players[0].deck, ...state.players[0].board].map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parcours guidé, de bout en bout", () => {
  it("compte un Bris depuis le PLATEAU comme depuis la main", () => {
    // Le bug remonté : l'ancienne étape n'acceptait que la main, et un Objet
    // Brisé sur le plateau la laissait bloquée.
    let state = scenario();
    state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.object) });
    const thermos = onBoard(state, 0, TUTORIAL_CARDS.object)!;
    state = act(state, { type: "breakObject", playerId: "p1", instanceId: thermos });
    expect(TUTORIAL_STEPS[indexOf("break")]!.isDone!(state, "p1")).toBe(true);
  });

  it("valide le Sabordage de la Structure préparée", () => {
    let state = scenario();
    state = act(state, { type: "saborder", playerId: "p1", instanceId: onBoard(state, 0, TUTORIAL_CARDS.structure)! });
    expect(TUTORIAL_STEPS[indexOf("saborder")]!.isDone!(state, "p1")).toBe(true);
  });

  it("n'annonce l'attaque possible qu'au bon moment, et la rend possible quelle que soit la graine", () => {
    const attack = TUTORIAL_STEPS[indexOf("attack")]!;
    // Au premier tour, rien n'est prêt hors Pied marin : la fiche le dit au lieu de laisser chercher.
    let first = scenario();
    first = act(first, { type: "playCard", playerId: "p1", instanceId: inHand(first, TUTORIAL_CARDS.unit) });
    expect(attack.waitingFor!(first, "p1")).toMatch(/Aucune de tes unités|Phase de combat/);

    for (let seed = 1; seed <= 8; seed++) {
      let state = firstTurnThenBot(seed);
      expect(state.activePlayerId, `graine ${seed}`).toBe("p1");
      expect(tutorialProgress(state, "p1", indexOf("opponent-turn")).index, `graine ${seed}`).toBeGreaterThan(indexOf("opponent-turn"));
      expect(attack.waitingFor!(state, "p1"), `graine ${seed}`).toMatch(/Phase de combat/);
      state = act(state, { type: "advancePhase", playerId: "p1" });
      expect(attack.waitingFor!(state, "p1"), `graine ${seed}`).toBeNull();

      // La Garde impose sa cible : on l'attaque.
      const attacker = state.players[0].board.find((u) => u.cardId === TUTORIAL_CARDS.unit)!.instanceId;
      const garde = state.players[1].board.find((u) => u.cardId === TUTORIAL_CARDS.garde)?.instanceId;
      state = act(state, { type: "attack", playerId: "p1", attackerInstanceId: attacker, ...(garde ? { defenderInstanceId: garde } : {}) });
      expect(attack.isDone!(state, "p1"), `graine ${seed}`).toBe(true);
    }
  });

  it("pose la Lande après le combat : elle s'installe au centre et retire la Garde", () => {
    const step = TUTORIAL_STEPS[indexOf("lande-play")]!;
    let state = firstTurnThenBot(3);
    state = act(state, { type: "advancePhase", playerId: "p1" });
    // En plein combat, la fiche dit d'attendre la Phase principale 2.
    expect(step.waitingFor!(state, "p1")).toMatch(/Phase principale 2/);
    state = act(state, { type: "advancePhase", playerId: "p1" });
    expect(step.waitingFor!(state, "p1")).toBeNull();
    state = act(state, { type: "playCard", playerId: "p1", instanceId: inHand(state, TUTORIAL_CARDS.lande) });
    expect(step.isDone!(state, "p1")).toBe(true);
    expect(state.environment.lande?.cardId).toBe(TUTORIAL_CARDS.lande);
  });

  it("voit la Marée changer pendant le tour adverse", () => {
    const state = firstTurnThenBot(3);
    expect(state.environment.tideState).not.toBe("calme");
  });
});

describe("placement de la fiche du guide", () => {
  const viewport = { width: 1600, height: 900 };
  const panel = { width: 300, height: 220 };

  it("Saborder : la fiche ne couvre ni la Caisse ni le Cimetière où elle se glisse", () => {
    const step = TUTORIAL_STEPS.find((entry) => entry.id === "saborder")!;
    expect(step.dropTarget).toBe('[data-graveyard="player"]');
    const crate = { left: 1180, top: 560, width: 110, height: 150 };
    const graveyard = { left: 1330, top: 600, width: 120, height: 160 };
    const placed = placeCoach(unionRect([crate, graveyard])!, panel, viewport);
    const overlaps = (zone: typeof crate) =>
      placed.left < zone.left + zone.width && placed.left + panel.width > zone.left && placed.top < zone.top + zone.height && placed.top + panel.height > zone.top;
    expect(overlaps(crate)).toBe(false);
    expect(overlaps(graveyard)).toBe(false);
  });

  it("réunion des zones : ignore les absentes", () => {
    expect(unionRect([null, undefined])).toBeNull();
    expect(unionRect([{ left: 10, top: 20, width: 5, height: 5 }, null, { left: 30, top: 0, width: 10, height: 10 }])).toEqual({ left: 10, top: 0, width: 30, height: 25 });
  });

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

  describe("téléphone couché (hauteur ≤ 560 px)", () => {
    const phone = { width: 844, height: 390 };
    const compact = { width: 420, height: 120 };

    it("passe EN HAUT quand la zone à utiliser est en bas (la main) — jamais sur la rangée où poser", () => {
      const hand = { left: 120, top: 300, width: 600, height: 90 };
      const placed = placeCoach(hand, compact, phone);
      expect(placed.side).toBe("top");
      expect(placed.top + compact.height).toBeLessThanOrEqual(hand.top);
    });

    it("passe EN BAS quand la zone est au milieu ou en haut (piste de Marée, Navire adverse)", () => {
      const tide = { left: 150, top: 150, width: 500, height: 40 };
      const placed = placeCoach(tide, compact, phone);
      expect(placed.side).toBe("bottom");
      expect(placed.top).toBeGreaterThanOrEqual(tide.top + tide.height);
    });

    it("reste centrée et dans l'écran", () => {
      const placed = placeCoach({ left: 0, top: 350, width: 40, height: 40 }, compact, phone);
      expect(placed.left).toBeCloseTo((phone.width - compact.width) / 2);
      expect(placed.top).toBeGreaterThanOrEqual(0);
    });
  });
});
