import { describe, expect, it } from "vitest";
// Effets d'arrivée facultatifs (12/10/2026) : jouer une carte accepte son effet d'arrivée, comme « Appliquer ».
import { dispatch } from "@/tests/game/arrivalDispatch";
import { getCardDefinition } from "@/game/cards/sets/core";
import { computeEffectiveStats } from "@/game/cards/stats";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 14 — NÉCESSAIRE DU MARIN, comportements qui ne se devinent pas.
 *
 * Le test de conformité (`cardConformity.test.ts`) vérifie que chaque texte
 * est réalisé par une structure. Il ne dit rien de ce qui se PASSE. Ces
 * tests-ci jouent les cartes et regardent l'état, sur les quatre points où
 * une erreur d'implémentation serait invisible autrement :
 *
 *  - une Structure-piège se détruit après avoir tiré (c'est une cartouche) ;
 *  - Jugement du Phare nettoie vraiment le plateau, et se paie en coque ;
 *  - Filet de Sauvetage est un BUFF de Résistance, pas un soin déguisé ;
 *  - un Objet Chaîne réactif ne se joue pas hors de sa fenêtre.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

const board = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.board;

/**
 * Ce que la fenêtre OUVERTE propose à ce joueur. On relit les déclencheurs
 * dans `pendingReaction` plutôt que de les reconstruire : c'est ce que le
 * joueur voit réellement, et pas ce qu'on croit qu'il devrait voir.
 */
function propositions(state: GameState, playerId: string) {
  const fenetre = state.pendingReaction;
  if (!fenetre) return [];
  return eligibleCandidatesFor(state, fenetre.events, playerId, fenetre.turnNumber, fenetre.usedCandidateKeys);
}
const enJeu = (state: GameState, playerId: string, instanceId: string) =>
  board(state, playerId).some((u) => u.instanceId === instanceId);

/** Cartes prêtes à poser, avec de quoi les payer. */
function table(overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { shipId: "le-brise-lames", reason: 10, reasonMax: 10 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10 }),
    ],
    ...overrides,
  });
}

describe("Structures du lot : un effet unique, actif même masqué (13/10/2026)", () => {
  /**
   * Les Structures du lot ont perdu leur Réaction cachée : il leur reste un
   * seul effet, qui agit aussi quand la Marée les masque (`activeWhileHidden`).
   * Vérifié sur la DÉFINITION de toutes, puis en jeu sur deux d'entre elles.
   */
  it("aucune ne garde de Réaction cachée, toutes agissent masquées", () => {
    const structures = [
      "la-nasse-trop-pleine",
      "jugement-du-phare",
      "barils-de-poudre",
      "pont-mine",
      "cloison-etanche",
      "cale-inondable",
      "chaine-de-travers",
      "derniere-barricade",
      "fausse-cargaison",
      "filet-de-sauvetage",
    ];
    for (const id of structures) {
      const def = getCardDefinition(id);
      expect(def.abilities?.some((a) => a.hiddenReaction) ?? false, id).toBe(false);
      expect(def.activeWhileHidden, id).toBe(true);
    }
  });

  it("Barils de Poudre, masqué : la quatrième unité adverse jouée du tour subit 1 dégât, et la Structure reste", () => {
    const piege = instance("barils-de-poudre", "p1", { turnsRemaining: 3 });
    // Trois corps JOUÉS ce tour : c'est le QUATRIÈME, celui qui arrive, qui
    // déclenche l'effet.
    const cibles = [0, 1, 2].map(() => instance("ptit-bout", "p2"));
    const arrivant = instance("ptit-bout", "p2");
    let state = table({
      environment: testEnvironment({ tideState: "calme" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [piege] }),
        testPlayer("p2", { shipId: "le-goliath", hand: [...cibles, arrivant], reason: 10, reasonMax: 10 }),
      ],
      activePlayerId: "p2",
    });
    for (const carte of cibles) {
      const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: carte.instanceId });
      ok(r);
      state = r.state;
    }
    expect(board(state, "p2").every((u) => u.damageMarked === 0)).toBe(true);

    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    expect(propositions(pose.state, "p1").some((c) => c.cardId === "barils-de-poudre")).toBe(false);
    // Le quatrième encaisse 1 dégât ; les trois premiers sont intacts.
    expect(board(pose.state, "p2").find((u) => u.instanceId === arrivant.instanceId)?.damageMarked).toBe(1);
    expect(board(pose.state, "p2").filter((u) => u.damageMarked === 0)).toHaveLength(3);
    expect(enJeu(pose.state, "p1", piege.instanceId)).toBe(true);
  });
});

