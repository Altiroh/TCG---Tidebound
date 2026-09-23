import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 15 — ÉQUIPAGE DE VERRE : survivre aux dégâts fait progresser.
 *
 * Tout passe par `dispatch`, comme en partie : « survivre » ne se sait
 * qu'APRÈS la passe de morts, et c'est précisément ce que ces tests
 * vérifient — une unité qui meurt de ses dégâts n'a pas survécu, une unité
 * qui les encaisse progresse, une seule fois par tour.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const puissance = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id)).attack;
};
const resistance = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id)).health;
};

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
  });
}

/** Brise un Objet posé sur le plateau de p1, sur une cible. */
function briser(state: GameState, objet: CardInstance, targetInstanceId?: string) {
  return dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

describe("survivre à des dégâts", () => {
  it("Matelot Fêlé gagne +1 Puissance CONSERVÉE en survivant, une seule fois par tour", () => {
    const matelot = instance("matelot-fele", "p1");
    const eclat1 = instance("eclat-de-bouteille", "p1");
    const eclat2 = instance("eclat-de-bouteille", "p1");
    let state = table({ board: [matelot, eclat1, eclat2] });

    const r1 = briser(state, eclat1, matelot.instanceId);
    ok(r1);
    state = r1.state;
    expect(unite(state, matelot.instanceId)!.damageMarked).toBe(1);
    expect(puissance(state, matelot.instanceId)).toBe(3);

    // Deuxième survie le même tour : « la première fois à chaque tour ».
    const r2 = briser(state, eclat2, matelot.instanceId);
    ok(r2);
    expect(puissance(r2.state, matelot.instanceId)).toBe(3);

    // Le gain est conservé : il survit au changement de tour.
    const fin = dispatch(r2.state, { type: "endTurn", playerId: "p1" });
    ok(fin);
    expect(puissance(fin.state, matelot.instanceId)).toBe(3);
  });

  it("une unité tuée par ses dégâts n'a pas survécu : aucun gain", () => {
    const matelot = instance("matelot-fele", "p1", { damageMarked: 2 });
    const vigie = instance("vigie-aux-fissures", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = briser(table({ board: [matelot, vigie, eclat], hand: [instance("matelot-fele", "p1")] }), eclat, matelot.instanceId);
    ok(r);
    expect(unite(r.state, matelot.instanceId)).toBeUndefined();
    // La Vigie ne pioche pas pour une unité qui n'a pas survécu.
    expect(r.state.pendingChoice).toBeUndefined();
  });

  it("Éclaireur Ébréché se fêle au début de votre tour, et en tire +2 Puissance", () => {
    const eclaireur = instance("eclaireur-ebreche", "p1");
    // C'est au tour de p2 : la fin de SON tour ouvre celui de p1.
    const state = testGameState({
      ...table({ board: [eclaireur], deck: [instance("matelot-fele", "p1")] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      turnNumber: 2,
    });
    const r = dispatch(state, { type: "endTurn", playerId: "p2" });
    ok(r);
    expect(unite(r.state, eclaireur.instanceId)!.damageMarked).toBe(1);
    expect(puissance(r.state, eclaireur.instanceId)).toBe(3);
  });

  it("Vigie aux Fissures : une AUTRE unité qui survit fait piocher puis défausser", () => {
    const vigie = instance("vigie-aux-fissures", "p1");
    const matelot = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const pioche = instance("matelot-fele", "p1");
    const r = briser(table({ board: [vigie, matelot, eclat], deck: [pioche], hand: [instance("duelliste-de-verre", "p1")] }), eclat, matelot.instanceId);
    ok(r);
    expect(joueur(r.state, "p1").hand.some((c) => c.instanceId === pioche.instanceId)).toBe(true);
    expect(r.state.pendingChoice?.kind).toBe("handDiscard");
  });

  it("Duelliste de Verre a +1 Puissance tant qu'il est blessé", () => {
    const duelliste = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const state = table({ board: [duelliste] });
    expect(puissance(state, duelliste.instanceId)).toBe(3);
  });

  it("Bretteuse au Bord subit 1 dégât APRÈS son attaque, et progresse si elle survit", () => {
    const bretteuse = instance("bretteuse-au-bord", "p1");
    const state = testGameState({ ...table({ board: [bretteuse] }), phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: bretteuse.instanceId });
    ok(r);
    expect(joueur(r.state, "p2").anchor).toBe(joueur(state, "p2").anchor - 4);
    expect(unite(r.state, bretteuse.instanceId)!.damageMarked).toBe(1);
    expect(puissance(r.state, bretteuse.instanceId)).toBe(5);
  });

  it("La Grande Fissure prend Garde à 3 Résistance ou moins", () => {
    const fissure = instance("la-grande-fissure", "p1", { damageMarked: 3 });
    let state = table({ board: [fissure] });
    expect(hasEffectiveKeyword(state, joueur(state, "p1"), fissure, "garde")).toBe(false);
    const blessee = { ...fissure, damageMarked: 4 };
    state = table({ board: [blessee] });
    expect(hasEffectiveKeyword(state, joueur(state, "p1"), blessee, "garde")).toBe(true);
  });
});

describe("Maître Verrier et Pont de Verre : « des dégâts infligés par l'un de VOS effets »", () => {
  it("Maître Verrier rend 1 Raison quand une de vos unités survit à VOTRE effet — pas au combat", () => {
    const maitre = instance("maitre-verrier", "p1");
    const matelot = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const state = table({ board: [maitre, matelot, eclat], reason: 5 });
    const r = briser(state, eclat, matelot.instanceId);
    ok(r);
    expect(joueur(r.state, "p1").reason).toBe(6);

    // Au combat : aucune Raison.
    const combat = testGameState({ ...table({ board: [instance("maitre-verrier", "p1"), matelot], reason: 5 }, { board: [instance("matelot-fele", "p2")] }), phase: "combatPhase" });
    const cible = joueur(combat, "p2").board[0]!;
    const c = dispatch(combat, { type: "attack", playerId: "p1", attackerInstanceId: matelot.instanceId, defenderInstanceId: cible.instanceId });
    ok(c);
    expect(joueur(c.state, "p1").reason).toBe(5);
  });

  it("Pont de Verre propose de restaurer 1 Résistance à une AUTRE unité blessée", () => {
    const pont = instance("pont-de-verre", "p1", { turnsRemaining: 4 });
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 2 });
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = briser(table({ board: [pont, matelot, blesse, eclat] }), eclat, matelot.instanceId);
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("pont-de-verre");
    // Le survivant lui-même n'est pas « une autre unité ».
    const refus = activateReactionFor(r.state, "pont-de-verre", matelot.instanceId);
    expect(refus.ok).toBe(false);
    const soin = activateReactionFor(r.state, "pont-de-verre", blesse.instanceId);
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(1);
  });
});

describe("gestes du Verre", () => {
  it("Verrier de Pont : blesse un allié, puis soigne une AUTRE unité blessée s'il survit", () => {
    const verrier = instance("verrier-de-pont", "p1");
    const matelot = instance("matelot-fele", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const state = table({ board: [verrier, matelot, blesse] });
    const r = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: verrier.instanceId, targetInstanceId: matelot.instanceId });
    ok(r);
    const choix = r.state.pendingChoice;
    expect(choix?.kind).toBe("pickUnits");
    // La cible blessée n'est pas proposée : « une AUTRE unité ».
    expect(choix?.kind === "pickUnits" && choix.among).not.toContain(matelot.instanceId);
    const soin = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [blesse.instanceId] } });
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(0);
    expect(unite(soin.state, matelot.instanceId)!.damageMarked).toBe(1);
  });

  it("Verrier de Pont : si la cible ne survit pas, rien n'est restauré", () => {
    const verrier = instance("verrier-de-pont", "p1");
    const fragile = instance("eclaireur-ebreche", "p1", { damageMarked: 1 });
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 1 });
    const r = dispatch(table({ board: [verrier, fragile, blesse] }), {
      type: "activateAbility",
      playerId: "p1",
      sourceInstanceId: verrier.instanceId,
      targetInstanceId: fragile.instanceId,
    });
    ok(r);
    expect(r.state.pendingChoice).toBeUndefined();
    expect(unite(r.state, fragile.instanceId)).toBeUndefined();
  });

  it("Canonnier Fêlé : se fêle à la pose, vise une unité adverse, et progresse d'avoir tenu", () => {
    const canonnier = instance("canonnier-fele", "p1");
    const cible = instance("vieille-selle", "p2");
    const r = dispatch(table({ hand: [canonnier] }, { board: [cible] }), { type: "playCard", playerId: "p1", instanceId: canonnier.instanceId });
    ok(r);
    expect(unite(r.state, canonnier.instanceId)!.damageMarked).toBe(1);
    expect(puissance(r.state, canonnier.instanceId)).toBe(4);
    const tir = activateReactionFor(r.state, "canonnier-fele", cible.instanceId);
    ok(tir);
    expect(unite(tir.state, cible.instanceId)!.damageMarked).toBe(2);
  });

  it("Canonnier Fêlé se joue face à un plateau vide", () => {
    const canonnier = instance("canonnier-fele", "p1");
    const r = dispatch(table({ hand: [canonnier] }), { type: "playCard", playerId: "p1", instanceId: canonnier.instanceId });
    ok(r);
  });

  it("Porte-Éclats : l'allié qui devait tomber sous les dégâts reste à 1 Résistance", () => {
    const porte = instance("porte-eclats", "p1");
    const matelot = instance("matelot-fele", "p1", { damageMarked: 2 });
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = briser(table({ board: [porte, matelot, eclat] }), eclat, matelot.instanceId);
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("porte-eclats");
    const sauve = activateReactionFor(r.state, "porte-eclats");
    ok(sauve);
    expect(unite(sauve.state, matelot.instanceId)).toBeDefined();
    expect(resistance(sauve.state, matelot.instanceId) - unite(sauve.state, matelot.instanceId)!.damageMarked).toBe(1);
    expect(unite(sauve.state, porte.instanceId)!.damageMarked).toBe(1);
  });

  it("Polisseuse des Fêlures propose, au début du tour, 1 Résistance à une autre unité blessée", () => {
    const polisseuse = instance("polisseuse-des-felures", "p1");
    const blesse = instance("duelliste-de-verre", "p1", { damageMarked: 2 });
    const state = testGameState({
      ...table({ board: [polisseuse, blesse], deck: [instance("matelot-fele", "p1")] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      turnNumber: 2,
    });
    const r = dispatch(state, { type: "endTurn", playerId: "p2" });
    ok(r);
    const soin = activateReactionFor(r.state, "polisseuse-des-felures", blesse.instanceId);
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(1);
  });

  it("Encore Debout ? blesse une unité blessée, puis lui restaure 2 si elle tient", () => {
    const cible = instance("vieille-selle", "p2", { damageMarked: 2 });
    const objet = instance("encore-debout", "p1");
    const r = briser(table({ board: [objet] }, { board: [cible] }), objet, cible.instanceId);
    ok(r);
    expect(unite(r.state, cible.instanceId)!.damageMarked).toBe(1);
  });

  it("Trinquer Trop Fort touche jusqu'à deux unités", () => {
    const a = instance("matelot-fele", "p2");
    const b = instance("matelot-fele", "p2");
    const objet = instance("trinquer-trop-fort", "p1");
    const r = briser(table({ board: [objet] }, { board: [a, b] }), objet);
    ok(r);
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [a.instanceId, b.instanceId] } });
    ok(choix);
    expect(unite(choix.state, a.instanceId)!.damageMarked).toBe(1);
    expect(unite(choix.state, b.instanceId)!.damageMarked).toBe(1);
  });

  it("Bouclier Fendu : +2 Résistance MAXIMALE, et Sabordé il restaure 2 à son porteur", () => {
    const porteur = instance("matelot-fele", "p1", { damageMarked: 3 });
    const bouclier = instance("bouclier-fendu", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = table({ board: [porteur, bouclier] });
    expect(resistance(state, porteur.instanceId)).toBe(5);
    const r = dispatch(state, { type: "saborder", playerId: "p1", instanceId: bouclier.instanceId });
    ok(r);
    // Le Bouclier parti, la Résistance retombe à 3 — mais 2 dégâts ont été
    // restaurés avant : le porteur tient.
    expect(unite(r.state, porteur.instanceId)!.damageMarked).toBe(1);
    expect(resistance(r.state, porteur.instanceId)).toBe(3);
  });
});

