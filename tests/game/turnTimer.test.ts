import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { RULES } from "@/game/rules/constants";
import { missedDeadlines, nextTimeoutEndsGame, playerToAct, turnTimerExpired } from "@/game/rules/turnTimer";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_BANC_DEBORDE, DECK_BEC_DANS_LA_BRUME } from "@/game/cards/decks/borrowed";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * DÉLAI DE TOUR — ce que le moteur en fait.
 *
 * Le serveur décide QUAND une échéance est passée (il a l'heure) ; tout ce
 * qui suit est ici. Les tests posent donc des échéances à la main et
 * appellent l'action `timeout` avec un `now` explicite — exactement ce que
 * fait `features/matches/matchStore.ts`.
 */

function ok(result: ReturnType<typeof dispatch>): asserts result is Extract<ReturnType<typeof dispatch>, { ok: true }> {
  if (!result.ok) throw new Error(result.error);
}

/** Une partie où c'est à p1 de jouer, son délai déjà écoulé. */
function expiredTurn(overrides: Partial<GameState> = {}): GameState {
  // Des decks garnis : un deck vide déclenche le Jugement de l'Océan et
  // finirait la partie avant que les échéances n'aient dit leur mot.
  const deck = (owner: string) => Array.from({ length: 20 }, () => instance("marin-des-jetees", owner));
  const base = testGameState({
    players: [
      testPlayer("p1", { deck: deck("p1") }),
      testPlayer("p2", { shipId: "le-goliath", deck: deck("p2") }),
    ],
    ...overrides,
  });
  return { ...base, turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 1_000 } };
}

describe("chrono de tour", () => {
  it("désigne toujours celui que le moteur attend — pas forcément le joueur actif", () => {
    const state = testGameState();
    expect(playerToAct(state)).toBe(state.activePlayerId);

    const enReaction: GameState = {
      ...state,
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: 1 },
    };
    expect(playerToAct(enReaction)).toBe("p2");
    expect(playerToAct({ ...state, status: "finished" })).toBeUndefined();
  });

  it("une partie neuve part avec un délai, et chaque action le recale sur la question suivante", () => {
    const state = createGameState({
      gameId: "chrono",
      player1: { id: "p1", deck: DECK_LE_BANC_DEBORDE },
      player2: { id: "p2", deck: DECK_BEC_DANS_LA_BRUME },
      seed: 4,
    });
    expect(state.turnTimer?.awaitingPlayerId).toBe("p1");
    expect(state.turnTimer!.deadlineAt).toBeGreaterThan(Date.now());

    const passeLaMain = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(passeLaMain);
    // La question a changé de siège : le chrono aussi.
    expect(passeLaMain.state.turnTimer?.awaitingPlayerId).toBe("p2");
    expect(passeLaMain.state.turnTimer!.deadlineAt).toBeGreaterThan(Date.now());
  });

  it("une action qui ne change pas la question ne rallonge pas le délai", () => {
    const state = expiredTurn();
    const phase = dispatch({ ...state, turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 9e15 } }, {
      type: "advancePhase",
      playerId: "p1",
    });
    ok(phase);
    // Sinon, avancer de phase en boucle suffirait à ne jamais être en retard.
    expect(phase.state.turnTimer!.deadlineAt).toBe(9e15);
  });

  it("le chrono disparaît avec la partie", () => {
    const abandon = dispatch(testGameState(), { type: "concede", playerId: "p1" });
    ok(abandon);
    expect(abandon.state.turnTimer).toBeUndefined();
  });
});

