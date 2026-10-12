import { describe, expect, it } from "vitest";
import { dispatch, type GameState } from "@/game";
import { QUALIFICATIONS, effectiveQualifications, qualificationLabel, type CardQualification } from "@/game/cards/qualifications";
import { getCardDefinition } from "@/game/cards/sets/core";
import { attacksAllowed, attacksRemaining } from "@/game/rules/qualificationCombat";
import { computeEffectiveStats } from "@/game/cards/stats";
import { getShipDefinition } from "@/game/environment/shipData";
import type { CardInstance } from "@/game/cards/types";
import { instance, testGameState, testPlayer } from "@/tests/game/testHelpers";

/**
 * QUALIFICATIONS — chacune jouée par `dispatch`, sur des unités sans
 * capacité écrite (Matelot du Sans-Nom 3/4, Murène Aveugle 3/1, Poisson aux
 * Dents de Verre 2/3, Charpentier de Bord 2/3, P'tite Fesse 1/2). La
 * qualification est accordée par un MODIFICATEUR — la voie générique, sans
 * toucher à aucune carte du catalogue.
 */

function avec(unit: CardInstance, ...qualifications: CardQualification[]): CardInstance {
  return { ...unit, modifiers: [...unit.modifiers, { id: `q_${unit.instanceId}`, source: "unknown", attack: 0, health: 0, duration: "permanent", qualifications }] };
}
function garde(unit: CardInstance): CardInstance {
  return { ...unit, modifiers: [...unit.modifiers, { id: `g_${unit.instanceId}`, source: "unknown", attack: 0, health: 0, duration: "permanent", keywords: ["garde"] }] };
}

function table(mine: CardInstance[], theirs: CardInstance[], p1: Partial<GameState["players"][0]> = {}, p2: Partial<GameState["players"][1]> = {}): GameState {
  return {
    ...testGameState({ players: [testPlayer("p1", { board: mine, ...p1 }), testPlayer("p2", { shipId: "le-goliath", board: theirs, ...p2 })] }),
    phase: "combatPhase",
  };
}

function attaque(state: GameState, attackerInstanceId: string, defenderInstanceId?: string) {
  return dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId, defenderInstanceId });
}
function ok(state: GameState, attackerInstanceId: string, defenderInstanceId?: string): GameState {
  const result = attaque(state, attackerInstanceId, defenderInstanceId);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const board = (state: GameState, playerId: "p1" | "p2") => state.players.find((p) => p.id === playerId)!.board;
const joueur = (state: GameState, playerId: "p1" | "p2") => state.players.find((p) => p.id === playerId)!;
const ancrage = (state: GameState, playerId: "p1" | "p2") => joueur(state, playerId).anchor;

describe("registre des qualifications", () => {
  it("onze qualifications validées, chacune avec nom, description, glyphe et types compatibles", () => {
    expect(Object.keys(QUALIFICATIONS).sort()).toEqual(
      ["breche", "carnage", "contournement", "coup-de-grace", "deluge", "eclaboussure", "entaille", "ponction", "rafale", "salve", "sangsue"].sort()
    );
    for (const rule of Object.values(QUALIFICATIONS)) {
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.describe(2).length).toBeGreaterThan(10);
      expect(rule.glyph.length).toBeGreaterThan(0);
      expect(rule.compatibleTypes).toEqual(["creature", "marin"]);
      // Une règle provisoire dit TOUJOURS ce qui attend validation.
      if (rule.rules !== "validated") expect(rule.pending?.length).toBeGreaterThan(0);
    }
  });

  it("les capacités rejetées n'existent pas", () => {
    for (const rejetee of ["a-l-abordage", "furie", "derniere-charge"]) expect(rejetee in QUALIFICATIONS).toBe(false);
  });

  it("une valeur X s'affiche ; la plus haute l'emporte quand deux sources donnent la même qualification", () => {
    const unite = avec(avec(instance("matelot-du-sans-nom", "p1"), { id: "eclaboussure", value: 1 }), { id: "eclaboussure", value: 2 }, { id: "rafale" });
    const q = effectiveQualifications(unite, getCardDefinition(unite.cardId));
    expect(q.map(qualificationLabel)).toEqual(["Rafale", "Éclaboussure 2"]);
  });

  it("aucune carte du catalogue n'en porte : leur attribution reste une décision de design", () => {
    const sets = [instance("matelot-du-sans-nom", "p1"), instance("murene-aveugle", "p1")];
    for (const unit of sets) expect(getCardDefinition(unit.cardId).qualifications).toBeUndefined();
  });
});

