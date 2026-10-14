import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats, auraContextOf } from "@/game/cards/stats";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { processDeaths } from "@/game/state/processDeaths";
import { slotsUsed } from "@/game/rules/ongoing";
import type { CardInstance } from "@/game/cards/types";
import type { GameState, PlayerState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * REFONTE DES ÉQUIPEMENTS (13/10/2026, Notion « Règles & mécaniques
 * verrouillées » et « Spécification technique — Refonte finale des
 * Équipements ») :
 * - un Équipement s'attache à sa carte sans prendre de Slot, un seul par porteur ;
 * - sa Résistance imprimée s'ajoute au maximum (donc à l'actuelle) du porteur,
 *   les dégâts restent sur le porteur ;
 * - détruit avec son porteur ; au Cimetière, sans destruction, quand le porteur
 *   retourne en main ; détruit seul, il retire ses bonus et le porteur peut mourir ;
 * - Voile : une destruction du porteur évitée, l'Équipement détruit à sa place,
 *   le porteur à 1 Résistance.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string): PlayerState => state.players.find((p) => p.id === id)!;
const surPlateau = (state: GameState, id: string, card: CardInstance) => joueur(state, id).board.find((c) => c.instanceId === card.instanceId);
const auCimetiere = (state: GameState, id: string, card: CardInstance) => joueur(state, id).graveyard.find((c) => c.instanceId === card.instanceId);
const resistanceMax = (state: GameState, id: string, card: CardInstance) =>
  computeEffectiveStats(surPlateau(state, id, card)!, state.environment.tideState, auraContextOf(state, id)).health;
const destructions = (events: readonly { type: string; instanceId?: string }[], card: CardInstance) =>
  events.filter((e) => e.type === "DESTROY" && e.instanceId === card.instanceId).length;

function table(p1: Partial<PlayerState> = {}, p2: Partial<PlayerState> = {}, overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }), testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 })],
    ...overrides,
  });
}

/** Six Péons : le plateau du Brise-Lames est plein. */
const plateauPlein = () => Array.from({ length: 6 }, () => instance("peon-cra-poiscail", "p1"));

describe("attachement", () => {
  it("plateau plein : l'Équipement s'attache sans consommer d'emplacement", () => {
    const peons = plateauPlein();
    const harpon = instance("harpon-de-pont", "p1");
    const r = dispatch(table({ board: peons, hand: [harpon] }), { type: "playCard", playerId: "p1", instanceId: harpon.instanceId, targetInstanceId: peons[0]!.instanceId });
    ok(r);
    expect(surPlateau(r.state, "p1", harpon)?.attachedToInstanceId).toBe(peons[0]!.instanceId);
    expect(surPlateau(r.state, "p1", harpon)?.slot).toBeUndefined();
    expect(slotsUsed(joueur(r.state, "p1").board)).toBe(6);
  });

  it("refuse un deuxième Équipement sur un porteur déjà équipé", () => {
    const porteur = instance("vieux-loup-de-mer", "p1");
    const premier = instance("harpon-de-pont", "p1", { attachedToInstanceId: porteur.instanceId });
    const second = instance("harnois-de-vigie", "p1");
    const r = dispatch(table({ board: [porteur, premier], hand: [second] }), { type: "playCard", playerId: "p1", instanceId: second.instanceId, targetInstanceId: porteur.instanceId });
    expect(r.ok).toBe(false);
  });

  it("Structure : légale seulement si le texte de l'Équipement la désigne", () => {
    const structure = instance("le-trone-de-bouchon", "p1");
    const treuil = instance("treuil-rouille", "p1");
    const plaque = instance("plaque-de-fortune", "p1");
    const state = table({ board: [structure], hand: [treuil, plaque] });
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: plaque.instanceId, targetInstanceId: structure.instanceId }).ok).toBe(false);
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: treuil.instanceId, targetInstanceId: structure.instanceId });
    ok(r);
    expect(resistanceMax(r.state, "p1", structure)).toBe(4 + 2);
  });

  it("un Équipement n'est ni une cible d'unité, ni attaquable", () => {
    const porteur = instance("vieux-loup-de-mer", "p2");
    const harpon = instance("harpon-de-pont", "p2", { attachedToInstanceId: porteur.instanceId });
    const attaquant = instance("requin-balafre", "p1");
    const r = dispatch(table({ board: [attaquant] }, { board: [porteur, harpon] }, { phase: "combatPhase" }), {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: harpon.instanceId,
    });
    expect(r.ok).toBe(false);
  });
});

