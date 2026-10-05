import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { getCardDefinition } from "@/game/cards/sets/core";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { nextInt } from "@/game/rng";
import type { CardInstance } from "@/game/cards/types";
import type { DieSize, GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 17 — Dungeon et Ladalle / Opalins.
 *
 * Tout passe par `dispatch`. Les jets sont rendus déterministes en choisissant
 * la graine (`rngState`) qui donne la face voulue : le moteur, lui, ne sait
 * rien du test. Ce qui est vérifié : un jet sans option se résout seul ; un
 * jet qu'une carte peut encore changer reste OUVERT (la Chaîne) et ses
 * critiques ne se lisent qu'à la fermeture ; l'Armure du Navire absorbe les
 * dégâts avant l'Ancrage ; la lignée LV évolue ; le texte ignoré éteint une
 * carte ; les réductions « du tour » de l'Île-Tortue.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

/** Graine dont le premier tirage d'un dé à `die` faces donne `face`. */
function graine(die: DieSize, face: number): number {
  for (let s = 1; s < 100_000; s += 1) if (nextInt(s, die).value + 1 === face) return s;
  throw new Error(`aucune graine pour ${face} sur D${die}`);
}

const joueur = (state: GameState, id = "p1") => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const stats = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id));
};

const piedMarin = (state: GameState, instanceId: string) =>
  hasEffectiveKeyword(state, joueur(state, unite(state, instanceId)!.ownerId), unite(state, instanceId)!, "pied-marin");

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

describe("jets de dé : la face lue par la carte, les critiques à la fermeture", () => {
  it("Gaston sur 6 : +6/+0 tant qu'il reste en jeu, et Pied marin ce tour (Réussite critique)", () => {
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const r = jouer(table({ hand: [gaston] }, {}, { rngState: graine(6, 6) }), gaston);
    ok(r);
    // Aucune carte ne peut changer le jet : il s'est résolu tout seul.
    expect(r.state.pendingChoice).toBeUndefined();
    expect(stats(r.state, gaston.instanceId).attack).toBe(3 + 6);
    expect(piedMarin(r.state, gaston.instanceId)).toBe(true);
    expect(r.events.some((e) => e.type === "DIE_RESOLVED" && e.value === 6 && e.outcome === "criticalSuccess")).toBe(true);
  });

  it("Gaston sur 1 : +1/+0 et 1 dégât (Échec critique), sans Pied marin", () => {
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const r = jouer(table({ hand: [gaston] }, {}, { rngState: graine(6, 1) }), gaston);
    ok(r);
    expect(stats(r.state, gaston.instanceId).attack).toBe(4);
    expect(unite(r.state, gaston.instanceId)!.damageMarked).toBe(1);
    expect(piedMarin(r.state, gaston.instanceId)).toBe(false);
  });

  it("Dé pipé en main : le jet reste ouvert, le Bris le porte de 5 à 6 et la Réussite critique se lit à la fermeture", () => {
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const de = instance("de-pipe", "p1");
    const r = jouer(table({ hand: [gaston, de] }, {}, { rngState: graine(6, 5) }), gaston);
    ok(r);
    expect(r.state.pendingChoice).toMatchObject({ kind: "dieRoll", value: 5 });
    // Rien n'est encore appliqué : la Chaîne est ouverte.
    expect(stats(r.state, gaston.instanceId).attack).toBe(3);

    const brise = dispatch(r.state, { type: "breakObject", playerId: "p1", instanceId: de.instanceId, fromHand: true, dieDelta: 1 });
    ok(brise);
    expect(joueur(brise.state).graveyard.some((c) => c.instanceId === de.instanceId)).toBe(true);
    // Plus aucune option : la Chaîne se ferme d'elle-même sur 6.
    expect(brise.state.pendingChoice).toBeUndefined();
    expect(stats(brise.state, gaston.instanceId).attack).toBe(3 + 6);
    expect(piedMarin(brise.state, gaston.instanceId)).toBe(true);
  });

  it("le joueur peut fermer la Chaîne sans rien briser : le résultat reste le sien", () => {
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const de = instance("de-pipe", "p1");
    const r = jouer(table({ hand: [gaston, de] }, {}, { rngState: graine(6, 5) }), gaston);
    ok(r);
    const ferme = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { dieResolve: true } });
    ok(ferme);
    expect(ferme.state.pendingChoice).toBeUndefined();
    expect(stats(ferme.state, gaston.instanceId).attack).toBe(3 + 5);
    expect(joueur(ferme.state).hand.some((c) => c.instanceId === de.instanceId)).toBe(true);
  });

  it("un Objet Chaîne ne se brise pas hors d'un jet", () => {
    const de = instance("de-pipe", "p1");
    const r = dispatch(table({ hand: [de] }), { type: "breakObject", playerId: "p1", instanceId: de.instanceId, fromHand: true, dieDelta: 1 });
    expect(r.ok).toBe(false);
  });

  it("Le Donjon de Ladalle : le premier jet du tour peut être relancé, et le nouveau résultat est gardé", () => {
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const env = testEnvironment({ lande: { instanceId: "lande_p1", cardId: "le-donjon-de-ladalle", ownerId: "p1", remainingPlayerTurns: 4 } });
    const r = jouer(table({ hand: [gaston] }, {}, { rngState: graine(6, 2), environment: env }), gaston);
    ok(r);
    expect(r.state.pendingChoice).toMatchObject({ kind: "dieRoll", value: 2 });
    const relance = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { dieReroll: true } });
    ok(relance);
    const resolu = relance.events.find((e) => e.type === "DIE_RESOLVED");
    expect(resolu).toBeDefined();
    if (resolu?.type !== "DIE_RESOLVED") return;
    expect(resolu.rolls).toHaveLength(2);
    // Le nouveau résultat remplace l'ancien : c'est lui que Gaston gagne.
    expect(stats(relance.state, gaston.instanceId).attack).toBe(3 + resolu.value);
  });

  it("Miss Franche-Comté 1987 : une fois par tour, +1 ou -1 sur l'un de vos jets", () => {
    const miss = instance("miss-franche-comte-1987-roublarde-aux-des-pipes", "p1");
    const gaston = instance("gaston-aventurier-de-ladalle", "p1");
    const r = jouer(table({ hand: [gaston], board: [miss] }, {}, { rngState: graine(6, 3) }), gaston);
    ok(r);
    expect(r.state.pendingChoice).toMatchObject({ kind: "dieRoll", value: 3 });
    const ajuste = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { dieAdjust: { sourceInstanceId: miss.instanceId, delta: 1 } } });
    ok(ajuste);
    expect(ajuste.state.pendingChoice).toBeUndefined();
    expect(stats(ajuste.state, gaston.instanceId).attack).toBe(3 + 4);
  });
});

