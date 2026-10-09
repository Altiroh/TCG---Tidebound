import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { canBeEquipTarget } from "@/game/cards/sets/core";
import { markerCount, unitHasSubtype } from "@/game/cards/markers";
import { boardCapacity } from "@/game/rules/slotEffects";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { answerHandDiscard, enFinDeTour, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 18 — Un Dead / Mort-vivant : le MARQUEUR MORT.
 *
 * Tout passe par `dispatch`. Ce qui est vérifié : un marqueur se pose et
 * donne le sous-type Mort-vivant ; une unité marquée détruite part SOUS la
 * pioche, sans son marqueur ; un retour du Cimetière ARRIVE sur le plateau,
 * marqué, avec le mal d'invocation ; « d'un Cimetière » ouvre celui d'en
 * face ; et chaque carte du pool fait ce que son texte dit.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id = "p1") => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const stats = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id));
};
const marque = (card: CardInstance): CardInstance => ({ ...card, markers: { mort: 1 } });

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, overrides: Partial<GameState> = {}): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
    ...overrides,
  });
}

function jouer(state: GameState, carte: CardInstance, targetInstanceId?: string) {
  return dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

/** `attaquant` (p1) attaque le Crabe de fer adverse (2/5) en Phase de combat, et meurt s'il a 2 Résistance ou moins. */
function seJeterSurLeCrabe(state: GameState, attaquant: CardInstance, crabe: CardInstance) {
  return dispatch({ ...state, phase: "combatPhase" }, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: crabe.instanceId });
}

function prendre(state: GameState, ...instanceIds: string[]) {
  return dispatch(state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: instanceIds } });
}