describe("Jugement du Phare", () => {
  function phare(unitesAdverses: number) {
    const piege = instance("jugement-du-phare", "p1", { turnsRemaining: 3 });
    const cibles = Array.from({ length: unitesAdverses }, () => instance("vieux-harponneur", "p2"));
    const arrivant = instance("vieux-harponneur", "p2");
    return {
      piege,
      arrivant,
      state: testGameState({
        environment: testEnvironment({ tideState: "calme" }), // masqué : il agit quand même
        players: [
          testPlayer("p1", { shipId: "le-brise-lames", board: [piege] }),
          testPlayer("p2", { shipId: "le-goliath", board: cibles, hand: [arrivant], reason: 10, reasonMax: 10 }),
        ],
        activePlayerId: "p2",
      }),
    };
  }

  it("une unité adverse arrive alors que l'adversaire en contrôle au moins 4 : elle subit 2 dégâts", () => {
    const { piege, arrivant, state } = phare(3);
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    expect(board(pose.state, "p2").find((u) => u.instanceId === arrivant.instanceId)?.damageMarked).toBe(2);
    expect(board(pose.state, "p2").filter((u) => u.instanceId !== arrivant.instanceId).every((u) => u.damageMarked === 0)).toBe(true);
    expect(enJeu(pose.state, "p1", piege.instanceId)).toBe(true);
  });

  it("sous le seuil (3 unités adverses), rien", () => {
    const { arrivant, state } = phare(2);
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    expect(board(pose.state, "p2").every((u) => u.damageMarked === 0)).toBe(true);
  });
});

describe("Filet de Sauvetage : un buff de Résistance, jamais un soin", () => {
  it("visible, il augmente la Résistance MAXIMALE sans effacer les dégâts", () => {
    const filet = instance("filet-de-sauvetage", "p1", { turnsRemaining: 3, revealed: true });
    // Murène Aveugle, blessée : ses dégâts marqués ne doivent pas bouger.
    const unite = instance("murene-aveugle", "p1", { damageMarked: 2 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "tempete" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [filet, unite] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });

    const joueur = state.players.find((p) => p.id === "p1")!;
    const base = getCardDefinition("murene-aveugle").health!;
    const avec = computeEffectiveStats(unite, "tempete", {
      controllerBoard: joueur.board,
      controllerReason: joueur.reason,
      tideOrientation: state.environment.tideOrientation,
    });

    // La Résistance monte de 2…
    expect(avec.health).toBe(base + 2);
    // …et les dégâts déjà subis restent subis. C'est toute la différence
    // avec « restaurez 2 Résistance ».
    expect(board(state, "p1").find((u) => u.instanceId === unite.instanceId)!.damageMarked).toBe(2);
  });

  it("le bonus tient même masqué : effet unique, actif même masqué", () => {
    const filet = instance("filet-de-sauvetage", "p1", { turnsRemaining: 3 });
    const unite = instance("murene-aveugle", "p1");
    const base = getCardDefinition("murene-aveugle").health!;

    const lire = (tide: "calme" | "tempete") => {
      const state = testGameState({
        environment: testEnvironment({ tideState: tide }),
        players: [
          testPlayer("p1", { shipId: "le-brise-lames", board: [filet, unite] }),
          testPlayer("p2", { shipId: "le-goliath" }),
        ],
      });
      const joueur = state.players.find((p) => p.id === "p1")!;
      return computeEffectiveStats(unite, tide, {
        controllerBoard: joueur.board,
        controllerReason: joueur.reason,
        tideOrientation: state.environment.tideOrientation,
      }).health;
    };

    expect(lire("tempete")).toBe(base + 2); // visible
    expect(lire("calme")).toBe(base + 2); // masquée : l'aura porte encore (actif même masqué)
  });

  it("l'aura ne touche que les unités, pas les Structures du même plateau", () => {
    const filet = instance("filet-de-sauvetage", "p1", { turnsRemaining: 3 });
    const structure = instance("le-role-dequipage", "p1", { turnsRemaining: 4 });
    const state = testGameState({
      environment: testEnvironment({ tideState: "tempete" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [filet, structure] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const joueur = state.players.find((p) => p.id === "p1")!;
    const stats = computeEffectiveStats(structure, "tempete", {
      controllerBoard: joueur.board,
      controllerReason: joueur.reason,
      tideOrientation: state.environment.tideOrientation,
    });
    expect(stats.health).toBe(getCardDefinition("le-role-dequipage").health);
  });
});

describe("Objets Chaîne réactifs : seulement dans leur fenêtre", () => {
  it("Harpon à Ressort ne se propose pas hors d'une attaque adverse", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", hand: [harpon] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    // Aucune attaque en cours : aucune fenêtre, donc aucun candidat.
    expect(propositions(state, "p1").find((c) => c.cardId === "harpon-a-ressort")).toBeUndefined();
  });

  it("Harpon à Ressort se propose quand une unité adverse attaque, et frappe l'attaquant", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const attaquant = instance("murene-aveugle", "p2", { summoningSick: false });
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", hand: [harpon] }),
        testPlayer("p2", { shipId: "le-goliath", board: [attaquant] }),
      ],
      activePlayerId: "p2",
    });

    const attaque = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
    ok(attaque);

    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort");
    expect(candidat, "la fenêtre d'attaque doit proposer le Harpon").toBeDefined();

    const riposte = dispatch(attaque.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat!.sourceInstanceId,
      abilityIndex: candidat!.abilityIndex,
    });
    ok(riposte);

    // L'attaquant a pris 2 dégâts (ou est mort en les prenant), et l'Objet
    // a été consommé.
    const survivant = board(riposte.state, "p2").find((u) => u.instanceId === attaquant.instanceId);
    if (survivant) expect(survivant.damageMarked).toBeGreaterThanOrEqual(2);
    expect(enJeu(riposte.state, "p1", harpon.instanceId)).toBe(false);
    expect(riposte.state.players.find((p) => p.id === "p1")!.hand.some((c) => c.instanceId === harpon.instanceId)).toBe(false);
  });
});

