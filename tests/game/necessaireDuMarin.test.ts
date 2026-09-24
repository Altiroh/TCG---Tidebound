import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game/cards/sets/core";
import { handBreakCost } from "@/game/actions/breakObject";
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
 *  - un Objet réactif ne se Brise pas hors de sa fenêtre.
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

describe("Structures-pièges : une cartouche, pas un moteur", () => {
  /**
   * Chaque Réaction cachée du lot se termine par une destruction de la
   * porteuse. C'est la règle de design qui autorise des effets aussi durs :
   * vérifié sur la DÉFINITION de toutes, puis en jeu sur l'une d'elles.
   */
  it("toutes les Réactions cachées du lot se détruisent après résolution", () => {
    const pieges = [
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
    for (const id of pieges) {
      const cachee = getCardDefinition(id).abilities?.find((a) => a.hiddenReaction);
      expect(cachee, id).toBeDefined();
      const seDetruit = cachee!.effects.some(
        (e) => (e.type === "destroy" || e.type === "saborde") && e.target.kind === "self"
      );
      expect(seDetruit, `${id} : la Réaction cachée doit détruire la Structure`).toBe(true);
      // Et elle ne se remasque PAS : une cartouche ne se recharge pas.
      expect(cachee!.afterHiddenReaction, id).not.toBe("remasquable");
    }
  });

  it("Barils de Poudre part avec son coup : le Slot est libéré", () => {
    const piege = instance("barils-de-poudre", "p1", { turnsRemaining: 3 });
    // Trois corps en place : c'est le QUATRIÈME, celui qui arrive, qui
    // arme le piège. Au-delà, le plateau du Goliath (5 emplacements) ne
    // laisserait plus la place de le poser.
    const cibles = [0, 1, 2].map(() => instance("ptit-bout", "p2"));
    const arrivant = instance("ptit-bout", "p2");
    const state = table({
      environment: testEnvironment({ tideState: "calme" }),
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [piege] }),
        testPlayer("p2", { shipId: "le-goliath", board: cibles, hand: [arrivant], reason: 10, reasonMax: 10 }),
      ],
      activePlayerId: "p2",
    });

    // Calme : la Structure est masquée (visible en Tempête/Abysses), donc
    // c'est bien la Réaction CACHÉE qui se propose.
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    const candidats = propositions(pose.state, "p1");
    const candidat = candidats.find((c) => c.cardId === "barils-de-poudre");
    expect(candidat, "la Réaction cachée doit être proposée").toBeDefined();

    const tire = dispatch(pose.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat!.sourceInstanceId,
      abilityIndex: candidat!.abilityIndex,
    });
    ok(tire);

    // Les Péons 1/1 sont emportés par les 2 dégâts, et la Structure aussi.
    expect(board(tire.state, "p2").filter((u) => u.cardId === "ptit-bout")).toHaveLength(0);
    expect(enJeu(tire.state, "p1", piege.instanceId)).toBe(false);
  });
});