describe("Jusqu'à ce que ça casse", () => {
  it("propose 1 dégât de plus à l'unité qui survit, et redéclenche ses effets de survie", () => {
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    const matelot = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = briser(table({ board: [anomalie, matelot, eclat] }), eclat, matelot.instanceId);
    ok(r);
    expect(puissance(r.state, matelot.instanceId)).toBe(3);
    const encore = activateReactionFor(r.state, "jusqua-ce-que-ca-casse");
    ok(encore);
    expect(unite(encore.state, matelot.instanceId)!.damageMarked).toBe(2);
    // Survie redéclenchée malgré « une fois par tour » : +1 de plus.
    expect(puissance(encore.state, matelot.instanceId)).toBe(4);
  });

  it("ne se propose qu'une fois par unité, et part au Cimetière à la fin du tour", () => {
    const anomalie = instance("jusqua-ce-que-ca-casse", "p1");
    const matelot = instance("matelot-fele", "p1");
    const e1 = instance("eclat-de-bouteille", "p1");
    const e2 = instance("eclat-de-bouteille", "p1");
    let r = briser(table({ board: [anomalie, matelot, e1, e2], deck: [instance("matelot-fele", "p1")] }), e1, matelot.instanceId);
    ok(r);
    r = activateReactionFor(r.state, "jusqua-ce-que-ca-casse");
    ok(r);
    // Une fenêtre encore ouverte se passe avant de continuer.
    let state = r.state;
    while (state.pendingReaction) {
      const p = dispatch(state, { type: "passReaction", playerId: state.pendingReaction.awaitingPlayerId });
      ok(p);
      state = p.state;
    }
    const second = briser(state, e2, matelot.instanceId);
    ok(second);
    expect(pendingCandidates(second.state).map((c) => c.cardId)).not.toContain("jusqua-ce-que-ca-casse");
    let fin = second.state;
    while (fin.pendingReaction) {
      const p = dispatch(fin, { type: "passReaction", playerId: fin.pendingReaction.awaitingPlayerId });
      ok(p);
      fin = p.state;
    }
    const tour = dispatch(fin, { type: "endTurn", playerId: "p1" });
    ok(tour);
    expect(unite(tour.state, anomalie.instanceId)).toBeUndefined();
    expect(joueur(tour.state, "p1").graveyard.some((c) => c.instanceId === anomalie.instanceId)).toBe(true);
  });
});
