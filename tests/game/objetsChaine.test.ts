import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { resolveChainLink } from "@/game/chain/chainStack";
import { createLoopGuard, positionFingerprint } from "@/game/rules/loopGuard";
import type { CardInstance } from "@/game/cards/types";
import type { GameEvent } from "@/game/events/types";
import type { GameState, PlayerState } from "@/game/state/types";
import { instance, pendingCandidates, testGameState, testPlayer } from "./testHelpers";

/**
 * REFONTE DES OBJETS (13/10/2026, Notion « Règles & conventions ») :
 * - un Objet classique se JOUE depuis la main, exige un emplacement libre
 *   sans jamais s'y poser, et se résout aussitôt — Brisé s'il aboutit ;
 * - un Objet « Chaîne » se joue sans emplacement, dans la fenêtre que décrit
 *   son texte, et peut répondre à un autre Chaîne (pile LIFO) ;
 * - annulé ou sans cible légale : ni Bris ni synergie de Bris, la carte part
 *   au Cimetière et son coût reste payé.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string): PlayerState => state.players.find((p) => p.id === id)!;
const auCimetiere = (state: GameState, id: string, card: CardInstance) => joueur(state, id).graveyard.some((c) => c.instanceId === card.instanceId);
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
/** Six Péons : le plateau du Brise-Lames est plein. */
const plateauPlein = (ownerId: string) => Array.from({ length: 6 }, () => instance("peon-cra-poiscail", ownerId));

function table(p1: Partial<PlayerState> = {}, p2: Partial<PlayerState> = {}, overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }), testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 })],
    ...overrides,
  });
}

describe("Objet classique", () => {
  it("avec un emplacement libre : il se joue, se résout aussitôt, est Brisé et part au Cimetière sans occuper d'emplacement", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const r = dispatch(table({ hand: [thermos], reason: 8 }), { type: "playCard", playerId: "p1", instanceId: thermos.instanceId });
    ok(r);
    expect(joueur(r.state, "p1").board).toHaveLength(0);
    expect(auCimetiere(r.state, "p1", thermos)).toBe(true);
    // 8 − 2 (coût) + 2 (effet).
    expect(joueur(r.state, "p1").reason).toBe(8);
    expect(types(r.events)).toEqual(expect.arrayContaining(["PLAY_CARD", "OBJECT_PLAYED", "OBJECT_BROKEN", "CHAIN_LINK_RESOLVED"]));
    expect(r.state.chainStack).toBeUndefined();
    expect(r.state.pendingReaction).toBeUndefined();
  });

  it("plateau plein : il ne se joue pas", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const r = dispatch(table({ hand: [thermos], board: plateauPlein("p1") }), { type: "playCard", playerId: "p1", instanceId: thermos.instanceId });
    expect(r.ok).toBe(false);
  });

  it("sa cible devenue illégale : il part au Cimetière sans être Brisé, son coût reste payé", () => {
    const harpon = instance("coup-de-harpon", "p1");
    const state = table({}, {}, {
      chainStack: [{ id: harpon.instanceId, playerId: "p1", card: harpon, targetInstanceId: "partie-entre-temps", turnNumber: 3 }],
    });
    const r = resolveChainLink({ ...state, chainStack: undefined }, state.chainStack![0]!);
    expect(types(r.events)).toContain("OBJECT_FIZZLED");
    expect(types(r.events)).not.toContain("OBJECT_BROKEN");
    expect(auCimetiere(r.state, "p1", harpon)).toBe(true);
  });

  it("Brisé : TOUS les déclencheurs de Bris éligibles se déclenchent, chacun dans sa limite par tour", () => {
    const medecin = instance("cra-poiscail-medecin", "p1");
    const ramasseur = instance("cra-poiscail-ramasseur", "p1");
    const t1 = instance("thermos-du-dernier-quart", "p1");
    const t2 = instance("thermos-du-dernier-quart", "p1");
    const depart = table({ board: [medecin, ramasseur], hand: [t1, t2], anchor: 20 });
    const r1 = dispatch(depart, { type: "playCard", playerId: "p1", instanceId: t1.instanceId });
    ok(r1);
    expect(joueur(r1.state, "p1").anchor).toBe(21);
    const r2 = dispatch(r1.state, { type: "playCard", playerId: "p1", instanceId: t2.instanceId });
    ok(r2);
    // « La première fois à chaque tour » : le second Bris ne rend rien de plus.
    expect(joueur(r2.state, "p1").anchor).toBe(21);
  });
});

