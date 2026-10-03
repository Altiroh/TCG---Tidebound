import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { emittedSignalsOf, findAssemblage } from "@/game/rules/chromatic";
import { processChromaticSignals } from "@/game/rules/chromaticSignals";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 15 — ÉCLATS EN SELLE : écarts relevés par la revue cartes ↔ moteur du
 * 02/10/2026 (rapport B6). Chaque test joue la carte via `dispatch` et
 * regarde l'effet observable.
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

function passerTout(state: GameState): GameState {
  let s = state;
  while (s.pendingReaction) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

const pioche = (id: string) => [0, 1, 2].map(() => instance("murene-aveugle", id));

describe("Bête de Halage : « détruite par un effet adverse »", () => {
  it("des DÉGÂTS mortels d'un effet adverse : le coup est annulé, elle perd 1 Résistance (permanent)", () => {
    const halage = instance("bete-de-halage", "p2", { damageMarked: 2 }); // 4 de Résistance : 2 + 2 est mortel
    const eclat = instance("coup-de-harpon", "p1");
    const r = dispatch(table({ board: [eclat] }, { board: [halage] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: eclat.instanceId,
      targetInstanceId: halage.instanceId,
    });
    ok(r);
    expect(unite(r.state, halage.instanceId)).toBeDefined();
    expect(stats(r.state, halage.instanceId).health).toBe(3);
    // Le coup mortel n'est pas marqué : ses dégâts d'avant restent.
    expect(unite(r.state, halage.instanceId)!.damageMarked).toBe(2);
  });

  it("si −1 Résistance suffit à la tuer, le remplacement ne la sauve pas", () => {
    const halage = instance("bete-de-halage", "p2", { damageMarked: 3 }); // 4 de Résistance : 3/3 après le −1
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = dispatch(table({ board: [eclat] }, { board: [halage] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: eclat.instanceId,
      targetInstanceId: halage.instanceId,
    });
    ok(r);
    expect(unite(r.state, halage.instanceId)).toBeUndefined();
  });

  it("une destruction posée par « Chacun sa Place » adverse se remplace aussi", () => {
    const halage = instance("bete-de-halage", "p2");
    const place = instance("chacun-sa-place", "p1");
    const r = dispatch(table({ hand: [place] }, { board: [halage] }), { type: "playCard", playerId: "p1", instanceId: place.instanceId });
    ok(r);
    const moi = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { keepInstanceIds: [] } });
    ok(moi);
    const lui = dispatch(moi.state, { type: "resolveChoice", playerId: "p2", choice: { keepInstanceIds: [] } });
    ok(lui);
    expect(unite(lui.state, halage.instanceId)).toBeDefined();
    expect(stats(lui.state, halage.instanceId).health).toBe(3);
  });

  it("ses PROPRES effets ne déclenchent rien : elle part", () => {
    const halage = instance("bete-de-halage", "p1", { damageMarked: 3 });
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = dispatch(table({ board: [eclat, halage] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: eclat.instanceId,
      targetInstanceId: halage.instanceId,
    });
    ok(r);
    expect(unite(r.state, halage.instanceId)).toBeUndefined();
  });
});

describe("cibles : « une Sentinelle » sans « que vous contrôlez » vise les deux camps", () => {
  it("Briseur du Brasier peut pousser une Sentinelle adverse d'une autre couleur", () => {
    const briseur = instance("briseur-du-brasier", "p1");
    const bleue = instance("tacticien-de-lecume", "p2");
    const r = dispatch(table({ hand: [briseur] }, { board: [bleue] }), { type: "playCard", playerId: "p1", instanceId: briseur.instanceId });
    ok(r);
    const pousse = activateReactionFor(r.state, "briseur-du-brasier", bleue.instanceId);
    ok(pousse);
    expect(stats(pousse.state, bleue.instanceId).attack).toBe(2 + 2);
  });

  it("Synchronisation ! peut viser une Sentinelle adverse", () => {
    const sync = instance("synchronisation", "p1");
    const heros = instance("heros-de-la-flamme", "p2");
    const r = dispatch(table({ board: [sync] }, { board: [heros] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: sync.instanceId,
      targetInstanceId: heros.instanceId,
    });
    ok(r);
    // Son propre Rouge ne joue que pendant le tour de son contrôleur : la
    // Sentinelle adverse le reçoit, sans effet sur la Puissance lue maintenant.
    expect(unite(r.state, heros.instanceId)!.modifiers.some((m) => m.chromatic?.benefitsOwnSignals)).toBe(true);
  });

  it("Les Couleurs Répondent peut choisir une Sentinelle adverse ; le bonus tombe au prochain tour du lanceur", () => {
    const anomalie = instance("les-couleurs-repondent", "p1");
    const adverse = instance("gardienne-de-leclat", "p2");
    const r = dispatch(table({ hand: [anomalie], deck: pioche("p1") }, { board: [adverse], deck: pioche("p2") }), {
      type: "playCard",
      playerId: "p1",
      instanceId: anomalie.instanceId,
    });
    ok(r);
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [adverse.instanceId] } });
    ok(choix);
    expect(stats(choix.state, adverse.instanceId).attack).toBe(2);
    const tourAdverse = dispatch(passerTout(choix.state), { type: "endTurn", playerId: "p1" });
    ok(tourAdverse);
    expect(stats(tourAdverse.state, adverse.instanceId).attack).toBe(2);
    const retour = dispatch(passerTout(tourAdverse.state), { type: "endTurn", playerId: "p2" });
    ok(retour);
    expect(stats(retour.state, adverse.instanceId).attack).toBe(1);
  });
});