describe("Résistance fusionnée", () => {
  it("la Résistance imprimée s'ajoute au maximum et à l'actuelle, et repart avec l'Équipement", () => {
    const porteur = instance("vieux-loup-de-mer", "p1"); // 2/4
    const harpon = instance("harpon-de-pont", "p1"); // Résistance 2
    const r = dispatch(table({ board: [porteur], hand: [harpon] }), { type: "playCard", playerId: "p1", instanceId: harpon.instanceId, targetInstanceId: porteur.instanceId });
    ok(r);
    expect(resistanceMax(r.state, "p1", porteur)).toBe(6);
    const cordages = instance("coupez-les-cordages", "p1");
    const r2 = dispatch({ ...r.state, players: r.state.players.map((p) => (p.id === "p1" ? { ...p, hand: [cordages] } : p)) as GameState["players"] }, {
      type: "playCard",
      playerId: "p1",
      instanceId: cordages.instanceId,
      targetInstanceId: harpon.instanceId,
    });
    ok(r2);
    expect(auCimetiere(r2.state, "p1", harpon)).toBeDefined();
    expect(resistanceMax(r2.state, "p1", porteur)).toBe(4);
  });

  it("porteur blessé, puis Équipement détruit : les dégâts restent, et il meurt s'ils l'emportent", () => {
    const porteur = instance("vieux-loup-de-mer", "p2", { damageMarked: 5 }); // 2/4 + 2 = 6, reste 1
    const harpon = instance("harpon-de-pont", "p2", { attachedToInstanceId: porteur.instanceId });
    const cordages = instance("coupez-les-cordages", "p1");
    const r = dispatch(table({ hand: [cordages] }, { board: [porteur, harpon] }), { type: "playCard", playerId: "p1", instanceId: cordages.instanceId, targetInstanceId: harpon.instanceId });
    ok(r);
    expect(surPlateau(r.state, "p2", porteur)).toBeUndefined();
    expect(auCimetiere(r.state, "p2", harpon)?.graveyardCause).toBe("destroyed");
    expect(destructions(r.events, harpon)).toBe(1);
    expect(destructions(r.events, porteur)).toBe(1);
  });
});

