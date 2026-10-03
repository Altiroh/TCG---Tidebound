import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { previewHandBreakReason } from "@/game/actions/breakObject";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 14 — NÉCESSAIRE DU MARIN : écarts relevés par la revue cartes ↔ moteur
 * du 02/10/2026 (rapport B7). Chaque test joue la carte via `dispatch` et
 * regarde l'effet observable — et, quand c'est possible, le cas qui était
 * faux avant la correction.
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
const propose = (state: GameState, cardId: string) => pendingCandidates(state).some((c) => c.cardId === cardId);

function passerTout(state: GameState): GameState {
  let s = state;
  while (s.pendingReaction) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

function table(
  p1: Partial<ReturnType<typeof testPlayer>> = {},
  p2: Partial<ReturnType<typeof testPlayer>> = {},
  extra: Partial<GameState> = {}
): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
    ...extra,
  });
}

describe("Cale Inondable", () => {
  it("Réaction cachée : proposée à la TROISIÈME attaque adverse du tour, pas à la quatrième", () => {
    const cale = instance("cale-inondable", "p1", { turnsRemaining: 3 });
    const attaquants = [0, 1, 2].map(() => instance("murene-aveugle", "p2"));
    let s = table({ board: [cale] }, { board: attaquants }, { phase: "combatPhase", activePlayerId: "p2", priorityPlayerId: "p2" });
    for (const [rang, attaquant] of attaquants.entries()) {
      const r = dispatch(s, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
      ok(r);
      if (rang < 2) {
        expect(propose(r.state, "cale-inondable"), `attaque ${rang + 1}`).toBe(false);
        s = passerTout(r.state);
      } else {
        expect(propose(r.state, "cale-inondable"), "troisième attaque").toBe(true);
        s = r.state;
      }
    }
    const inonde = activateReactionFor(s, "cale-inondable");
    ok(inonde);
    expect(unite(inonde.state, cale.instanceId)).toBeUndefined();
  });

  it("effet visible : seulement la PREMIÈRE attaque adverse du tour, même si la comparaison l'écartait", () => {
    // Deux contre deux : la première attaque ne remplit pas « plus d'unités
    // que vous ». Elle tue un P'tit Bout, la comparaison devient vraie —
    // mais la seconde attaque n'est plus « la première ».
    const jouer = (avecCale: boolean) => {
      const cale = instance("cale-inondable", "p1", { turnsRemaining: 3 });
      const defenseurs = [instance("ptit-bout", "p1"), instance("ptit-bout", "p1")];
      const harponneur = instance("vieux-harponneur", "p2");
      const murene = instance("murene-aveugle", "p2");
      const s = table(
        { board: avecCale ? [cale, ...defenseurs] : defenseurs },
        { board: [harponneur, murene] },
        { phase: "combatPhase", activePlayerId: "p2", priorityPlayerId: "p2", environment: testEnvironment({ tideState: "tempete" }) }
      );
      const r1 = dispatch(s, { type: "attack", playerId: "p2", attackerInstanceId: harponneur.instanceId, defenderInstanceId: defenseurs[0]!.instanceId });
      ok(r1);
      const r2 = dispatch(passerTout(r1.state), { type: "attack", playerId: "p2", attackerInstanceId: murene.instanceId });
      ok(r2);
      return joueur(passerTout(r2.state), "p1").anchor;
    };
    expect(jouer(true)).toBe(jouer(false));
  });
});

describe("Chaîne de Travers", () => {
  it("« la première unité adverse JOUÉE » : un Péon invoqué ne consomme pas l'usage du tour", () => {
    const chaine = instance("chaine-de-travers", "p1", { turnsRemaining: 3 });
    const seau = instance("le-seau", "p2");
    const joue = instance("murene-aveugle", "p2");
    const s = table({ board: [chaine] }, { board: [seau], hand: [joue] }, {
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      environment: testEnvironment({ tideState: "tempete" }),
    });
    const bris = dispatch(s, { type: "breakObject", playerId: "p2", instanceId: seau.instanceId });
    ok(bris);
    const peon = joueur(bris.state, "p2").board.find((u) => u.cardId === "peon-cra-poiscail")!;
    expect(stats(bris.state, peon.instanceId).attack).toBe(1);
    const pose = dispatch(passerTout(bris.state), { type: "playCard", playerId: "p2", instanceId: joue.instanceId });
    ok(pose);
    expect(stats(pose.state, joue.instanceId).attack).toBe(2);
  });
});

describe("Fausse Cargaison", () => {
  function brisAdverse() {
    const cargaison = instance("fausse-cargaison", "p1", { turnsRemaining: 3 });
    const reserves = instance("dernieres-reserves", "p2");
    const s = table(
      { board: [cargaison] },
      { board: [reserves], deck: [instance("murene-aveugle", "p2"), instance("murene-aveugle", "p2")] },
      { activePlayerId: "p2", priorityPlayerId: "p2" }
    );
    const r = dispatch(s, { type: "breakObject", playerId: "p2", instanceId: reserves.instanceId });
    ok(r);
    return { cargaison, r };
  }

  it("la fenêtre s'ouvre AVANT que l'effet de l'Objet ne se résolve", () => {
    const { r } = brisAdverse();
    expect(r.state.pendingObjectBreak).toBeDefined();
    expect(joueur(r.state, "p2").hand).toHaveLength(0);
    expect(propose(r.state, "fausse-cargaison")).toBe(true);
  });

  it("activée : l'effet de l'Objet est réellement annulé, puis la Structure part", () => {
    const { cargaison, r } = brisAdverse();
    const annule = activateReactionFor(r.state, "fausse-cargaison");
    ok(annule);
    expect(joueur(annule.state, "p2").hand).toHaveLength(0);
    expect(annule.state.pendingObjectBreak).toBeUndefined();
    expect(unite(annule.state, cargaison.instanceId)).toBeUndefined();
  });

  it("passée : le Bris reprend et l'Objet fait son effet", () => {
    const { cargaison, r } = brisAdverse();
    const passe = passerTout(r.state);
    expect(joueur(passe, "p2").hand).toHaveLength(2);
    expect(unite(passe, cargaison.instanceId)).toBeDefined();
  });
});

describe("Bouclier d'Écume", () => {
  it("« pendant le tour adverse » : pas proposé quand votre unité meurt pendant votre propre tour", () => {
    const bouclier = instance("bouclier-decume", "p1");
    const murene = instance("murene-aveugle", "p1");
    const cible = instance("ptit-bout", "p2");
    const s = table({ board: [bouclier, murene] }, { board: [cible] }, { phase: "combatPhase" });
    const r = dispatch(s, { type: "attack", playerId: "p1", attackerInstanceId: murene.instanceId, defenderInstanceId: cible.instanceId });
    ok(r);
    expect(propose(r.state, "bouclier-decume")).toBe(false);
    expect(unite(passerTout(r.state), murene.instanceId)).toBeUndefined();
  });

  it("pendant le tour adverse, il se propose et sauve l'unité", () => {
    const bouclier = instance("bouclier-decume", "p1");
    const defenseur = instance("ptit-bout", "p1");
    const murene = instance("murene-aveugle", "p2");
    const s = table({ board: [bouclier, defenseur] }, { board: [murene] }, { phase: "combatPhase", activePlayerId: "p2", priorityPlayerId: "p2" });
    const r = dispatch(s, { type: "attack", playerId: "p2", attackerInstanceId: murene.instanceId, defenderInstanceId: defenseur.instanceId });
    ok(r);
    const sauve = activateReactionFor(passerJusqua(r.state, "bouclier-decume"), "bouclier-decume");
    ok(sauve);
    expect(unite(sauve.state, defenseur.instanceId)).toBeDefined();
  });
});

/** Passe les fenêtres jusqu'à celle qui propose `cardId`. */
function passerJusqua(state: GameState, cardId: string): GameState {
  let s = state;
  while (s.pendingReaction && !propose(s, cardId)) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

describe("Trousse du Bord", () => {
  it("la répartition se limite aux UNITÉS : une Structure blessée est refusée", () => {
    const trousse = instance("trousse-du-bord", "p1");
    const structure = instance("cloison-etanche", "p1", { turnsRemaining: 3, damageMarked: 2 });
    const blesse = instance("vieux-harponneur", "p1", { damageMarked: 3 });
    const r = dispatch(table({ board: [trousse, structure, blesse] }), { type: "breakObject", playerId: "p1", instanceId: trousse.instanceId });
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("healAllocation");
    const refus = dispatch(r.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { healAllocation: [{ instanceId: structure.instanceId, amount: 2 }] },
    });
    expect(refus.ok).toBe(false);
    const soin = dispatch(r.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { healAllocation: [{ instanceId: blesse.instanceId, amount: 3 }] },
    });
    ok(soin);
    expect(unite(soin.state, blesse.instanceId)!.damageMarked).toBe(0);
  });

  it("seule une Structure est blessée : aucune question n'est posée", () => {
    const trousse = instance("trousse-du-bord", "p1");
    const structure = instance("cloison-etanche", "p1", { turnsRemaining: 3, damageMarked: 2 });
    const r = dispatch(table({ board: [trousse, structure] }), { type: "breakObject", playerId: "p1", instanceId: trousse.instanceId });
    ok(r);
    expect(r.state.pendingChoice).toBeUndefined();
  });
});