describe("échéance manquée", () => {
  it("refuse de se déclencher avant l'heure, ou pour le mauvais joueur", () => {
    const state = expiredTurn();
    expect(turnTimerExpired(state, 999)).toBe(false);
    expect(dispatch(state, { type: "timeout", playerId: "p1", now: 999 }).ok).toBe(false);
    expect(dispatch(state, { type: "timeout", playerId: "p2", now: 5_000 }).ok).toBe(false);
  });

  it("passe le tour sans faire perdre la partie, et compte un point", () => {
    const state = expiredTurn();
    const result = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(result);

    expect(result.state.status).toBe("active");
    expect(result.state.activePlayerId).toBe("p2");
    expect(missedDeadlines(result.state, "p1")).toBe(1);
    expect(result.events.some((e) => e.type === "TURN_TIMED_OUT")).toBe(true);
    // Le chrono repart, pour l'autre joueur : la partie n'attend plus le même.
    expect(result.state.turnTimer?.awaitingPlayerId).toBe("p2");
    expect(result.state.turnTimer!.deadlineAt).toBeGreaterThan(5_000);
  });

  it("rejouer efface les échéances manquées — un rafraîchissement de page coûte un tour, pas la partie", () => {
    let state = expiredTurn();
    const premier = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(premier);
    expect(missedDeadlines(premier.state, "p1")).toBe(1);

    // p2 rend la main, p1 revient et joue normalement.
    const rendu = dispatch(premier.state, { type: "endTurn", playerId: "p2" });
    ok(rendu);
    const revient = dispatch(rendu.state, { type: "advancePhase", playerId: "p1" });
    ok(revient);
    expect(missedDeadlines(revient.state, "p1")).toBe(0);
    expect(nextTimeoutEndsGame(revient.state, "p1")).toBe(false);
  });

  it("au bout de MAX_MISSED_DEADLINES échéances consécutives, la partie est perdue", () => {
    let state = expiredTurn();
    for (let i = 1; i < RULES.MAX_MISSED_DEADLINES; i += 1) {
      const manquee = dispatch({ ...state, turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 1_000 } }, {
        type: "timeout",
        playerId: "p1",
        now: 5_000,
      });
      ok(manquee);
      expect(manquee.state.status).toBe("active");
      // p2 rend la main sans jouer : c'est de nouveau à p1, toujours absent.
      const rendu = dispatch(manquee.state, { type: "endTurn", playerId: "p2" });
      ok(rendu);
      state = rendu.state;
      expect(missedDeadlines(state, "p1")).toBe(i);
    }

    expect(nextTimeoutEndsGame(state, "p1")).toBe(true);
    const derniere = dispatch({ ...state, turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 1_000 } }, {
      type: "timeout",
      playerId: "p1",
      now: 5_000,
    });
    ok(derniere);
    expect(derniere.state.status).toBe("finished");
    expect(derniere.state.winnerId).toBe("p2");
    expect(derniere.events.some((e) => e.type === "GAME_ENDED" && e.reason === "timeout")).toBe(true);
  });

  it("dans une fenêtre de réaction, l'échéance passe la fenêtre au lieu de rendre la main", () => {
    const base = expiredTurn();
    const enReaction: GameState = {
      ...base,
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: base.turnNumber },
      turnTimer: { awaitingPlayerId: "p2", kind: "reaction", deadlineAt: 1_000 },
    };

    const result = dispatch(enReaction, { type: "timeout", playerId: "p2", now: 5_000 });
    ok(result);
    expect(result.state.pendingReaction).toBeUndefined();
    // La main n'a pas changé de siège : seule la fenêtre s'est refermée.
    expect(result.state.activePlayerId).toBe("p1");
    expect(missedDeadlines(result.state, "p2")).toBe(1);
  });

  it("le délai d'une fenêtre est plus court que celui d'un tour", () => {
    const state = testGameState();
    const enReaction: GameState = {
      ...state,
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: 1 },
    };
    const apres = dispatch(enReaction, { type: "passReaction", playerId: "p2" });
    ok(apres);
    // La fenêtre s'est refermée : on retombe sur un délai de TOUR.
    expect(apres.state.turnTimer?.kind).toBe("turn");
    expect(RULES.REACTION_TIME_LIMIT_MS).toBeLessThan(RULES.TURN_TIME_LIMIT_MS);
  });

  it("survit à une sérialisation : une reconnexion ne rouvre pas le délai", () => {
    const state = expiredTurn();
    const manquee = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(manquee);

    const reloaded: GameState = JSON.parse(JSON.stringify(manquee.state));
    expect(reloaded.turnTimer).toEqual(manquee.state.turnTimer);
    expect(getPlayer(reloaded, "p1").missedDeadlines).toBe(1);
  });
});