describe("Bracelet de Résonance", () => {
  it("Sabordé, il détruit un Éclat (même adverse) : la Sentinelle équipée en émet le Signal jusqu'à votre prochain tour", () => {
    const porteuse = instance("gardienne-de-leclat", "p1");
    const bracelet = instance("bracelet-de-resonance", "p1", { attachedToInstanceId: porteuse.instanceId });
    const eclat = instance("eclat-chromatique-bleu", "p2");
    const s = table({ board: [porteuse, bracelet], deck: pioche("p1") }, { board: [eclat], deck: pioche("p2") });
    const r = dispatch(s, { type: "saborder", playerId: "p1", instanceId: bracelet.instanceId });
    ok(r);
    const resonne = activateReactionFor(r.state, "bracelet-de-resonance", eclat.instanceId);
    ok(resonne);
    expect(unite(resonne.state, eclat.instanceId)).toBeUndefined();
    expect(emittedSignalsOf(unite(resonne.state, porteuse.instanceId)!)).toEqual(["jaune", "bleu"]);

    const tourAdverse = dispatch(passerTout(resonne.state), { type: "endTurn", playerId: "p1" });
    ok(tourAdverse);
    expect(emittedSignalsOf(unite(tourAdverse.state, porteuse.instanceId)!)).toContain("bleu");
    const retour = dispatch(passerTout(tourAdverse.state), { type: "endTurn", playerId: "p2" });
    ok(retour);
    expect(emittedSignalsOf(unite(retour.state, porteuse.instanceId)!)).toEqual(["jaune"]);
  });
});

describe("Tacticien de l'Écume : Signal Bleu contre une UNITÉ seulement", () => {
  it("une attaque contre un Éclat ne consomme pas le Signal : l'attaque suivante contre une unité en profite", () => {
    const tacticien = instance("tacticien-de-lecume", "p1");
    const heros = instance("heros-de-la-flamme", "p1");
    const gardienne = instance("gardienne-de-leclat", "p1");
    const eclat = instance("eclat-chromatique-vert", "p2");
    const cible = instance("vieille-selle", "p2");
    const s = table({ board: [tacticien, heros, gardienne] }, { board: [eclat, cible] }, { phase: "combatPhase" });
    const r1 = dispatch(s, { type: "attack", playerId: "p1", attackerInstanceId: heros.instanceId, defenderInstanceId: eclat.instanceId });
    ok(r1);
    const avant = stats(r1.state, cible.instanceId).attack;
    const r2 = dispatch(passerTout(r1.state), {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: gardienne.instanceId,
      defenderInstanceId: cible.instanceId,
    });
    ok(r2);
    expect(stats(r2.state, cible.instanceId).attack).toBe(avant - 1);
  });
});

describe("Veilleuse de l'Ombre : Signal Violet", () => {
  it("une Sentinelle désignée par un choix multiple adverse (Trinquer Trop Fort) est « ciblée »", () => {
    const veilleuse = instance("veilleuse-de-lombre", "p2");
    const heros = instance("heros-de-la-flamme", "p2");
    const trinquer = instance("trinquer-trop-fort", "p1");
    const carte = instance("murene-aveugle", "p2");
    const s = table({ board: [trinquer] }, { board: [veilleuse, heros], deck: [carte], hand: [instance("murene-aveugle", "p2")] });
    const r = dispatch(s, { type: "breakObject", playerId: "p1", instanceId: trinquer.instanceId });
    ok(r);
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [heros.instanceId] } });
    ok(choix);
    expect(joueur(choix.state, "p2").hand.some((c) => c.instanceId === carte.instanceId)).toBe(true);
    expect(choix.state.pendingChoice?.kind).toBe("handDiscard");
    expect(choix.state.pendingChoice?.playerId).toBe("p2");
  });

  it("une occurrence survenue pendant une question n'est pas perdue : elle se résout dès que la table se libère", () => {
    const veilleuse = instance("veilleuse-de-lombre", "p2");
    const heros = instance("heros-de-la-flamme", "p2");
    const carte = instance("murene-aveugle", "p2");
    const occupee: GameState = {
      ...table({}, { board: [veilleuse, heros], deck: [carte] }),
      pendingChoice: { kind: "handDiscard", playerId: "p1", count: 1, refusable: false, turnNumber: 1 },
    };
    const vise = processChromaticSignals(
      occupee,
      [{ type: "UNIT_TARGETED", instanceId: heros.instanceId, byPlayerId: "p1", turnNumber: 1, timestamp: 0 }],
      1
    );
    expect(joueur(vise.state, "p2").hand).toHaveLength(0);
    expect(vise.state.signauxVioletsEnAttente).toHaveLength(1);

    const { pendingChoice: _repondu, ...libre } = vise.state;
    const suite = processChromaticSignals(libre, [], 1);
    expect(joueur(suite.state, "p2").hand.map((c) => c.instanceId)).toEqual([carte.instanceId]);
    expect(suite.state.signauxVioletsEnAttente).toBeUndefined();
  });
});