describe("attaques par phase", () => {
  it("sans qualification : une attaque, pas deux", () => {
    const a = instance("matelot-du-sans-nom", "p1");
    const s = ok(table([a], []), a.instanceId);
    expect(ancrage(s, "p2")).toBe(30 - 3);
    expect(attaque(s, a.instanceId).ok).toBe(false);
  });

  it("Rafale : une attaque, puis une seconde, et pas de troisième", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "rafale" });
    let s = ok(table([a], []), a.instanceId);
    expect(attacksRemaining(s, "p1", board(s, "p1")[0]!)).toBe(1);
    s = ok(s, a.instanceId);
    expect(ancrage(s, "p2")).toBe(30 - 6);
    const troisieme = attaque(s, a.instanceId);
    expect(troisieme.ok).toBe(false);
  });

  it("Déluge sans Créature ni Marin adverse : aucune attaque, et jamais le Navire", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "deluge" });
    const s = table([a], []);
    expect(attacksAllowed(s, "p1", a)).toBe(0);
    const r = attaque(s, a.instanceId);
    expect(r.ok).toBe(false);
  });

  it("Déluge avec une Créature : une attaque, contre elle seulement", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "deluge" });
    const cible = instance("poisson-aux-dents-de-verre", "p2");
    const s = table([a], [cible]);
    expect(attacksAllowed(s, "p1", a)).toBe(1);
    const versLeNavire = attaque(s, a.instanceId);
    expect(versLeNavire.ok ? "" : versLeNavire.error).toMatch(/Déluge/);
    const apres = ok(s, a.instanceId, cible.instanceId);
    expect(attaque(apres, a.instanceId, cible.instanceId).ok).toBe(false);
  });

  it("Déluge avec plusieurs Créatures et Marins : autant d'attaques, recomptées sur le plateau du moment", () => {
    const a = avec(instance("le-naufrage-impossible", "p1"), { id: "deluge" });
    const cibles = [instance("murene-aveugle", "p2", { slot: 0 }), instance("murene-aveugle", "p2", { slot: 1 }), instance("charpentier-de-bord", "p2", { slot: 2 })];
    let s = table([a], cibles);
    expect(attacksAllowed(s, "p1", a)).toBe(3);
    // La première Murène tombe : il n'en reste que deux à compter.
    s = ok(s, a.instanceId, cibles[0]!.instanceId);
    expect(board(s, "p2")).toHaveLength(2);
    expect(attacksAllowed(s, "p1", board(s, "p1")[0]!)).toBe(2);
    s = ok(s, a.instanceId, cibles[1]!.instanceId);
    // Recompté : une seule cible restante, deux attaques déjà faites — il n'en reste plus.
    expect(attacksRemaining(s, "p1", board(s, "p1")[0]!)).toBe(0);
  });

  it("Carnage : une cible détruite ouvre une attaque de plus ; sans destruction, non", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "carnage" });
    const fragile = instance("murene-aveugle", "p2");
    const s = ok(table([a], [fragile]), a.instanceId, fragile.instanceId);
    expect(board(s, "p2")).toHaveLength(0);
    expect(attaque(s, a.instanceId).ok).toBe(true);

    const solide = instance("matelot-du-sans-nom", "p2");
    const s2 = ok(table([a], [solide]), a.instanceId, solide.instanceId);
    expect(attaque(s2, a.instanceId).ok).toBe(false);
  });
});

describe("cibles", () => {
  it("Contournement : le Navire malgré la Garde ; sans lui, refusé", () => {
    const gardien = garde(instance("matelot-du-sans-nom", "p2"));
    const sans = instance("murene-aveugle", "p1");
    expect(attaque(table([sans], [gardien]), sans.instanceId).ok).toBe(false);

    const contourne = avec(instance("murene-aveugle", "p1"), { id: "contournement" });
    const s = ok(table([contourne], [gardien]), contourne.instanceId);
    expect(ancrage(s, "p2")).toBe(30 - 3);
  });
});