describe("On Flotte Encore", () => {
  it("« Jouable uniquement si… » vaut aussi pour le Bris depuis la main", () => {
    const flotte = instance("on-flotte-encore", "p1");
    const intacte = table({ hand: [flotte], anchor: 30 });
    expect(dispatch(intacte, { type: "breakObject", playerId: "p1", instanceId: flotte.instanceId, fromHand: true }).ok).toBe(false);
    expect(previewHandBreakReason(intacte, "p1", flotte.instanceId)?.allowed).toBe(false);

    const abimee = table({ hand: [flotte], anchor: 18 });
    const r = dispatch(abimee, { type: "breakObject", playerId: "p1", instanceId: flotte.instanceId, fromHand: true });
    ok(r);
    expect(joueur(r.state, "p1").anchor).toBe(22);
  });
});

describe("Barils de Poudre (texte Notion)", () => {
  it("un plateau adverse déjà plein ne déclenche rien : c'est le compte des unités JOUÉES qui compte", () => {
    const barils = instance("barils-de-poudre", "p1", { turnsRemaining: 3 });
    const deja = [0, 1, 2, 3].map(() => instance("ptit-bout", "p2"));
    const arrivant = instance("ptit-bout", "p2");
    const s = table({ board: [barils] }, { board: deja, hand: [arrivant] }, {
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      environment: testEnvironment({ tideState: "tempete" }),
    });
    const r = dispatch(s, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(r);
    expect(unite(r.state, arrivant.instanceId)!.damageMarked).toBe(0);
  });

  it("la première unité adverse jouée APRÈS la troisième du tour subit 1 dégât, une seule fois", () => {
    const barils = instance("barils-de-poudre", "p1", { turnsRemaining: 3 });
    const main = [0, 1, 2, 3, 4].map(() => instance("ptit-bout", "p2"));
    let s = table({ board: [barils] }, { hand: main, reasonMax: 10 }, {
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      environment: testEnvironment({ tideState: "tempete" }),
    });
    for (const carte of main) {
      const r = dispatch(s, { type: "playCard", playerId: "p2", instanceId: carte.instanceId });
      ok(r);
      s = passerTout(r.state);
    }
    expect(main.map((c) => unite(s, c.instanceId)!.damageMarked)).toEqual([0, 0, 0, 1, 0]);
  });
});
