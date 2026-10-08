/**
 * Landes (05/10/2026) — l'emplacement PARTAGÉ du centre du plateau.
 *
 * Une Lande ne prend aucun Slot, il n'y en a qu'une pour les deux joueurs,
 * la nouvelle chasse l'ancienne au Cimetière de son propriétaire, et elle
 * reste N tours de table à compter de sa pose. Ses règles valent pour les
 * deux camps.
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { hasEffectiveKeyword, assertValidDefender } from "@/game/rules/validation";
import { landeRemainingTableTurns } from "@/game/rules/lande";
import { activateReactionFor, instance, testEnvironment, testGameState, testPlayer, enFinDeTour } from "./testHelpers";
import type { GameState } from "@/game/state/types";

const PLUIE = "pluie-corrosive";
const CHAINE = "chaine-de-construction";
const VALLEE = "vallee-de-verre";

const player = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok, (r as { error?: string }).error).toBe(true);
}

/** p1 actif, en Houle (le Crabe de Fer y garde sa Garde), avec la main donnée. */
function partie(hand: ReturnType<typeof instance>[], extra: Partial<GameState> = {}, boards: { p1?: ReturnType<typeof instance>[]; p2?: ReturnType<typeof instance>[] } = {}) {
  return testGameState({
    environment: testEnvironment({ tideState: "houle" }),
    players: [
      testPlayer("p1", { hand, board: boards.p1 ?? [], deck: Array.from({ length: 10 }, () => instance("marin-des-jetees", "p1")) }),
      testPlayer("p2", { shipId: "le-goliath", board: boards.p2 ?? [], deck: Array.from({ length: 10 }, () => instance("marin-des-jetees", "p2")) }),
    ],
    ...extra,
  });
}

/** Fin du tour du joueur actif. */
function finDeTour(state: GameState): GameState {
  const result = dispatch(enFinDeTour(state), { type: "endTurn", playerId: state.activePlayerId });
  ok(result);
  // Une fenêtre éventuelle (annonce de Marée) se passe : rien de la Lande n'y attend.
  let next = result.state;
  while (next.pendingReaction) {
    const passe = dispatch(next, { type: "passReaction", playerId: next.pendingReaction.awaitingPlayerId });
    ok(passe);
    next = passe.state;
  }
  return next;
}

describe("Lande — l'emplacement partagé", () => {
  it("se pose au centre, sans Slot, et coûte sa Raison", () => {
    const pluie = instance(PLUIE, "p1");
    const result = dispatch(partie([pluie]), { type: "playCard", playerId: "p1", instanceId: pluie.instanceId });
    ok(result);
    expect(result.state.environment.lande).toMatchObject({ cardId: PLUIE, ownerId: "p1", instanceId: pluie.instanceId });
    expect(player(result.state, "p1").board).toHaveLength(0);
    expect(player(result.state, "p1").hand).toHaveLength(0);
    expect(player(result.state, "p1").reason).toBe(10 - 3);
    expect(landeRemainingTableTurns(result.state.environment)).toBe(3);
  });

  it("se joue même plateau plein : elle ne prend pas de Slot", () => {
    const pluie = instance(PLUIE, "p1");
    const plein = Array.from({ length: 6 }, () => instance("marin-des-jetees", "p1"));
    const result = dispatch(partie([pluie], {}, { p1: plein }), { type: "playCard", playerId: "p1", instanceId: pluie.instanceId });
    ok(result);
    expect(result.state.environment.lande?.cardId).toBe(PLUIE);
  });

  it("chasse la Lande adverse au Cimetière de SON propriétaire", () => {
    const chaine = instance(CHAINE, "p1");
    const state = partie([chaine], {
      environment: testEnvironment({
        tideState: "houle",
        lande: { instanceId: "lande_p2", cardId: PLUIE, ownerId: "p2", remainingPlayerTurns: 5 },
      }),
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: chaine.instanceId });
    ok(result);
    expect(result.state.environment.lande?.cardId).toBe(CHAINE);
    const cimetiere = player(result.state, "p2").graveyard;
    expect(cimetiere.map((c) => c.cardId)).toEqual([PLUIE]);
    expect(cimetiere[0]!.graveyardCause).toBe("replaced");
    expect(player(result.state, "p1").graveyard).toHaveLength(0);
  });

  it("dure N tours de table à compter de sa pose, puis part au Cimetière de son propriétaire", () => {
    const pluie = instance(PLUIE, "p1");
    const posee = dispatch(partie([pluie]), { type: "playCard", playerId: "p1", instanceId: pluie.instanceId });
    ok(posee);
    let state = posee.state;
    // 3 tours de table = 6 tours de joueur : p1, p2, p1, p2, p1, p2.
    for (let i = 0; i < 5; i++) {
      state = finDeTour(state);
      expect(state.environment.lande?.cardId, `tour ${i + 1}`).toBe(PLUIE);
    }
    expect(landeRemainingTableTurns(state.environment)).toBe(1);
    state = finDeTour(state);
    expect(state.environment.lande).toBeUndefined();
    const cimetiere = player(state, "p1").graveyard;
    expect(cimetiere.map((c) => c.cardId)).toEqual([PLUIE]);
    expect(cimetiere[0]!.graveyardCause).toBe("expired");
  });
});