describe("effets du coup", () => {
  it("Brèche : l'excédent d'une cible détruite file au Navire adverse", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "breche" });
    const cible = instance("murene-aveugle", "p2"); // 1 Résistance, 3 dégâts : 2 d'excédent
    const s = ok(table([a], [cible]), a.instanceId, cible.instanceId);
    expect(board(s, "p2")).toHaveLength(0);
    expect(ancrage(s, "p2")).toBe(30 - 2);
  });

  it("Brèche sans destruction : rien ne passe", () => {
    const a = avec(instance("poisson-aux-dents-de-verre", "p1"), { id: "breche" });
    const cible = instance("matelot-du-sans-nom", "p2");
    const s = ok(table([a], [cible]), a.instanceId, cible.instanceId);
    expect(ancrage(s, "p2")).toBe(30);
  });

  it("Sangsue, Ancrage presque plein : le soin s'arrête au plafond du Navire", () => {
    const max = getShipDefinition("le-brise-lames").startingAnchor;
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "sangsue" });
    const s = ok(table([a], [], { anchor: max - 1 }), a.instanceId);
    expect(ancrage(s, "p1")).toBe(max);
    expect(s.eventLog.some((e) => e.type === "HEAL" && e.targetPlayerId === "p1" && e.amount === 1)).toBe(true);
  });

  it("Coup de grâce : 1 dégât suffit à détruire ; un coup ramené à 0 ne détruit rien", () => {
    const tueur = avec(instance("poisson-aux-dents-de-verre", "p1"), { id: "coup-de-grace" });
    const cible = instance("matelot-du-sans-nom", "p2"); // 4 Résistance, 2 dégâts
    const s = ok(table([tueur], [cible]), tueur.instanceId, cible.instanceId);
    expect(board(s, "p2")).toHaveLength(0);

    // Puissance ramenée à 0 : aucun dégât, aucune destruction.
    const desarme = { ...tueur, modifiers: [...tueur.modifiers, { id: "zero", source: "unknown" as const, attack: -5, health: 0, duration: "permanent" as const }] };
    const s2 = ok(table([desarme], [cible]), desarme.instanceId, cible.instanceId);
    expect(board(s2, "p2")).toHaveLength(1);
  });

  it("Éclaboussure : au bord, un seul voisin ; au milieu, les deux", () => {
    const a = avec(instance("poisson-aux-dents-de-verre", "p1"), { id: "eclaboussure", value: 1 });
    const g = instance("matelot-du-sans-nom", "p2", { slot: 0 });
    const m = instance("matelot-du-sans-nom", "p2", { slot: 1 });
    const d = instance("matelot-du-sans-nom", "p2", { slot: 2 });
    const auBord = ok(table([a], [g, m, d]), a.instanceId, g.instanceId);
    const dmg = (s: GameState, id: string) => board(s, "p2").find((u) => u.instanceId === id)!.damageMarked;
    expect([dmg(auBord, g.instanceId), dmg(auBord, m.instanceId), dmg(auBord, d.instanceId)]).toEqual([2, 1, 0]);

    const auMilieu = ok(table([a], [g, m, d]), a.instanceId, m.instanceId);
    expect([dmg(auMilieu, g.instanceId), dmg(auMilieu, m.instanceId), dmg(auMilieu, d.instanceId)]).toEqual([1, 2, 1]);
  });

  it("Entaille sur une Puissance faible : elle tombe à 0, jamais en dessous", () => {
    const a = avec(instance("poisson-aux-dents-de-verre", "p1"), { id: "entaille", value: 2 });
    const cible = instance("matelot-du-sans-nom", "p2"); // survit (4 Résistance)
    const faible = { ...cible, modifiers: [{ id: "faible", source: "unknown" as const, attack: -2, health: 0, duration: "permanent" as const }] }; // 3 → 1 Puissance
    const s = ok(table([a], [faible]), a.instanceId, faible.instanceId);
    const apres = board(s, "p2")[0]!;
    expect(computeEffectiveStats(apres, s.environment.tideState).attack).toBe(0);
    expect(apres.modifiers.some((m) => m.attack === -2 && m.duration === "permanent")).toBe(true);
  });

  it("Ponction quand l'adversaire n'a pas assez de Raison : il perd tout, en Déraison (règle provisoire)", () => {
    const a = avec(instance("murene-aveugle", "p1"), { id: "ponction", value: 3 });
    const s = ok(table([a], [], {}, { reason: 1 }), a.instanceId);
    expect(joueur(s, "p2").reason).toBe(1 - 3);
  });

  it("Salve : règles de répartition en attente — l'unité attaque normalement une seule cible", () => {
    expect(QUALIFICATIONS.salve.rules).toBe("notImplemented");
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "salve" });
    const c1 = instance("murene-aveugle", "p2");
    const c2 = instance("murene-aveugle", "p2");
    const s = ok(table([a], [c1, c2]), a.instanceId, c1.instanceId);
    expect(board(s, "p2").map((u) => u.instanceId)).toEqual([c2.instanceId]);
  });
});

