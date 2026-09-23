import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { toPlayerView } from "@/game/state/playerView";
import { HIDDEN_CARD_ID } from "@/game/cards/hiddenCard";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 15 — CAVALERIE : des Bêtes lourdes, peu nombreuses, et juste assez
 * d'anti-Garde pour apprendre que le contre existe.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const stats = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id));
};

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, extra: Partial<GameState> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
    ...extra,
  });
}

/** Termine les fenêtres de réaction ouvertes, en passant. */
function passerTout(state: GameState): GameState {
  let s = state;
  while (s.pendingReaction) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

describe("combat et Garde", () => {
  it("Monture de Brèche frappe plus fort une unité qui a Garde — et seulement elle", () => {
    const monture = instance("monture-de-breche", "p1");
    const rempart = instance("le-dernier-rempart", "p2");
    const state = table({ board: [monture] }, { board: [rempart] }, { phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: monture.instanceId, defenderInstanceId: rempart.instanceId });
    ok(r);
    expect(unite(r.state, rempart.instanceId)!.damageMarked).toBe(3);
  });

  it("Bête de Percée retire Garde à une unité adverse jusqu'à la fin du tour", () => {
    const percee = instance("bete-de-percee", "p1");
    const rempart = instance("le-dernier-rempart", "p2");
    const r = dispatch(table({ hand: [percee] }, { board: [rempart] }), { type: "playCard", playerId: "p1", instanceId: percee.instanceId });
    ok(r);
    const perce = activateReactionFor(r.state, "bete-de-percee", rempart.instanceId);
    ok(perce);
    expect(hasEffectiveKeyword(perce.state, joueur(perce.state, "p2"), unite(perce.state, rempart.instanceId)!, "garde")).toBe(false);
    const fin = dispatch(passerTout(perce.state), { type: "endTurn", playerId: "p1" });
    ok(fin);
    expect(hasEffectiveKeyword(fin.state, joueur(fin.state, "p2"), unite(fin.state, rempart.instanceId)!, "garde")).toBe(true);
  });

  it("Débusquer ouvre la coque adverse : l'attaque directe redevient légale", () => {
    const attaquant = instance("monture-de-breche", "p1");
    const debusquer = instance("debusquer", "p1");
    const rempart = instance("le-dernier-rempart", "p2");
    let state = table({ board: [attaquant, debusquer] }, { board: [rempart] });
    const b = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: debusquer.instanceId, targetInstanceId: rempart.instanceId });
    ok(b);
    state = { ...b.state, phase: "combatPhase" };
    const a = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(a);
    expect(joueur(a.state, "p2").anchor).toBe(joueur(state, "p2").anchor - 2);
  });

  it("Ouvrez la Ligne ! : +2 contre la Garde, pour ce seul combat", () => {
    const attaquant = instance("destrier-du-ressac", "p1");
    const autre = instance("matelot-fele", "p1");
    const objet = instance("ouvrez-la-ligne", "p1");
    const rempart = instance("le-dernier-rempart", "p2");
    const b = dispatch(table({ board: [attaquant, autre, objet] }, { board: [rempart] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: objet.instanceId,
      targetInstanceId: attaquant.instanceId,
    });
    ok(b);
    // Rien de visible avant le combat : le bonus attend.
    expect(stats(b.state, attaquant.instanceId).attack).toBe(3);
    const a = dispatch({ ...b.state, phase: "combatPhase" }, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: rempart.instanceId,
    });
    ok(a);
    expect(unite(a.state, rempart.instanceId)!.damageMarked).toBe(5);
    expect(unite(a.state, attaquant.instanceId)!.modifiers.some((m) => m.nextCombatBonusVsKeyword)).toBe(false);
  });

  it("Mufle au Fanion a Garde tant qu'il est blessé", () => {
    const mufle = instance("mufle-au-fanion", "p1");
    const state = table({ board: [mufle] });
    expect(hasEffectiveKeyword(state, joueur(state, "p1"), mufle, "garde")).toBe(false);
    const blesse = { ...mufle, damageMarked: 1 };
    const s2 = table({ board: [blesse] });
    expect(hasEffectiveKeyword(s2, joueur(s2, "p1"), blesse, "garde")).toBe(true);
  });

  it("Pas un Pas de Plus : une attaque directe déclarée, une Garde qui se lève — l'attaque ne passe pas", () => {
    const attaquant = instance("destrier-du-ressac", "p1");
    const piege = instance("pas-un-pas-de-plus", "p2");
    const defenseur = instance("matelot-fele", "p2");
    const state = table({ board: [attaquant] }, { board: [piege, defenseur] }, { phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(r);
    expect(r.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    const garde = activateReactionFor(r.state, "pas-un-pas-de-plus", defenseur.instanceId);
    ok(garde);
    expect(joueur(garde.state, "p2").anchor).toBe(joueur(state, "p2").anchor);
    expect(hasEffectiveKeyword(garde.state, joueur(garde.state, "p2"), unite(garde.state, defenseur.instanceId)!, "garde")).toBe(true);
    // L'attaquant n'a rien dépensé : il peut encore viser la Garde.
    expect(unite(garde.state, attaquant.instanceId)!.hasAttackedThisTurn).toBe(false);
  });
});

describe("Bêtes et remplacements", () => {
  it("Bête de Halage perd 1 Résistance au lieu d'être détruite par un effet adverse, une fois par tour", () => {
    const halage = instance("bete-de-halage", "p2");
    // La Mer Reprend Tout (« Détruisez toutes les unités en jeu ») puis
    // Dernier Jour en Mer (« Détruisez une unité … adverse »), le même tour.
    const raz = instance("la-mer-reprend-tout", "p1");
    const coup = instance("dernier-jour-en-mer", "p1");
    const r = dispatch(table({ hand: [raz, coup], reason: 20, reasonMax: 20 }, { board: [halage] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: raz.instanceId,
    });
    ok(r);
    expect(unite(r.state, halage.instanceId)).toBeDefined();
    expect(stats(r.state, halage.instanceId).health).toBe(3);

    const second = dispatch(r.state, { type: "playCard", playerId: "p1", instanceId: coup.instanceId, targetInstanceId: halage.instanceId });
    ok(second);
    expect(unite(second.state, halage.instanceId)).toBeUndefined();
  });

  it("Bête de Halage : un renvoi adverse se remplace aussi par 1 Résistance", () => {
    const halage = instance("bete-de-halage", "p2");
    const renvoi = instance("par-dessus-bord", "p1");
    const r = dispatch(table({ hand: [renvoi] }, { board: [halage] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: renvoi.instanceId,
      targetInstanceId: halage.instanceId,
    });
    ok(r);
    expect(unite(r.state, halage.instanceId)).toBeDefined();
    expect(stats(r.state, halage.instanceId).health).toBe(3);
    expect(joueur(r.state, "p2").hand).toHaveLength(0);
  });

  it("Harnais de Retenue se détruit à la place d'un renvoi adverse", () => {
    const renvoi = instance("par-dessus-bord", "p1");
    // Par-dessus Bord ! vise une unité de coût 3 ou moins.
    const leger = instance("destrier-du-ressac", "p2");
    const harnaisLeger = instance("harnais-de-retenue", "p2", { attachedToInstanceId: leger.instanceId });
    const r = dispatch(table({ hand: [renvoi] }, { board: [leger, harnaisLeger] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: renvoi.instanceId,
      targetInstanceId: leger.instanceId,
    });
    ok(r);
    expect(unite(r.state, leger.instanceId)).toBeDefined();
    expect(unite(r.state, harnaisLeger.instanceId)).toBeUndefined();
  });

  it("Vieille-Selle réduit de 1 un coup de 3 ou plus, jamais un coup plus petit", () => {
    const selle = instance("vieille-selle", "p2");
    const gros = instance("le-deserteur-gris", "p1");
    const petit = instance("matelot-fele", "p1");
    const state = table({ board: [gros, petit] }, { board: [selle] }, { phase: "combatPhase" });
    const r1 = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: gros.instanceId, defenderInstanceId: selle.instanceId });
    ok(r1);
    expect(unite(r1.state, selle.instanceId)!.damageMarked).toBe(5);
    const r2 = dispatch(r1.state, { type: "attack", playerId: "p1", attackerInstanceId: petit.instanceId, defenderInstanceId: selle.instanceId });
    ok(r2);
    expect(unite(r2.state, selle.instanceId)!.damageMarked).toBe(6);
  });

  it("Mange-Fer grandit quand une Structure adverse est détruite", () => {
    const mangeFer = instance("mange-fer", "p1");
    const attaquant = instance("destrier-du-ressac", "p1");
    const structure = instance("pont-de-verre", "p2", { turnsRemaining: 4 });
    const state = table({ board: [mangeFer, attaquant] }, { board: [structure] }, { phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: structure.instanceId });
    ok(r);
    expect(unite(r.state, structure.instanceId)).toBeUndefined();
    expect(stats(r.state, mangeFer.instanceId).attack).toBe(6);
  });
});

describe("Bêtes et conditions", () => {
  it("Éclaireur à Cornes montre le dessus de la pioche adverse, et peut l'enterrer", () => {
    const eclaireur = instance("eclaireur-a-cornes", "p1");
    const dessus = instance("mange-fer", "p2");
    const dessous = instance("matelot-fele", "p2");
    const r = dispatch(table({ hand: [eclaireur] }, { deck: [dessus, dessous] }), { type: "playCard", playerId: "p1", instanceId: eclaireur.instanceId });
    ok(r);
    const choix = r.state.pendingChoice;
    expect(choix?.kind).toBe("deckTopDecision");
    // L'adversaire ne voit pas ce que l'Éclaireur regarde.
    const vueAdverse = toPlayerView(r.state, "p2").pendingChoice;
    expect(vueAdverse?.kind === "deckTopDecision" && vueAdverse.card.cardId).toBe(HIDDEN_CARD_ID);
    const enterre = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { deckTop: "bottom" } });
    ok(enterre);
    expect(joueur(enterre.state, "p2").deck.map((c) => c.instanceId)).toEqual([dessous.instanceId, dessus.instanceId]);
  });

  it("Destrier du Ressac a +1 Puissance seul, et le perd dès qu'un allié arrive", () => {
    const destrier = instance("destrier-du-ressac", "p1");
    expect(stats(table({ board: [destrier] }), destrier.instanceId).attack).toBe(4);
    expect(stats(table({ board: [destrier, instance("matelot-fele", "p1")] }), destrier.instanceId).attack).toBe(3);
  });

  it("Chargeur des Écueils a Pied marin s'il arrive en retard d'unités", () => {
    const chargeur = instance("chargeur-des-ecueils", "p1");
    const r = dispatch(table({ hand: [chargeur] }, { board: [instance("matelot-fele", "p2"), instance("matelot-fele", "p2")] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: chargeur.instanceId,
    });
    ok(r);
    expect(hasEffectiveKeyword(r.state, joueur(r.state, "p1"), unite(r.state, chargeur.instanceId)!, "pied-marin")).toBe(true);

    const egal = dispatch(table({ hand: [chargeur] }, { board: [instance("matelot-fele", "p2")] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: chargeur.instanceId,
    });
    ok(egal);
    expect(hasEffectiveKeyword(egal.state, joueur(egal.state, "p1"), unite(egal.state, chargeur.instanceId)!, "pied-marin")).toBe(false);
  });

  it("Le Déserteur Gris rentre en main à la fin du tour s'il a au moins 3 autres unités", () => {
    const deserteur = instance("le-deserteur-gris", "p1");
    const autres = [instance("matelot-fele", "p1"), instance("matelot-fele", "p1"), instance("matelot-fele", "p1")];
    const r = dispatch(table({ board: [deserteur, ...autres] }, { deck: [instance("matelot-fele", "p2")] }), { type: "endTurn", playerId: "p1" });
    ok(r);
    expect(unite(r.state, deserteur.instanceId)).toBeUndefined();
    expect(joueur(r.state, "p1").hand.some((c) => c.cardId === "le-deserteur-gris")).toBe(true);

    const reste = dispatch(table({ board: [deserteur, ...autres.slice(0, 2)] }, { deck: [instance("matelot-fele", "p2")] }), { type: "endTurn", playerId: "p1" });
    ok(reste);
    expect(unite(reste.state, deserteur.instanceId)).toBeDefined();
  });

  it("La Bête qu'on n'attend plus rend 2 Ancrage quand la coque est en retard", () => {
    const bete = instance("la-bete-quon-nattend-plus", "p1");
    const state = table({ hand: [bete], anchor: 20 });
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: bete.instanceId });
    ok(r);
    expect(joueur(r.state, "p1").anchor).toBe(22);
  });

  it("Selle de Guerre : +1 Puissance, et +1 Résistance sur un porteur de coût 4 ou plus", () => {
    const leger = instance("destrier-du-ressac", "p1");
    const lourd = instance("mange-fer", "p1");
    const s1 = instance("selle-de-guerre", "p1", { attachedToInstanceId: leger.instanceId });
    const s2 = instance("selle-de-guerre", "p1", { attachedToInstanceId: lourd.instanceId });
    const state = table({ board: [leger, s1, lourd, s2] });
    expect([stats(state, leger.instanceId).attack, stats(state, leger.instanceId).health]).toEqual([4, 5]);
    expect([stats(state, lourd.instanceId).attack, stats(state, lourd.instanceId).health]).toEqual([6, 8]);
  });

  it("La Mauvaise Réputation : la prochaine unité coûte 1 de moins et arrive blessée", () => {
    const anomalie = instance("la-mauvaise-reputation", "p1");
    const bete = instance("mange-fer", "p1");
    const r1 = dispatch(table({ hand: [anomalie, bete], reason: 10 }), { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    ok(r1);
    const avant = joueur(r1.state, "p1").reason;
    const r2 = dispatch(r1.state, { type: "playCard", playerId: "p1", instanceId: bete.instanceId });
    ok(r2);
    expect(avant - joueur(r2.state, "p1").reason).toBe(4);
    expect(unite(r2.state, bete.instanceId)!.damageMarked).toBe(1);
  });
});