describe("Pluie corrosive — les permanents perdent Garde", () => {
  it("retire Garde aux deux camps, et l'attaque n'a plus à viser la Garde", () => {
    const crabeP2 = instance("crabe-de-fer", "p2");
    const crabeP1 = instance("crabe-de-fer", "p1");
    const autre = instance("marin-des-jetees", "p2");
    const pluie = instance(PLUIE, "p1");
    const avant = partie([pluie], {}, { p1: [crabeP1], p2: [crabeP2, autre] });
    expect(hasEffectiveKeyword(avant, player(avant, "p2"), crabeP2, "garde")).toBe(true);
    expect(assertValidDefender(avant, "p1", undefined, autre.instanceId).ok).toBe(false);

    const result = dispatch(avant, { type: "playCard", playerId: "p1", instanceId: pluie.instanceId });
    ok(result);
    const apres = result.state;
    expect(hasEffectiveKeyword(apres, player(apres, "p2"), crabeP2, "garde")).toBe(false);
    expect(hasEffectiveKeyword(apres, player(apres, "p1"), crabeP1, "garde")).toBe(false);
    expect(assertValidDefender(apres, "p1", undefined, autre.instanceId).ok).toBe(true);
  });
});

describe("Chaîne de construction — un seul Marin ou une seule Créature par tour", () => {
  it("refuse la deuxième unité jouée du tour", () => {
    const [m1, m2] = [instance("marin-des-jetees", "p1"), instance("marin-des-jetees", "p1")];
    const chaine = instance(CHAINE, "p1");
    let state = partie([chaine, m1, m2]);
    for (const id of [chaine.instanceId, m1.instanceId]) {
      const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      state = r.state;
    }
    const refus = dispatch(state, { type: "playCard", playerId: "p1", instanceId: m2.instanceId });
    expect(refus.ok).toBe(false);
    expect((refus as { error: string }).error).toContain("un seul Marin ou une seule Créature");
  });

  it("compte ce qui est arrivé AVANT sa pose, dans le même tour", () => {
    const [m1, m2] = [instance("marin-des-jetees", "p1"), instance("marin-des-jetees", "p1")];
    const chaine = instance(CHAINE, "p1");
    let state = partie([m1, chaine, m2]);
    for (const id of [m1.instanceId, chaine.instanceId]) {
      const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      state = r.state;
    }
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: m2.instanceId }).ok).toBe(false);
  });

  it("aucun effet ne dépasse la limite : une invocation de deux n'en fait arriver qu'une", () => {
    const chaine = instance(CHAINE, "p1");
    const fesses = instance("fesses-en-avant", "p1");
    let state = partie([chaine, fesses]);
    for (const id of [chaine.instanceId, fesses.instanceId]) {
      const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      state = r.state;
    }
    expect(player(state, "p1").board.filter((u) => u.cardId === "peon-cra-poiscail")).toHaveLength(1);
  });

  it("vaut pour chaque joueur, et repart à chaque tour", () => {
    const chaine = instance(CHAINE, "p1");
    const m1 = instance("marin-des-jetees", "p1");
    let state = partie([chaine, m1]);
    for (const id of [chaine.instanceId, m1.instanceId]) {
      const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      state = r.state;
    }
    state = finDeTour(state);
    const [a, b] = [instance("marin-des-jetees", "p2"), instance("marin-des-jetees", "p2")];
    state = { ...state, players: state.players.map((p) => (p.id === "p2" ? { ...p, hand: [a, b], reason: 10 } : p)) as GameState["players"] };
    const premiere = dispatch(state, { type: "playCard", playerId: "p2", instanceId: a.instanceId });
    ok(premiere);
    expect(dispatch(premiere.state, { type: "playCard", playerId: "p2", instanceId: b.instanceId }).ok).toBe(false);
  });

  it("une Structure n'est pas concernée", () => {
    const chaine = instance(CHAINE, "p1");
    const m1 = instance("marin-des-jetees", "p1");
    const structure = instance("caisses-arrimees", "p1");
    let state = partie([chaine, m1, structure]);
    for (const id of [chaine.instanceId, m1.instanceId, structure.instanceId]) {
      const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: id });
      ok(r);
      state = r.state;
    }
    expect(player(state, "p1").board.map((u) => u.cardId)).toContain("caisses-arrimees");
  });
});