describe("Objets Chaîne réactifs : joués depuis la main (refonte du 13/10/2026)", () => {
  function attaqueContreHarponEnMain(extraBoardP1: ReturnType<typeof instance>[] = []) {
    const harpon = instance("harpon-a-ressort", "p1");
    const attaquant = instance("murene-aveugle", "p2", { summoningSick: false });
    const state = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", hand: [harpon], board: extraBoardP1, reason: 6 }),
        testPlayer("p2", { shipId: "le-goliath", board: [attaquant] }),
      ],
      activePlayerId: "p2",
    });
    const attaque = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
    ok(attaque);
    return { harpon, attaquant, attaque };
  }

  it("Harpon à Ressort EN MAIN se propose à l'attaque, à son coût imprimé", () => {
    const { attaque } = attaqueContreHarponEnMain();
    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort");
    expect(candidat, "le Harpon en main doit être proposé").toBeDefined();
    expect(candidat!.fromHand).toBe(true);
    expect(candidat!.reasonCost).toBe(getCardDefinition("harpon-a-ressort").cost);
  });

  it("le jouer frappe l'attaquant ; l'Objet est Brisé et part au Cimetière sans prendre de Slot", () => {
    const { harpon, attaquant, attaque } = attaqueContreHarponEnMain();
    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort")!;
    const riposte = dispatch(attaque.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat.sourceInstanceId,
      abilityIndex: candidat.abilityIndex,
    });
    ok(riposte);

    const p1 = riposte.state.players.find((p) => p.id === "p1")!;
    expect(p1.hand.some((c) => c.instanceId === harpon.instanceId)).toBe(false);
    expect(p1.graveyard.some((c) => c.instanceId === harpon.instanceId)).toBe(true);
    expect(p1.board).toHaveLength(0);
    expect(p1.reason).toBe(6 - getCardDefinition("harpon-a-ressort").cost);
    const survivant = board(riposte.state, "p2").find((u) => u.instanceId === attaquant.instanceId);
    if (survivant) expect(survivant.damageMarked).toBeGreaterThanOrEqual(2);
    expect(riposte.events.some((e) => e.type === "OBJECT_PLAYED" && e.instanceId === harpon.instanceId)).toBe(true);
    expect(riposte.events.some((e) => e.type === "OBJECT_BROKEN" && e.instanceId === harpon.instanceId)).toBe(true);
  });

  it("se joue même plateau plein : un Objet Chaîne ne demande pas d'emplacement", () => {
    const plein = Array.from({ length: 6 }, (_, i) => instance("marin-des-jetees", "p1", { slot: i }));
    const { harpon, attaque } = attaqueContreHarponEnMain(plein);
    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort");
    expect(candidat, "plateau plein, le Harpon se propose quand même").toBeDefined();
    const riposte = dispatch(attaque.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat!.sourceInstanceId,
      abilityIndex: candidat!.abilityIndex,
    });
    ok(riposte);
    expect(riposte.state.players.find((p) => p.id === "p1")!.graveyard.some((c) => c.instanceId === harpon.instanceId)).toBe(true);
  });

  it("c'est un Bris : Pantalone Sans-Sou rend sa Raison", () => {
    const pantalone = instance("pantalone-sans-sou", "p1");
    const { attaque } = attaqueContreHarponEnMain([pantalone]);
    const candidat = propositions(attaque.state, "p1").find((c) => c.cardId === "harpon-a-ressort")!;
    const riposte = dispatch(attaque.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat.sourceInstanceId,
      abilityIndex: candidat.abilityIndex,
    });
    ok(riposte);
    expect(riposte.state.players.find((p) => p.id === "p1")!.reason).toBe(6 - getCardDefinition("harpon-a-ressort").cost + 1);
  });

  it("hors de sa fenêtre, il ne se joue pas : playCard le refuse", () => {
    const enMain = instance("harpon-a-ressort", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [enMain], reason: 5 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: enMain.instanceId }).ok).toBe(false);
  });
});