describe("signalement des qualifications (QUALIFICATION_TRIGGERED)", () => {
  const signaux = (s: GameState) =>
    s.eventLog.flatMap((e) => (e.type === "QUALIFICATION_TRIGGERED" ? [{ q: e.qualification, cible: e.targetInstanceId ?? e.targetPlayerId, n: e.amount }] : []));

  it("Rafale ne se signale qu'à la deuxième attaque", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "rafale" });
    let s = ok(table([a], []), a.instanceId);
    expect(signaux(s)).toEqual([]);
    s = ok(s, a.instanceId);
    expect(signaux(s).map((x) => x.q)).toEqual(["rafale"]);
  });

  it("Contournement ne se signale que s'il passe vraiment une Garde", () => {
    const contourne = avec(instance("murene-aveugle", "p1"), { id: "contournement" });
    expect(signaux(ok(table([contourne], []), contourne.instanceId))).toEqual([]);
    const gardien = garde(instance("matelot-du-sans-nom", "p2"));
    expect(signaux(ok(table([contourne], [gardien]), contourne.instanceId)).map((x) => x.q)).toEqual(["contournement"]);
  });

  it("Brèche, Ponction et Sangsue : chacune avec ce qu'elle touche et son montant", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "breche" }, { id: "ponction", value: 1 }, { id: "sangsue" });
    const cible = instance("murene-aveugle", "p2");
    const s = ok(table([a], [cible], { anchor: 20 }, { reason: 5 }), a.instanceId, cible.instanceId);
    expect(signaux(s)).toEqual([
      { q: "breche", cible: "p2", n: 2 },
      { q: "ponction", cible: "p2", n: 1 },
      { q: "sangsue", cible: "p1", n: 3 },
    ]);
  });

  it("Éclaboussure se signale sur chaque voisin, Entaille sur chaque blessé", () => {
    const a = avec(instance("matelot-du-sans-nom", "p1"), { id: "eclaboussure", value: 1 }, { id: "entaille", value: 1 });
    const [g, m, d] = [instance("charpentier-de-bord", "p2"), instance("le-naufrage-impossible", "p2"), instance("charpentier-de-bord", "p2")];
    const s = ok(table([a], [g, m, d]), a.instanceId, m.instanceId);
    const vus = signaux(s);
    expect(vus.filter((x) => x.q === "eclaboussure").map((x) => x.cible).sort()).toEqual([g.instanceId, d.instanceId].sort());
    expect(vus.filter((x) => x.q === "entaille").map((x) => x.cible).sort()).toEqual([m.instanceId, g.instanceId, d.instanceId].sort());
  });
});

describe("Équipement qui confère une qualification (equipGrantsQualifications)", () => {
  it("l'unité équipée la porte tant qu'il est attaché, l'Équipement lui-même jamais", () => {
    // Le Cerf-volant confère Sangsue ; on lui fait conférer Rafale le temps du test.
    const def = getCardDefinition("le-cerf-volant");
    const avant = def.equipGrantsQualifications;
    def.equipGrantsQualifications = [{ id: "rafale" }];
    try {
      const a = instance("matelot-du-sans-nom", "p1");
      const equip = { ...instance("le-cerf-volant", "p1"), attachedToInstanceId: a.instanceId };
      const s = table([a, equip], []);
      expect(attacksAllowed(s, "p1", a)).toBe(2);
      expect(attacksAllowed(table([a, { ...equip, attachedToInstanceId: undefined }], []), "p1", a)).toBe(1);
    } finally {
      def.equipGrantsQualifications = avant;
    }
  });
});