describe("destruction et départs", () => {
  it("le porteur détruit emporte son Équipement, une destruction chacun", () => {
    const porteur = instance("vieux-loup-de-mer", "p1", { pendingRemoval: "destroyed" });
    const harpon = instance("harpon-de-pont", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = processDeaths(table({ board: [porteur, harpon] }), 3);
    expect(auCimetiere(r.state, "p1", porteur)).toBeDefined();
    expect(auCimetiere(r.state, "p1", harpon)?.graveyardCause).toBe("destroyed");
    expect(destructions(r.events, porteur)).toBe(1);
    expect(destructions(r.events, harpon)).toBe(1);
  });

  it("renvoi du porteur en main : l'Équipement rejoint le Cimetière, sans destruction ni retour en main", () => {
    const porteur = instance("vieux-loup-de-mer", "p2");
    const harpon = instance("harpon-de-pont", "p2", { attachedToInstanceId: porteur.instanceId });
    const renvoi = instance("par-dessus-bord", "p1");
    const r = dispatch(table({ hand: [renvoi] }, { board: [porteur, harpon] }), { type: "playCard", playerId: "p1", instanceId: renvoi.instanceId, targetInstanceId: porteur.instanceId });
    ok(r);
    expect(joueur(r.state, "p2").hand.map((c) => c.cardId)).toEqual(["vieux-loup-de-mer"]);
    expect(auCimetiere(r.state, "p2", harpon)?.graveyardCause).toBe("detached");
    expect(destructions(r.events, harpon)).toBe(0);
  });

  it("déclencheurs sans doublon : Doudou pioche une fois quand porteur et Équipement partent ensemble", () => {
    const porteur = instance("ptit-bout", "p1", { pendingRemoval: "destroyed" });
    const doudou = instance("doudou", "p1", { attachedToInstanceId: porteur.instanceId });
    const pioche = [instance("marin-des-jetees", "p1"), instance("marin-des-jetees", "p1")];
    const r = processDeaths(table({ board: [porteur, doudou], deck: pioche }), 3);
    expect(joueur(r.state, "p1").hand).toHaveLength(1);
  });

  it("déclencheurs sans doublon : Chaîne de Fer Noir ne coûte qu'1 Raison à la mort de sa Créature", () => {
    const porteur = instance("requin-balafre", "p1", { pendingRemoval: "destroyed" });
    const chaine = instance("chaine-de-fer-noir", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = processDeaths(table({ board: [porteur, chaine], reason: 5 }), 3);
    expect(joueur(r.state, "p1").reason).toBe(4);
  });
});

describe("cartes vérifiées sans réécriture", () => {
  it("Harnais de Retenue : un renvoi adverse le détruit à la place ; le porteur garde sa place et perd sa Résistance", () => {
    const porteur = instance("vieux-loup-de-mer", "p2"); // 2/4, +2 du Harnais
    const harnais = instance("harnais-de-retenue", "p2", { attachedToInstanceId: porteur.instanceId });
    const renvoi = instance("par-dessus-bord", "p1");
    const r = dispatch(table({ hand: [renvoi] }, { board: [porteur, harnais] }), { type: "playCard", playerId: "p1", instanceId: renvoi.instanceId, targetInstanceId: porteur.instanceId });
    ok(r);
    expect(surPlateau(r.state, "p2", porteur)).toBeDefined();
    expect(auCimetiere(r.state, "p2", harnais)?.graveyardCause).toBe("destroyed");
    expect(resistanceMax(r.state, "p2", porteur)).toBe(4);
  });

  it("Harnais de Retenue : un porteur blessé que la perte du bonus tue est détruit", () => {
    const porteur = instance("vieux-loup-de-mer", "p2", { damageMarked: 5 });
    const harnais = instance("harnais-de-retenue", "p2", { attachedToInstanceId: porteur.instanceId });
    const renvoi = instance("par-dessus-bord", "p1");
    const r = dispatch(table({ hand: [renvoi] }, { board: [porteur, harnais] }), { type: "playCard", playerId: "p1", instanceId: renvoi.instanceId, targetInstanceId: porteur.instanceId });
    ok(r);
    expect(surPlateau(r.state, "p2", porteur)).toBeUndefined();
    expect(joueur(r.state, "p2").hand).toHaveLength(0);
  });
});

describe("Voile", () => {
  it("contre des dégâts mortels : l'Équipement est détruit à la place, le porteur reste à 1 Résistance", () => {
    const porteur = instance("vieux-loup-de-mer", "p1", { damageMarked: 5 }); // 2/4 + Plaque 1 = 5 : mortel
    const plaque = instance("plaque-de-fortune", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = processDeaths(table({ board: [porteur, plaque] }), 3);
    const sauve = surPlateau(r.state, "p1", porteur)!;
    expect(sauve).toBeDefined();
    expect(auCimetiere(r.state, "p1", plaque)?.graveyardCause).toBe("destroyed");
    expect(resistanceMax(r.state, "p1", porteur) - sauve.damageMarked).toBe(1);
    expect(r.events.some((e) => e.type === "VEIL_CONSUMED")).toBe(true);
  });

  it("contre une destruction directe", () => {
    const porteur = instance("vieux-loup-de-mer", "p1", { pendingRemoval: "destroyed" });
    const plaque = instance("plaque-de-fortune", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = processDeaths(table({ board: [porteur, plaque] }), 3);
    expect(surPlateau(r.state, "p1", porteur)?.pendingRemoval).toBeUndefined();
    expect(resistanceMax(r.state, "p1", porteur) - surPlateau(r.state, "p1", porteur)!.damageMarked).toBe(1);
  });

  it("deux destructions successives : Voile n'en prévient qu'une", () => {
    const porteur = instance("vieux-loup-de-mer", "p1", { pendingRemoval: "destroyed" });
    const plaque = instance("plaque-de-fortune", "p1", { attachedToInstanceId: porteur.instanceId });
    const premiere = processDeaths(table({ board: [porteur, plaque] }), 3);
    const encore = {
      ...premiere.state,
      players: premiere.state.players.map((p) =>
        p.id === "p1" ? { ...p, board: p.board.map((u) => (u.instanceId === porteur.instanceId ? { ...u, pendingRemoval: "destroyed" as const } : u)) } : p
      ) as GameState["players"],
    };
    const seconde = processDeaths(encore, 3);
    expect(surPlateau(seconde.state, "p1", porteur)).toBeUndefined();
  });

  it("ne protège pas d'une destruction de l'Équipement lui-même", () => {
    const porteur = instance("vieux-loup-de-mer", "p2", { damageMarked: 4 }); // 4/5, reste 1 avec la Plaque
    const plaque = instance("plaque-de-fortune", "p2", { attachedToInstanceId: porteur.instanceId });
    const cordages = instance("coupez-les-cordages", "p1");
    const r = dispatch(table({ hand: [cordages] }, { board: [porteur, plaque] }), { type: "playCard", playerId: "p1", instanceId: cordages.instanceId, targetInstanceId: plaque.instanceId });
    ok(r);
    expect(r.events.some((e) => e.type === "VEIL_CONSUMED")).toBe(false);
    expect(surPlateau(r.state, "p2", porteur)).toBeUndefined();
  });

  it("ne protège pas du Sabordage du porteur", () => {
    const porteur = instance("vieux-loup-de-mer", "p1");
    const plaque = instance("plaque-de-fortune", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = dispatch(table({ board: [porteur, plaque] }), { type: "saborder", playerId: "p1", instanceId: porteur.instanceId });
    ok(r);
    expect(surPlateau(r.state, "p1", porteur)).toBeUndefined();
    expect(r.events.some((e) => e.type === "VEIL_CONSUMED")).toBe(false);
  });
});

describe("transfert par effet", () => {
  const transferer = (state: GameState, equipement: CardInstance, vers: string) =>
    resolveEffect(state, { type: "transferEquipment", target: { kind: "chosenUnit" } }, { controllerId: "p1", sourceInstanceId: equipement.instanceId, chosenTargetInstanceId: vers, turnNumber: 3 });

  it("passe sur un porteur non équipé : le bonus suit l'Équipement", () => {
    const ancien = instance("vieux-loup-de-mer", "p1");
    const nouveau = instance("vieux-loup-de-mer", "p1");
    const harpon = instance("harpon-de-pont", "p1", { attachedToInstanceId: ancien.instanceId });
    const r = transferer(table({ board: [ancien, nouveau, harpon] }), harpon, nouveau.instanceId);
    expect(surPlateau(r.state, "p1", harpon)?.attachedToInstanceId).toBe(nouveau.instanceId);
    expect(resistanceMax(r.state, "p1", ancien)).toBe(4);
    expect(resistanceMax(r.state, "p1", nouveau)).toBe(6);
  });

  it("refusé vers un porteur déjà équipé : rien ne bouge", () => {
    const ancien = instance("vieux-loup-de-mer", "p1");
    const nouveau = instance("vieux-loup-de-mer", "p1");
    const harpon = instance("harpon-de-pont", "p1", { attachedToInstanceId: ancien.instanceId });
    const harnois = instance("harnois-de-vigie", "p1", { attachedToInstanceId: nouveau.instanceId });
    const r = transferer(table({ board: [ancien, nouveau, harpon, harnois] }), harpon, nouveau.instanceId);
    expect(surPlateau(r.state, "p1", harpon)?.attachedToInstanceId).toBe(ancien.instanceId);
  });

  it("l'ancien porteur que le retrait du bonus tue part selon les règles ordinaires", () => {
    const ancien = instance("vieux-loup-de-mer", "p1", { damageMarked: 5 });
    const nouveau = instance("vieux-loup-de-mer", "p1");
    const harpon = instance("harpon-de-pont", "p1", { attachedToInstanceId: ancien.instanceId });
    const r = transferer(table({ board: [ancien, nouveau, harpon] }), harpon, nouveau.instanceId);
    const morts = processDeaths(r.state, 3);
    expect(surPlateau(morts.state, "p1", ancien)).toBeUndefined();
    expect(surPlateau(morts.state, "p1", harpon)?.attachedToInstanceId).toBe(nouveau.instanceId);
  });
});

describe("compatibilité avec les Objets et la Chaîne", () => {
  it("Sabotage Discret annule Coupez les Cordages : l'Équipement et son bonus restent", () => {
    const porteur = instance("vieux-loup-de-mer", "p2");
    const harpon = instance("harpon-de-pont", "p2", { attachedToInstanceId: porteur.instanceId });
    const cordages = instance("coupez-les-cordages", "p1");
    const sabotage = instance("sabotage-discret", "p2");
    const joue = dispatch(table({ hand: [cordages] }, { board: [porteur, harpon], hand: [sabotage] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: cordages.instanceId,
      targetInstanceId: harpon.instanceId,
    });
    ok(joue);
    const annule = dispatch(joue.state, { type: "activateReaction", playerId: "p2", sourceInstanceId: sabotage.instanceId, abilityIndex: 0 });
    ok(annule);
    expect(surPlateau(annule.state, "p2", harpon)).toBeDefined();
    expect(resistanceMax(annule.state, "p2", porteur)).toBe(6);
  });

  it("Bouclier Fendu : le Sabordage d'un Équipement n'est pas un Bris d'Objet", () => {
    const porteur = instance("vieux-loup-de-mer", "p1");
    const bouclier = instance("bouclier-fendu", "p1", { attachedToInstanceId: porteur.instanceId });
    const r = dispatch(table({ board: [porteur, bouclier] }), { type: "saborder", playerId: "p1", instanceId: bouclier.instanceId });
    ok(r);
    expect(r.events.some((e) => e.type === "OBJECT_BROKEN")).toBe(false);
    expect(auCimetiere(r.state, "p1", bouclier)?.graveyardCause).toBe("scuttled");
  });
});