describe("Oracle d'Améthyste : « piochez PUIS défaussez »", () => {
  it("une défausse d'effet SANS pioche préalable ne compte pas", () => {
    const oracle = instance("oracle-damethyste", "p1");
    const gabier = instance("gabier-au-carnet-mouille", "p1");
    const main = [0, 1, 2, 3].map(() => instance("murene-aveugle", "p1"));
    const r = dispatch(table({ board: [oracle], hand: [gabier, ...main], deck: pioche("p1") }), {
      type: "playCard",
      playerId: "p1",
      instanceId: gabier.instanceId,
    });
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("handDiscard");
    const defausse = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { discardInstanceIds: [main[0]!.instanceId] } });
    ok(defausse);
    expect(stats(defausse.state, oracle.instanceId).attack).toBe(3);
  });

  it("piocher puis défausser par un même effet lui donne +2 Puissance", () => {
    const oracle = instance("oracle-damethyste", "p1");
    const journal = instance("journal-de-bord-detrempe", "p1");
    const r = dispatch(table({ board: [oracle, journal], hand: [instance("murene-aveugle", "p1")], deck: pioche("p1") }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: journal.instanceId,
    });
    ok(r);
    const defausse = dispatch(r.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { discardInstanceIds: [joueur(r.state, "p1").hand[0]!.instanceId] },
    });
    ok(defausse);
    expect(stats(defausse.state, oracle.instanceId).attack).toBe(5);
  });
});

describe("Poste Chromatique", () => {
  it("la couleur CHOISIE à l'arrivée (Émissaire de Quartz) compte, une fois le choix fait", () => {
    const poste = instance("poste-chromatique", "p1", { turnsRemaining: 4 });
    const rouge = instance("heros-de-la-flamme", "p1");
    const emissaire = instance("emissaire-de-quartz", "p1");
    const r = dispatch(table({ board: [poste, rouge], hand: [emissaire] }), { type: "playCard", playerId: "p1", instanceId: emissaire.instanceId });
    ok(r);
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { color: "vert" } });
    ok(choix);
    expect(stats(choix.state, emissaire.instanceId).health).toBe(3 + 1);
  });

  it("une couleur déjà contrôlée ne compte pas", () => {
    const poste = instance("poste-chromatique", "p1", { turnsRemaining: 4 });
    const rouge = instance("heros-de-la-flamme", "p1");
    const emissaire = instance("emissaire-de-quartz", "p1");
    const r = dispatch(table({ board: [poste, rouge], hand: [emissaire] }), { type: "playCard", playerId: "p1", instanceId: emissaire.instanceId });
    ok(r);
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { color: "rouge" } });
    ok(choix);
    expect(stats(choix.state, emissaire.instanceId).health).toBe(3);
  });

  it("le Géant Assemblé n'apporte pas les couleurs de ses quatre Sentinelles", () => {
    const jouer = (avecPoste: boolean) => {
      const geant = instance("le-geant-chromatique", "p1");
      const sentinelles = [
        instance("heros-de-la-flamme", "p1"),
        instance("gardienne-de-leclat", "p1"),
        instance("tacticien-de-lecume", "p1"),
        instance("emissaire-de-quartz", "p1", { chromatic: { colors: ["vert"] } }),
      ];
      const poste = instance("poste-chromatique", "p1", { turnsRemaining: 4 });
      const assemblage = findAssemblage(sentinelles, 4)!;
      const r = dispatch(table({ hand: [geant], board: avecPoste ? [poste, ...sentinelles] : sentinelles }), {
        type: "playCard",
        playerId: "p1",
        instanceId: geant.instanceId,
        assemblage,
      });
      ok(r);
      return stats(r.state, geant.instanceId).health;
    };
    expect(jouer(true)).toBe(jouer(false));
  });
});