describe("le marqueur Mort", () => {
  it("Chut, il dort : un marqueur Mort sur une unité alliée non Mort-vivant, qui devient Mort-vivant", () => {
    const chut = instance("chut-il-dort", "p1");
    const matelot = instance("marin-des-jetees", "p1");
    const r = jouer(table({ hand: [chut], board: [matelot] }), chut, matelot.instanceId);
    ok(r);
    const marquee = unite(r.state, matelot.instanceId)!;
    expect(markerCount(marquee, "mort")).toBe(1);
    expect(unitHasSubtype(getCardDefinition(marquee.cardId), marquee, "mort-vivant")).toBe(true);
    // L'Anomalie part au Cimetière après résolution.
    expect(joueur(r.state).graveyard.some((c) => c.instanceId === chut.instanceId)).toBe(true);
  });

  it("Chut, il dort refuse un Mort-vivant, et une unité qui porte déjà un marqueur", () => {
    const chut = instance("chut-il-dort", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    const dejaMarque = marque(instance("marin-des-jetees", "p1"));
    const state = table({ hand: [chut], board: [ptitBout, dejaMarque] });
    expect(jouer(state, chut, ptitBout.instanceId).ok).toBe(false);
    expect(jouer(state, chut, dejaMarque.instanceId).ok).toBe(false);
  });

  it("une unité marquée détruite part SOUS la pioche, sans son marqueur, et jamais au Cimetière", () => {
    const murene = marque(instance("murene-aveugle", "p1"));
    const crabe = instance("crabe-de-fer", "p2");
    const r = seJeterSurLeCrabe(table({ board: [murene] }, { board: [crabe] }), murene, crabe);
    ok(r);
    expect(unite(r.state, murene.instanceId)).toBeUndefined();
    expect(joueur(r.state).graveyard.some((c) => c.instanceId === murene.instanceId)).toBe(false);
    const dessous = joueur(r.state).deck.at(-1)!;
    expect(dessous.instanceId).toBe(murene.instanceId);
    expect(dessous.markers).toBeUndefined();
  });

  it("une unité NON marquée détruite va au Cimetière, comme avant", () => {
    const murene = instance("murene-aveugle", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const r = seJeterSurLeCrabe(table({ board: [murene] }, { board: [crabe] }), murene, crabe);
    ok(r);
    expect(joueur(r.state).graveyard.some((c) => c.instanceId === murene.instanceId)).toBe(true);
  });
});

describe("retours du Cimetière sur le plateau", () => {
  it("Réveille-toi : une unité de coût 3 ou moins de votre Cimetière arrive, marquée, et n'attaque pas ce tour", () => {
    const reveil = instance("reveille-toi", "p1");
    const loup = instance("vieux-loup-de-mer", "p1"); // coût 3
    const chose = instance("chose-des-hauts-fonds", "p1"); // coût 4 : trop chère
    const r = jouer(table({ hand: [reveil], graveyard: [loup, chose] }), reveil);
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("deckLook");
    const proposees = r.state.pendingChoice?.kind === "deckLook" ? r.state.pendingChoice.revealed.map((c) => c.instanceId) : [];
    expect(proposees).toEqual([loup.instanceId]);

    const pris = prendre(r.state, loup.instanceId);
    ok(pris);
    const revenu = unite(pris.state, loup.instanceId)!;
    expect(revenu).toBeDefined();
    expect(markerCount(revenu, "mort")).toBe(1);
    expect(revenu.summoningSick).toBe(true);
    expect(joueur(pris.state).graveyard.map((c) => c.instanceId)).toContain(chose.instanceId);
    expect(joueur(pris.state).graveyard.map((c) => c.instanceId)).not.toContain(loup.instanceId);
  });

  it("Encore une histoire : « d'un Cimetière » — une unité adverse revient sur VOTRE plateau, sous votre contrôle", () => {
    const histoire = instance("encore-une-histoire", "p1");
    const murene = instance("murene-aveugle", "p2"); // coût 2, au Cimetière adverse
    const r = dispatch(table({ board: [histoire] }, { graveyard: [murene] }), { type: "breakObject", playerId: "p1", instanceId: histoire.instanceId });
    ok(r);
    const pris = prendre(r.state, murene.instanceId);
    ok(pris);
    const revenue = joueur(pris.state).board.find((u) => u.instanceId === murene.instanceId)!;
    expect(revenue.ownerId).toBe("p1");
    expect(markerCount(revenue, "mort")).toBe(1);
    expect(revenue.summoningSick).toBe(true);
    expect(joueur(pris.state, "p2").graveyard).toHaveLength(0);
  });

  it("Encore une histoire : la carte non prise retourne dans le Cimetière d'où elle sortait", () => {
    const histoire = instance("encore-une-histoire", "p1");
    const mienne = instance("murene-aveugle", "p1");
    const adverse = instance("murene-aveugle", "p2");
    const r = dispatch(table({ board: [histoire], graveyard: [mienne] }, { graveyard: [adverse] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: histoire.instanceId,
    });
    ok(r);
    const pris = prendre(r.state, mienne.instanceId);
    ok(pris);
    expect(joueur(pris.state, "p2").graveyard.map((c) => c.instanceId)).toEqual([adverse.instanceId]);
  });

  it("Coucou, c'est moi : détruite, elle revient à la fin du tour avec un marqueur Mort ; détruite marquée, elle part sous la pioche", () => {
    const coucou = instance("coucou-cest-moi", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const mort = seJeterSurLeCrabe(table({ board: [coucou] }, { board: [crabe] }), coucou, crabe);
    ok(mort);
    expect(joueur(mort.state).graveyard.some((c) => c.instanceId === coucou.instanceId)).toBe(true);

    const fin = dispatch(enFinDeTour({ ...mort.state, phase: "mainPhase2" }), { type: "endTurn", playerId: "p1" });
    ok(fin);
    const revenue = unite(fin.state, coucou.instanceId)!;
    expect(revenue).toBeDefined();
    expect(markerCount(revenue, "mort")).toBe(1);
    expect(joueur(fin.state).graveyard.some((c) => c.instanceId === coucou.instanceId)).toBe(false);

    // Marquée, sa prochaine destruction l'envoie sous la pioche : pas de boucle.
    const encore = seJeterSurLeCrabe({ ...fin.state, activePlayerId: "p1", priorityPlayerId: "p1", players: fin.state.players.map((p) => (p.id === "p1" ? { ...p, board: p.board.map((u) => ({ ...u, summoningSick: false, hasAttackedThisTurn: false })) } : p)) as GameState["players"] }, revenue, crabe);
    ok(encore);
    expect(joueur(encore.state).graveyard.some((c) => c.instanceId === coucou.instanceId)).toBe(false);
    expect(joueur(encore.state).deck.at(-1)!.instanceId).toBe(coucou.instanceId);
  });
});

describe("cartes du pool", () => {
  it("On joue aux morts : +1 Puissance, conservée, pour chaque carte défaussée", () => {
    const morts = instance("on-joue-aux-morts", "p1");
    const a = instance("marin-des-jetees", "p1");
    const b = instance("marin-des-jetees", "p1");
    const c = instance("marin-des-jetees", "p1");
    const r = jouer(table({ hand: [morts, a, b, c] }), morts);
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("handDiscard");
    const defausse = answerHandDiscard(r.state, [a.instanceId, b.instanceId]);
    ok(defausse);
    expect(stats(defausse.state, morts.instanceId).attack).toBe(1 + 2);
    expect(joueur(defausse.state).hand.map((h) => h.instanceId)).toEqual([c.instanceId]);
  });

  it("On joue aux morts : ne rien défausser est permis, et ne donne rien", () => {
    const morts = instance("on-joue-aux-morts", "p1");
    const a = instance("marin-des-jetees", "p1");
    const r = jouer(table({ hand: [morts, a] }), morts);
    ok(r);
    const passe = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: "pass" });
    ok(passe);
    expect(stats(passe.state, morts.instanceId).attack).toBe(1);
  });

  it("Le Grand Frère : +1 Puissance à vos unités marquées, lui compris s'il l'est", () => {
    const frere = marque(instance("le-grand-frere", "p1"));
    const marquee = marque(instance("marin-des-jetees", "p1"));
    const libre = instance("marin-des-jetees", "p1");
    const state = table({ board: [frere, marquee, libre] });
    expect(stats(state, marquee.instanceId).attack).toBe(1 + 1);
    expect(stats(state, libre.instanceId).attack).toBe(1);
    expect(stats(state, frere.instanceId).attack).toBe(2 + 1);
  });

  it("Le Gardien des Jouets : +2 Puissance tant qu'au moins 2 de vos unités sont marquées", () => {
    const gardien = instance("le-gardien-des-jouets", "p1");
    const une = marque(instance("marin-des-jetees", "p1"));
    const deux = marque(instance("marin-des-jetees", "p1"));
    expect(stats(table({ board: [gardien, une] }), gardien.instanceId).attack).toBe(3);
    expect(stats(table({ board: [gardien, une, deux] }), gardien.instanceId).attack).toBe(3 + 2);
  });

  it("Pas sans moi : la première unité marquée détruite chaque tour inflige 1 dégât au Navire adverse", () => {
    const pasSansMoi = instance("pas-sans-moi", "p1");
    const m1 = marque(instance("murene-aveugle", "p1"));
    const m2 = marque(instance("murene-aveugle", "p1"));
    const crabe = instance("crabe-de-fer", "p2");
    const depart = table({ board: [pasSansMoi, m1, m2] }, { board: [crabe] });
    const ancrage = joueur(depart, "p2").anchor;
    const r1 = seJeterSurLeCrabe(depart, m1, crabe);
    ok(r1);
    expect(joueur(r1.state, "p2").anchor).toBe(ancrage - 1);
    const r2 = seJeterSurLeCrabe(r1.state, m2, crabe);
    ok(r2);
    expect(joueur(r2.state, "p2").anchor).toBe(ancrage - 1);
  });

  it("Ceux d'en bas : une unité qui arrive marquée sur votre plateau fait piocher 1 carte", () => {
    const ceux = instance("ceux-den-bas", "p1", { turnsRemaining: 4 });
    const reveil = instance("reveille-toi", "p1");
    const loup = instance("vieux-loup-de-mer", "p1");
    const r = jouer(table({ hand: [reveil], board: [ceux], graveyard: [loup] }), reveil);
    ok(r);
    const main = joueur(r.state).hand.length;
    const pris = prendre(r.state, loup.instanceId);
    ok(pris);
    expect(joueur(pris.state).hand.length).toBe(main + 1);
  });

  it("Le Cerf-volant : n'équipe qu'un Mort-vivant — une unité marquée en est un", () => {
    const cerfVolant = getCardDefinition("le-cerf-volant");
    const libre = instance("marin-des-jetees", "p1");
    const marquee = marque(instance("marin-des-jetees", "p1"));
    const ptitBout = instance("ptit-bout", "p1");
    const board = [libre, marquee, ptitBout];
    expect(canBeEquipTarget(cerfVolant, board, libre)).toBe(false);
    expect(canBeEquipTarget(cerfVolant, board, marquee)).toBe(true);
    expect(canBeEquipTarget(cerfVolant, board, ptitBout)).toBe(true);
  });

  it("Le Cerf-volant : +1 / +1 au porteur, et sa mort fait piocher puis défausser", () => {
    const cerf = instance("le-cerf-volant", "p1");
    const ptitBout = instance("ptit-bout", "p1");
    const r = jouer(table({ hand: [cerf], board: [ptitBout] }), cerf, ptitBout.instanceId);
    ok(r);
    expect(stats(r.state, ptitBout.instanceId)).toMatchObject({ attack: 1 + 1, health: 2 + 1 });
  });
});

describe("cartes de plateau : emplacements condamnés et ajoutés", () => {
  const capacite = (state: GameState, id: string) => boardCapacity(state, joueur(state, id));
  // Le Brise-Lames (p1) a 6 emplacements, Le Goliath (p2) 5.

  it("Y'a plus de place ! condamne un emplacement libre adverse pendant 3 tours de table", () => {
    const objet = instance("ya-plus-de-place", "p1");
    const r = dispatch(table({ board: [objet] }), { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    ok(r);
    expect(capacite(r.state, "p2")).toBe(4);
    // Trois tours de table plus tard (six tours de jeu), à l'entame du tour de p1, l'emplacement est libre.
    expect(capacite({ ...r.state, turnNumber: r.state.turnNumber + 5 }, "p2")).toBe(4);
    expect(capacite({ ...r.state, turnNumber: r.state.turnNumber + 6 }, "p2")).toBe(5);
  });

  it("Y'a plus de place ! n'a rien à condamner sur un terrain plein", () => {
    const objet = instance("ya-plus-de-place", "p1");
    const plein = Array.from({ length: 5 }, () => instance("marin-des-jetees", "p2"));
    const r = dispatch(table({ board: [objet] }, { board: plein }), { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    ok(r);
    expect(joueur(r.state, "p2").slotEffects ?? []).toHaveLength(0);
  });

  it("un emplacement condamné empêche de poser une carte de plus", () => {
    const objet = instance("ya-plus-de-place", "p1");
    const quatre = Array.from({ length: 4 }, () => instance("marin-des-jetees", "p2"));
    const pose = instance("marin-des-jetees", "p2");
    const r = dispatch(table({ board: [objet] }, { board: quatre, hand: [pose] }), { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    ok(r);
    const tourAdverse: GameState = { ...r.state, activePlayerId: "p2", priorityPlayerId: "p2", phase: "mainPhase" };
    expect(dispatch(tourAdverse, { type: "playCard", playerId: "p2", instanceId: pose.instanceId }).ok).toBe(false);
  });

  it("Le Barrage des Égarés condamne tant qu'il est en jeu ; Place au Large libère la condamnation", () => {
    const barrage = instance("le-barrage-des-egares", "p1");
    const r = jouer(table({ hand: [barrage] }), barrage);
    ok(r);
    expect(capacite(r.state, "p2")).toBe(4);
    // La Structure partie, l'emplacement se libère.
    const sansBarrage: GameState = { ...r.state, players: r.state.players.map((p) => (p.id === "p1" ? { ...p, board: [] } : p)) as GameState["players"] };
    expect(capacite(sansBarrage, "p2")).toBe(5);

    // Place au Large, jouée par p2 : la condamnation tombe, sans pioche.
    const place = instance("place-au-large", "p2");
    const tourAdverse: GameState = {
      ...r.state,
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: r.state.players.map((p) => (p.id === "p2" ? { ...p, board: [place] } : p)) as GameState["players"],
    };
    const main = joueur(tourAdverse, "p2").hand.length;
    const libere = dispatch(tourAdverse, { type: "breakObject", playerId: "p2", instanceId: place.instanceId });
    ok(libere);
    expect(capacite(libere.state, "p2")).toBe(5);
    expect(joueur(libere.state, "p2").hand.length).toBe(main);
  });

  it("Place au Large sans emplacement condamné : piochez 1 carte", () => {
    const place = instance("place-au-large", "p1");
    const state = table({ board: [place] });
    const main = joueur(state).hand.length;
    const r = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: place.instanceId });
    ok(r);
    expect(joueur(r.state).hand.length).toBe(main + 1);
  });

  it("Le Pont Sans Fin ajoute 1 emplacement pendant 3 tours de table ; à son terme, la carte posée dessus part au Cimetière", () => {
    const pont = instance("le-pont-sans-fin", "p1");
    const six = Array.from({ length: 5 }, (_, i) => instance("marin-des-jetees", "p1", { slot: i }));
    const r = dispatch(table({ board: [pont, ...six] }), { type: "breakObject", playerId: "p1", instanceId: pont.instanceId });
    ok(r);
    expect(capacite(r.state, "p1")).toBe(7);
    const septieme = instance("vieux-loup-de-mer", "p1", { slot: 6 });
    const plein: GameState = {
      ...r.state,
      players: r.state.players.map((p) => (p.id === "p1" ? { ...p, board: [...p.board, instance("marin-des-jetees", "p1", { slot: 5 }), septieme] } : p)) as GameState["players"],
    };
    // Juste avant l'échéance : fin du tour de p2, l'entame du tour de p1 fait tomber l'emplacement.
    const avant: GameState = enFinDeTour({ ...plein, turnNumber: r.state.turnNumber + 5, activePlayerId: "p2", priorityPlayerId: "p2", phase: "mainPhase2" });
    const fin = dispatch(avant, { type: "endTurn", playerId: "p2" });
    ok(fin);
    expect(capacite(fin.state, "p1")).toBe(6);
    expect(unite(fin.state, septieme.instanceId)).toBeUndefined();
    expect(joueur(fin.state).graveyard.some((c) => c.instanceId === septieme.instanceId)).toBe(true);
    expect(joueur(fin.state).board).toHaveLength(6);
  });
});