describe("taxe sur le premier Objet adverse joué", () => {
  it("Cloche d'Alerte : +1 Raison, et l'Objet est injouable si son joueur ne peut pas payer", () => {
    const cloche = instance("cloche-dalerte", "p2");
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const refuse = dispatch(table({ hand: [thermos], reason: 2 }, { board: [cloche] }), { type: "playCard", playerId: "p1", instanceId: thermos.instanceId });
    expect(refuse.ok).toBe(false);

    const paye = dispatch(table({ hand: [thermos], reason: 5 }, { board: [cloche] }), { type: "playCard", playerId: "p1", instanceId: thermos.instanceId });
    ok(paye);
    // 5 − 3 (coût + taxe) + 3 (Thermos : 2 Raison ou moins après paiement → 3).
    expect(joueur(paye.state, "p1").reason).toBe(5);
  });
});

describe("Objet Chaîne", () => {
  it("plateau plein : il se joue quand même depuis la main dans la fenêtre de son texte", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const assaillant = instance("peon-cra-poiscail", "p2");
    const defenseur = instance("peon-cra-poiscail", "p1");
    const state = table(
      { hand: [harpon], board: [defenseur, ...plateauPlein("p1").slice(1)] },
      { board: [assaillant] },
      { activePlayerId: "p2", priorityPlayerId: "p2", phase: "combatPhase", turnNumber: 4 }
    );
    const attaque = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: assaillant.instanceId, defenderInstanceId: defenseur.instanceId });
    ok(attaque);
    expect(attaque.state.pendingReaction?.awaitingPlayerId).toBe("p1");
    const candidat = pendingCandidates(attaque.state).find((c) => c.cardId === "harpon-a-ressort");
    expect(candidat).toMatchObject({ fromHand: true, reasonCost: 4 });

    const reponse = dispatch(attaque.state, { type: "activateReaction", playerId: "p1", sourceInstanceId: harpon.instanceId, abilityIndex: 0 });
    ok(reponse);
    expect(types(reponse.events)).toContain("OBJECT_BROKEN");
    expect(auCimetiere(reponse.state, "p1", harpon)).toBe(true);
    // 2 dégâts à l'assaillant 1/1 : il ne frappe pas.
    expect(joueur(reponse.state, "p2").board.some((u) => u.instanceId === assaillant.instanceId)).toBe(false);
  });

  it("hors de sa fenêtre, il ne se joue pas comme un Objet classique", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const r = dispatch(table({ hand: [harpon] }), { type: "playCard", playerId: "p1", instanceId: harpon.instanceId });
    expect(r.ok).toBe(false);
  });

  it("Sabotage Discret : l'Objet adverse est annulé — pas de Bris, pas de synergie, Cimetière, coût payé", () => {
    const medecin = instance("cra-poiscail-medecin", "p1");
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const sabotage = instance("sabotage-discret", "p2");
    const joue = dispatch(table({ board: [medecin], hand: [thermos], reason: 8, anchor: 20 }, { hand: [sabotage] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: thermos.instanceId,
    });
    ok(joue);
    // L'Objet attend sur la pile : l'adversaire peut lui répondre.
    expect(joue.state.chainStack).toHaveLength(1);
    expect(joue.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    expect(joueur(joue.state, "p1").reason).toBe(6);

    const annule = dispatch(joue.state, { type: "activateReaction", playerId: "p2", sourceInstanceId: sabotage.instanceId, abilityIndex: 0 });
    ok(annule);
    expect(annule.state.chainStack).toBeUndefined();
    expect(annule.events.find((e) => e.type === "OBJECT_FIZZLED")).toMatchObject({ instanceId: thermos.instanceId, reason: "cancelled" });
    expect(annule.events.some((e) => e.type === "OBJECT_BROKEN" && e.instanceId === thermos.instanceId)).toBe(false);
    expect(auCimetiere(annule.state, "p1", thermos)).toBe(true);
    expect(auCimetiere(annule.state, "p2", sabotage)).toBe(true);
    // Coût payé, effet perdu, et le Médecin n'a rien vu.
    expect(joueur(annule.state, "p1").reason).toBe(6);
    expect(joueur(annule.state, "p1").anchor).toBe(20);
  });

  it("une Chaîne répond à une Chaîne : résolution LIFO", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const contre = instance("sabotage-discret", "p1");
    const sabotage = instance("sabotage-discret", "p2");
    const joue = dispatch(table({ hand: [thermos, contre], reason: 10 }, { hand: [sabotage] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: thermos.instanceId,
    });
    ok(joue);
    const repond = dispatch(joue.state, { type: "activateReaction", playerId: "p2", sourceInstanceId: sabotage.instanceId, abilityIndex: 0 });
    ok(repond);
    // Le Sabotage de p2 est sur la pile, au-dessus du Thermos : p1 peut y répondre.
    expect(repond.state.chainStack?.map((l) => l.card.instanceId)).toEqual([thermos.instanceId, sabotage.instanceId]);
    expect(repond.state.pendingReaction?.awaitingPlayerId).toBe("p1");

    const contreAttaque = dispatch(repond.state, { type: "activateReaction", playerId: "p1", sourceInstanceId: contre.instanceId, abilityIndex: 0 });
    ok(contreAttaque);
    const resolus = contreAttaque.events.filter((e) => e.type === "CHAIN_LINK_RESOLVED").map((e) => (e as { instanceId: string }).instanceId);
    // Le dernier joué se résout d'abord.
    expect(resolus).toEqual([contre.instanceId, sabotage.instanceId, thermos.instanceId]);
    expect(contreAttaque.events.find((e) => e.type === "OBJECT_FIZZLED")).toMatchObject({ instanceId: sabotage.instanceId, reason: "cancelled" });
    expect(contreAttaque.events.some((e) => e.type === "OBJECT_BROKEN" && e.instanceId === thermos.instanceId)).toBe(true);
    // 10 − 2 (Thermos) − 4 (Sabotage) + 2.
    expect(joueur(contreAttaque.state, "p1").reason).toBe(6);
  });

  it("personne ne peut répondre : aucune fenêtre ne s'ouvre", () => {
    const thermos = instance("thermos-du-dernier-quart", "p1");
    const sabotage = instance("sabotage-discret", "p2");
    // Le Sabotage de p1 ne répond qu'à un Objet ADVERSE : jouer le sien n'ouvre rien.
    const r = dispatch(table({ hand: [thermos, sabotage] }), { type: "playCard", playerId: "p1", instanceId: thermos.instanceId });
    ok(r);
    expect(r.state.pendingReaction).toBeUndefined();
  });
});

describe("anti-boucle", () => {
  it("une position déjà vue est reconnue, une position qui progresse ne l'est pas", () => {
    const vue = createLoopGuard();
    const a = table({ anchor: 20 });
    expect(vue(a)).toBe(false);
    expect(vue({ ...a, eventLog: [...a.eventLog, { type: "PHASE_CHANGED", turnNumber: 3, timestamp: 0, phase: "mainPhase" } as GameEvent] })).toBe(true);
    expect(vue(table({ anchor: 19 }))).toBe(false);
  });

  it("l'empreinte ignore l'identité des exemplaires : un corps rappelé à l'identique est la même position", () => {
    const un = table({}, { board: [instance("peon-cra-poiscail", "p2")] });
    const autre = table({}, { board: [instance("peon-cra-poiscail", "p2")] });
    expect(positionFingerprint(un)).toBe(positionFingerprint(autre));
  });
});