describe("Objet joué : une carte jouée n'est pas une carte défaussée (refonte du 13/10/2026)", () => {
  it("La Marelle ne voit pas un Objet joué depuis la main", () => {
    const marelle = instance("la-marelle", "p1");
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { board: [marelle], hand: [seau], reason: 6 }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const anchorBefore = state.players[1]!.anchor;
    const joue = dispatch(state, { type: "playCard", playerId: "p1", instanceId: seau.instanceId });
    ok(joue);
    expect(joue.state.players[0]!.graveyard.some((c) => c.instanceId === seau.instanceId)).toBe(true);
    expect(joue.state.players[1]!.anchor).toBe(anchorBefore);
  });
});

describe("Objets Chaîne du lot : coût imprimé inchangé", () => {
  it("les Objets réactifs du lot coûtent 4 Raison, joués en réaction", () => {
    // Coût imprimé (garde-fou Notion) : le changer romprait l'équilibrage du lot.
    for (const id of [
      "harpon-a-ressort",
      "bouclier-decume",
      "signal-de-detresse",
      "corde-de-rappel",
      "contre-harpon",
    ]) {
      const def = getCardDefinition(id);
      expect(def.cost, id).toBe(4);
      expect(def.chaine, id).toBe(true);
    }
  });
});

describe("L'Amiral sans Pavillon : « si l'adversaire contrôle plus d'unités que vous »", () => {
  /** L'Amiral en main de p1 ; `miens` unités à p1, `siens` à p2 (dont une de coût 3, la cible). */
  function amiral(miens: number, siens: number) {
    const lui = instance("lamiral-sans-pavillon", "p1");
    const cible = instance("matelot-du-sans-nom", "p2");
    const state = table({
      players: [
        testPlayer("p1", {
          shipId: "le-brise-lames",
          reason: 10,
          reasonMax: 10,
          hand: [lui],
          board: Array.from({ length: miens }, () => instance("guetteur-mefiant", "p1")),
        }),
        testPlayer("p2", {
          shipId: "le-goliath",
          reason: 10,
          reasonMax: 10,
          board: [cible, ...Array.from({ length: siens - 1 }, () => instance("guetteur-mefiant", "p2"))],
        }),
      ],
    });
    return { lui, cible, state };
  }

  it("détruit la cible quand l'adversaire mène d'une unité AVANT son arrivée — lui-même ne compte pas", () => {
    // 1 contre 2 : compté avec l'Amiral, ce serait 2 contre 2 et l'effet ne partirait jamais.
    const { lui, cible, state } = amiral(1, 2);
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: lui.instanceId, targetInstanceId: cible.instanceId });
    ok(pose);
    // Les Guetteurs Méfiants répondent d'abord à la pose (ils passent) ; l'effet de l'Amiral, en réserve, s'active ensuite.
    let apres = pose.state;
    for (let garde = 0; apres.pendingReaction && garde < 4; garde += 1) {
      const passe = dispatch(apres, { type: "passReaction", playerId: apres.pendingReaction.awaitingPlayerId });
      ok(passe);
      apres = passe.state;
    }
    const effet = dispatch(apres, { type: "activateArrival", playerId: "p1", sourceInstanceId: lui.instanceId, abilityIndex: 0, targetInstanceId: cible.instanceId });
    ok(effet);
    expect(enJeu(effet.state, "p2", cible.instanceId)).toBe(false);
    expect(enJeu(effet.state, "p1", lui.instanceId)).toBe(true);
  });

  it("ne détruit rien à égalité d'unités", () => {
    const { lui, cible, state } = amiral(2, 2);
    const pose = dispatch(state, { type: "playCard", playerId: "p1", instanceId: lui.instanceId, targetInstanceId: cible.instanceId });
    ok(pose);
    expect(enJeu(pose.state, "p2", cible.instanceId)).toBe(true);
  });
});