describe("Vallée de verre — 1 dégât à tous les permanents à chaque fin de tour de table", () => {
  it("frappe les deux camps à la fin de chaque tour de table, puis s'en va", () => {
    const vallee = instance(VALLEE, "p1");
    const a = instance("crabe-de-fer", "p1");
    const b = instance("crabe-de-fer", "p2");
    const posee = dispatch(partie([vallee], {}, { p1: [a], p2: [b] }), { type: "playCard", playerId: "p1", instanceId: vallee.instanceId });
    ok(posee);
    const blessure = (st: GameState, id: string, inst: string) => player(st, id).board.find((u) => u.instanceId === inst)?.damageMarked;

    let state = finDeTour(posee.state); // fin du tour de p1 : demi-tour de table
    expect(blessure(state, "p1", a.instanceId)).toBe(0);
    state = finDeTour(state); // fin du tour de p2 : premier tour de table
    expect(blessure(state, "p1", a.instanceId)).toBe(1);
    expect(blessure(state, "p2", b.instanceId)).toBe(1);
    state = finDeTour(state);
    state = finDeTour(state); // deuxième et dernier tour de table : frappe, PUIS part
    expect(blessure(state, "p1", a.instanceId)).toBe(2);
    expect(blessure(state, "p2", b.instanceId)).toBe(2);
    expect(state.environment.lande).toBeUndefined();
  });
});

