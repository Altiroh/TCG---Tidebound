import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { RULES } from "@/game/rules/constants";
import { allowanceFor, missedDeadlines, nextTimeoutEndsGame, playerToAct, turnTimerExpired, warningTimes } from "@/game/rules/turnTimer";
import { createGameState } from "@/game/state/createGameState";
import { DECK_LE_GRAND_BANC, DECK_CHASSE_AU_GROS } from "@/game/cards/decks/precon";
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
      player1: { id: "p1", deck: DECK_LE_GRAND_BANC },
      player2: { id: "p2", deck: DECK_CHASSE_AU_GROS },
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

  it("3 minutes, puis 2, puis 1 : les deux premières échéances passent le tour, la troisième vaut forfait", () => {
    let state = expiredTurn();
    expect(allowanceFor(state)).toBe(3 * 60_000);
    expect(nextTimeoutEndsGame(state, "p1")).toBe(false);

    // Première échéance : le tour passe, la partie continue.
    const premiere = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(premiere);
    expect(premiere.state.status).toBe("active");
    expect(premiere.state.activePlayerId).toBe("p2");
    expect(missedDeadlines(premiere.state, "p1")).toBe(1);

    // p2 rend la main : p1 n'a plus que deux minutes.
    const retour = dispatch(premiere.state, { type: "endTurn", playerId: "p2" });
    ok(retour);
    expect(retour.state.turnTimer?.awaitingPlayerId).toBe("p1");
    expect(allowanceFor(retour.state)).toBe(2 * 60_000);
    const delai = retour.state.turnTimer!.deadlineAt - Date.now();
    expect(delai).toBeGreaterThan(2 * 60_000 - 5_000);
    expect(delai).toBeLessThanOrEqual(2 * 60_000);

    // Deuxième échéance : le tour passe encore, et la suivante sera la dernière (1 minute).
    state = { ...retour.state, turnTimer: { ...retour.state.turnTimer!, deadlineAt: 1_000 } };
    const deuxieme = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(deuxieme);
    expect(deuxieme.state.status).toBe("active");
    expect(missedDeadlines(deuxieme.state, "p1")).toBe(2);
    const retour2 = dispatch(deuxieme.state, { type: "endTurn", playerId: "p2" });
    ok(retour2);
    expect(allowanceFor(retour2.state)).toBe(60_000);
    expect(nextTimeoutEndsGame(retour2.state, "p1")).toBe(true);

    // Troisième : forfait, au profit de celui qui est resté.
    state = { ...retour2.state, turnTimer: { ...retour2.state.turnTimer!, deadlineAt: 1_000 } };
    const result = dispatch(state, { type: "timeout", playerId: "p1", now: 5_000 });
    ok(result);
    expect(result.state.status).toBe("finished");
    expect(result.state.winnerId).toBe("p2");
    expect(missedDeadlines(result.state, "p1")).toBe(3);
    // Les deux événements, dans l'ordre : l'échéance d'abord, la fin ensuite.
    const types = result.events.map((e) => e.type);
    expect(types.indexOf("TURN_TIMED_OUT")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("GAME_ENDED")).toBeGreaterThan(types.indexOf("TURN_TIMED_OUT"));
    expect(result.events.some((e) => e.type === "GAME_ENDED" && e.reason === "timeout")).toBe(true);
  });

  it("rejouer efface les échéances manquées : le compteur mesure une absence, pas une lenteur passée", () => {
    // Un seul geste, et le joueur retrouve ses trois minutes pleines.
    const state = expiredTurn();
    const absent: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, missedDeadlines: 5 } : p)) as GameState["players"],
    };
    expect(missedDeadlines(absent, "p1")).toBe(5);

    const revient = dispatch(absent, { type: "advancePhase", playerId: "p1" });
    ok(revient);
    expect(missedDeadlines(revient.state, "p1")).toBe(0);
    expect(allowanceFor(revient.state, "p1")).toBe(RULES.INACTIVITY_LIMIT_MS);
  });

  it("après une échéance, le chrono repart même si le même joueur reste attendu", () => {
    // Deux fenêtres de réaction d'affilée pour p2 : garder l'échéance
    // dépassée enchaînerait les échéances jusqu'au forfait.
    const base = expiredTurn();
    const enReaction: GameState = {
      ...base,
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: base.turnNumber },
      turnTimer: { awaitingPlayerId: "p2", kind: "reaction", deadlineAt: 1_000 },
    };
    const result = dispatch(enReaction, { type: "timeout", playerId: "p2", now: 5_000 });
    ok(result);
    expect(turnTimerExpired(result.state, Date.now())).toBe(false);
  });

  it("le geste neutre est joué avant la fin — une fenêtre ouverte ne reste pas suspendue", () => {
    // Le seuil peut redescendre : quand une échéance ne termine PAS la
    // partie, elle doit jouer le geste le plus neutre possible. On le
    // vérifie en donnant au joueur une marge d'échéances.
    const base = expiredTurn();
    const enReaction: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === "p2" ? { ...p, missedDeadlines: -5 } : p)) as GameState["players"],
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: base.turnNumber },
      turnTimer: { awaitingPlayerId: "p2", kind: "reaction", deadlineAt: 1_000 },
    };
    expect(nextTimeoutEndsGame(enReaction, "p2")).toBe(false);

    const result = dispatch(enReaction, { type: "timeout", playerId: "p2", now: 5_000 });
    ok(result);
    expect(result.state.status).toBe("active");
    expect(result.state.pendingReaction).toBeUndefined();
    // La main n'a pas changé de siège : seule la fenêtre s'est refermée.
    expect(result.state.activePlayerId).toBe("p1");
  });

  it("le délai est le MÊME quelle que soit la question posée — c'est l'inactivité qu'on mesure", () => {
    const state = testGameState();
    const enReaction: GameState = {
      ...state,
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: 1 },
    };
    const enFenetre = dispatch(enReaction, { type: "advancePhase", playerId: "p1" });
    // La fenêtre bloque l'action, mais le chrono a été posé pour p2 : même
    // enveloppe que pour un tour.
    expect(allowanceFor(enReaction)).toBe(RULES.INACTIVITY_LIMIT_MS);
    expect(enFenetre.ok).toBe(false);

    const apres = dispatch(enReaction, { type: "passReaction", playerId: "p2" });
    ok(apres);
    expect(apres.state.turnTimer?.kind).toBe("turn");
    expect(allowanceFor(apres.state)).toBe(RULES.INACTIVITY_LIMIT_MS);
  });

  it("un délai réduit ne garde que les alertes qui tombent dedans", () => {
    const state = expiredTurn({ turnNumber: 1 });
    const reduit: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "p1" ? { ...p, missedDeadlines: 1 } : p)) as GameState["players"],
      turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 1_000_000 },
    };
    // Deux minutes : seule reste l'urgence, une minute avant la fin.
    expect(warningTimes(reduit)).toEqual([1_000_000 - 60_000]);
  });

  it("prévient AVANT l'échéance, à deux minutes puis à une de la fin", () => {
    const state = expiredTurn({ turnNumber: 1 });
    const chrono: GameState = { ...state, turnTimer: { awaitingPlayerId: "p1", kind: "turn", deadlineAt: 1_000_000 } };
    const paliers = warningTimes(chrono);
    expect(paliers).toHaveLength(RULES.INACTIVITY_WARNINGS_MS.length);
    // Tous strictement avant l'échéance, et dans l'ordre.
    for (const palier of paliers) expect(palier).toBeLessThan(chrono.turnTimer!.deadlineAt);
    expect([...paliers].sort((a, b) => a - b)).toEqual(paliers);
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