describe("Jugement du Phare", () => {
  function phare(ancrage: number, unitesAdverses: number) {
    const piege = instance("jugement-du-phare", "p1", { turnsRemaining: 3 });
    const cibles = Array.from({ length: unitesAdverses }, () => instance("ptit-bout", "p2"));
    const arrivant = instance("ptit-bout", "p2");
    return {
      piege,
      arrivant,
      state: testGameState({
        environment: testEnvironment({ tideState: "calme" }),
        players: [
          testPlayer("p1", { shipId: "le-brise-lames", anchor: ancrage, board: [piege] }),
          testPlayer("p2", { shipId: "le-goliath", board: cibles, hand: [arrivant], reason: 10, reasonMax: 10 }),
        ],
        activePlayerId: "p2",
      }),
    };
  }

  it("à cinq unités adverses, détruit tout le plateau d'en face et coûte 3 Ancrage", () => {
    // Quatre en place, la cinquième arrive : le Goliath a exactement
    // 5 emplacements, c'est le plateau plein qui déclenche le Jugement.
    const { piege, arrivant, state } = phare(30, 4);
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);

    const candidat = propositions(pose.state, "p1").find((c) => c.cardId === "jugement-du-phare");
    expect(candidat, "la Réaction cachée doit être proposée à 5 unités adverses").toBeDefined();

    const tire = dispatch(pose.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidat!.sourceInstanceId,
      abilityIndex: candidat!.abilityIndex,
    });
    ok(tire);

    expect(board(tire.state, "p2").filter((u) => u.cardId === "ptit-bout")).toHaveLength(0);
    expect(tire.state.players.find((p) => p.id === "p1")!.anchor).toBe(27);
    expect(enJeu(tire.state, "p1", piege.instanceId)).toBe(false);
  });

  it("ne se propose pas à quatre unités adverses : le seuil de la Réaction cachée est cinq", () => {
    const { arrivant, state } = phare(30, 3);
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    // 3 + celle qui arrive = 4 : le seuil visible est atteint, pas le caché.
    const cachee = propositions(pose.state, "p1").find(
      (c) => c.cardId === "jugement-du-phare" && getCardDefinition(c.cardId).abilities?.[c.abilityIndex]?.hiddenReaction
    );
    expect(cachee).toBeUndefined();
  });

  it("ne se propose pas si la coque ne survivrait pas au paiement", () => {
    // 3 Ancrage à payer, 3 en réserve : payer reviendrait à perdre.
    const { arrivant, state } = phare(3, 4);
    const pose = dispatch(state, { type: "playCard", playerId: "p2", instanceId: arrivant.instanceId });
    ok(pose);
    expect(propositions(pose.state, "p1").find((c) => c.cardId === "jugement-du-phare")).toBeUndefined();
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

  it("le bonus disparaît avec la visibilité : ce n'est pas un gain acquis", () => {
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
    expect(lire("calme")).toBe(base); // masquée : l'aura ne porte plus
  });

  it("l'aura ne touche que les unités, pas les Structures du même plateau", () => {
    const filet = instance("filet-de-sauvetage", "p1", { turnsRemaining: 3 });
    const structure = instance("epaves-accrochees", "p1", { turnsRemaining: 4 });
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
    expect(stats.health).toBe(getCardDefinition("epaves-accrochees").health);
  });
});

describe("Objets réactifs : seulement dans leur fenêtre", () => {
  it("Harpon à Ressort ne se propose pas hors d'une attaque adverse", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { shipId: "le-brise-lames", board: [harpon] }),
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
        testPlayer("p1", { shipId: "le-brise-lames", board: [harpon] }),
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
  });
});

describe("Objets réactifs : pas de Bris à la main", () => {
  it("Harpon à Ressort refuse un Bris manuel — sans attaque, il partait au Cimetière pour rien", () => {
    const harpon = instance("harpon-a-ressort", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [harpon] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: harpon.instanceId });
    expect(result.ok).toBe(false);
    // Depuis la main non plus : l'effet n'aurait pas davantage de cible.
    const enMain = instance("harpon-a-ressort", "p1");
    const depuisLaMain = testGameState({
      players: [testPlayer("p1", { hand: [enMain], reason: 5 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    expect(dispatch(depuisLaMain, { type: "breakObject", playerId: "p1", instanceId: enMain.instanceId, fromHand: true }).ok).toBe(false);
  });
});

describe("Bris depuis la main : la formule ne bouge pas", () => {
  it("reste max(1, ceil(coût imprimé / 2))", () => {
    // La règle citée par le cadrage, vérifiée sur ses propres exemples.
    for (const [imprime, attendu] of [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
    ] as const) {
      expect(handBreakCost({ cost: imprime } as never), `coût ${imprime}`).toBe(attendu);
    }
  });

  it("les Objets réactifs du lot coûtent bien 2 Raison depuis la main", () => {
    // Leur coût imprimé de 4 a été choisi POUR ça (garde-fou Notion) :
    // le baisser romprait l'équilibrage du lot.
    for (const id of [
      "harpon-a-ressort",
      "bouclier-decume",
      "signal-de-detresse",
      "corde-de-rappel",
      "planche-de-fortune",
      "contre-harpon",
    ]) {
      const def = getCardDefinition(id);
      expect(def.cost, id).toBe(4);
      expect(handBreakCost(def), id).toBe(2);
    }
  });
});