describe("Armure : une réserve du Navire, entamée avant l'Ancrage", () => {
  it("Velm donne 3 Armure ; une attaque directe la vide puis entame l'Ancrage", () => {
    const velm = instance("velm-opalin-des-armures", "p1");
    const pose = jouer(table({ hand: [velm] }), velm);
    ok(pose);
    expect(joueur(pose.state).armor).toBe(3);
    // « Votre Navire gagne de l'Armure » : Velm désigne l'Opaline qui se renforce (lui-même).
    expect(pose.state.pendingChoice?.kind).toBe("pickUnits");
    const r = dispatch(pose.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [velm.instanceId] } });
    ok(r);
    expect(stats(r.state, velm.instanceId).health).toBe(6 + 1);

    const brute = instance("hubert-paladin-persuade-d-etre-l-elu", "p2");
    const puissance = getCardDefinition(brute.cardId).attack!;
    const ancrage = joueur(r.state).anchor;
    const tourAdverse: GameState = {
      ...r.state,
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      phase: "combatPhase",
      // Velm, à peine posé, ne garde pas (aucun mot-clé) : la voie est libre.
      players: [r.state.players[0], { ...r.state.players[1], board: [brute] }],
    };
    const attaque = dispatch(tourAdverse, { type: "attack", playerId: "p2", attackerInstanceId: brute.instanceId });
    ok(attaque);
    expect(joueur(attaque.state).armor ?? 0).toBe(0);
    expect(joueur(attaque.state).anchor).toBe(ancrage - (puissance - 3));
  });

  it("Hubert sur 1 : perdez 2 Armure ; faute d'Armure, Hubert subit le reste", () => {
    const hubert = instance("hubert-paladin-persuade-d-etre-l-elu", "p1");
    const r = jouer(table({ hand: [hubert] }, {}, { rngState: graine(6, 1) }), hubert);
    ok(r);
    // +1 Armure (la face), puis -2 : 1 absorbé, 1 sur Hubert.
    expect(joueur(r.state).armor ?? 0).toBe(0);
    expect(unite(r.state, hubert.instanceId)!.damageMarked).toBe(1);
  });
});

describe("la lignée LV et l'Île-Tortue Opaline", () => {
  it("Eidolon LV1 à 1 marqueur : la fin du tour pose le second et le remplace par LV5 tiré de la pioche, qui donne 2 Armure", () => {
    const lv1 = instance("eidolon-opalin-lv1", "p1", { levelMarkers: 1 });
    const lv5 = instance("eidolon-opalin-lv5", "p1");
    const state = table({ board: [lv1], deck: [lv5, ...Array.from({ length: 5 }, () => instance("marin-des-jetees", "p1"))] });
    const r = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(r);
    const p1 = joueur(r.state);
    expect(p1.board.some((u) => u.instanceId === lv1.instanceId)).toBe(false);
    expect(p1.graveyard.some((c) => c.instanceId === lv1.instanceId)).toBe(true);
    expect(p1.board.some((u) => u.cardId === "eidolon-opalin-lv5")).toBe(true);
    expect(p1.armor).toBe(2);
  });

  it("Eidolon LVX ne se joue pas depuis la main", () => {
    const lvx = instance("eidolon-opalin-lvx-abyssal", "p1");
    const r = jouer(table({ hand: [lvx], reason: 10 }), lvx);
    expect(r.ok).toBe(false);
  });

  it("Île-Tortue : la première carte Opaline à 5 ou plus coûte 1 de moins, et le premier Opalin arrivé donne 1 Armure", () => {
    const seren = instance("seren-opalin-du-silence", "p1");
    const taverne = instance("la-taverne-avant-le-donjon", "p2");
    const state = table({ shipId: "ile-tortue-opaline", hand: [seren], reason: 8, reasonMax: 8 }, { board: [taverne] });
    const r = jouer(state, seren, taverne.instanceId);
    ok(r);
    expect(joueur(r.state).reason).toBe(8 - (5 - 1));
    expect(joueur(r.state).armor).toBe(1);
  });
});

describe("texte ignoré", () => {
  it("Seren éteint la Structure adverse désignée jusqu'au début de votre prochain tour", () => {
    const seren = instance("seren-opalin-du-silence", "p1");
    const taverne = instance("la-taverne-avant-le-donjon", "p2");
    const r = jouer(table({ hand: [seren] }, { board: [taverne] }), seren, taverne.instanceId);
    ok(r);
    const cible = unite(r.state, taverne.instanceId)!;
    expect(cible.modifiers.some((m) => m.textIgnored)).toBe(true);
  });
});