describe("Réponses aux Landes", () => {
  const enJeu = (cardId: string, ownerId: string, remainingPlayerTurns: number) =>
    testEnvironment({ tideState: "houle", lande: { instanceId: `lande_${cardId}`, cardId, ownerId, remainingPlayerTurns } });

  it("Lever l'Ancre : briser l'Objet détruit la Lande active, au Cimetière de son propriétaire", () => {
    const ancre = instance("lever-lancre", "p1");
    const state = partie([], { environment: enJeu(PLUIE, "p2", 5) }, { p1: [ancre] });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: ancre.instanceId });
    ok(result);
    expect(result.state.environment.lande).toBeUndefined();
    const cimetiere = player(result.state, "p2").graveyard.find((c) => c.cardId === PLUIE);
    expect(cimetiere?.graveyardCause).toBe("destroyed");
  });

  it("Cartographe Opalin méfiant : retire un tour de table à la Lande active, et l'achève à zéro", () => {
    const [c1, c2] = [instance("cartographe-opalin-mefiant", "p1"), instance("cartographe-opalin-mefiant", "p1")];
    let state = partie([c1, c2], { environment: enJeu(PLUIE, "p2", 4) });
    const premier = dispatch(state, { type: "playCard", playerId: "p1", instanceId: c1.instanceId });
    ok(premier);
    expect(landeRemainingTableTurns(premier.state.environment)).toBe(1);
    state = premier.state;
    const second = dispatch(state, { type: "playCard", playerId: "p1", instanceId: c2.instanceId });
    ok(second);
    expect(second.state.environment.lande).toBeUndefined();
    expect(player(second.state, "p2").graveyard.map((c) => c.cardId)).toContain(PLUIE);
  });

  it("Cartographe Opalin méfiant : sans Lande, il arrive sans rien faire", () => {
    const c = instance("cartographe-opalin-mefiant", "p1");
    const result = dispatch(partie([c]), { type: "playCard", playerId: "p1", instanceId: c.instanceId });
    ok(result);
    expect(result.state.environment.lande).toBeUndefined();
  });

  it("Zone de repli : avant le coup de la Vallée, une fenêtre laisse désigner le permanent épargné", () => {
    const zone = instance("zone-de-repli", "p1");
    const crabe = instance("crabe-de-fer", "p1");
    const autre = instance("marin-des-jetees", "p1");
    // Dernier demi-tour du premier tour de table : la fin de ce tour frappe.
    const state = partie([], { activePlayerId: "p1", environment: enJeu(VALLEE, "p2", 3) }, { p1: [zone, crabe, autre] });
    const fin = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
    ok(fin);
    expect(fin.state.pendingReaction?.awaitingPlayerId).toBe("p1");
    expect(fin.state.pendingLandeStrike).toBeDefined();
    // Rien n'est encore tombé : la fenêtre précède le coup.
    expect(player(fin.state, "p1").board.every((u) => u.damageMarked === 0)).toBe(true);

    const abri = activateReactionFor(fin.state, "zone-de-repli", crabe.instanceId);
    ok(abri);
    const apres = abri.state.pendingReaction
      ? dispatch(abri.state, { type: "passReaction", playerId: abri.state.pendingReaction.awaitingPlayerId })
      : abri;
    ok(apres);
    const board = player(apres.state, "p1").board;
    expect(board.find((u) => u.instanceId === crabe.instanceId)?.damageMarked).toBe(0);
    expect(board.find((u) => u.instanceId === zone.instanceId)?.damageMarked).toBe(1);
    expect(apres.state.activePlayerId).toBe("p2");
    expect(apres.state.pendingLandeStrike).toBeUndefined();
  });

  it("Zone de repli : passer la fenêtre laisse le coup tomber partout", () => {
    const zone = instance("zone-de-repli", "p1");
    const crabe = instance("crabe-de-fer", "p1");
    const state = partie([], { environment: enJeu(VALLEE, "p2", 3) }, { p1: [zone, crabe] });
    const fin = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
    ok(fin);
    const passe = dispatch(fin.state, { type: "passReaction", playerId: "p1" });
    ok(passe);
    expect(player(passe.state, "p1").board.find((u) => u.instanceId === crabe.instanceId)?.damageMarked).toBe(1);
  });

  it("Zone de repli contre la Pluie corrosive : à l'entame du tour, le permanent désigné garde Garde", () => {
    const zone = instance("zone-de-repli", "p2");
    const crabe = instance("crabe-de-fer", "p2");
    const state = partie([], { environment: enJeu(PLUIE, "p1", 5) }, { p2: [zone, crabe] });
    const fin = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
    ok(fin);
    expect(fin.state.activePlayerId).toBe("p2");
    expect(fin.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    const abri = activateReactionFor(fin.state, "zone-de-repli", crabe.instanceId);
    ok(abri);
    const p2 = player(abri.state, "p2");
    expect(hasEffectiveKeyword(abri.state, p2, p2.board.find((u) => u.instanceId === crabe.instanceId)!, "garde")).toBe(true);
  });
});
