import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { canBeEquipTarget, getCardDefinition } from "@/game/cards/sets/core";
import { resolveEffect } from "@/game/effects/resolveEffect";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { STATUS_MALADE } from "@/game/cards/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

const PEON = "peon-cra-poiscail";

/** Garde effectif (mots-clés conditionnels compris) sur une unité d'un plateau donné. */
function hasGarde(state: ReturnType<typeof testGameState>, playerId: string, instanceId: string): boolean {
  const player = state.players.find((p) => p.id === playerId)!;
  const unit = player.board.find((u) => u.instanceId === instanceId)!;
  return hasEffectiveKeyword(state, player, unit, "garde");
}

/** Péons présents sur le plateau d'un joueur. */
function peons(board: readonly { cardId: string }[]): number {
  return board.filter((unit) => unit.cardId === PEON).length;
}

describe("archétype Cra-Poiscail — invocation de Péons", () => {
  it("n'invoque rien si le Sauteur arrive seul, un Péon s'il accompagne déjà un Cra-Poiscail", () => {
    const sauteurSeul = instance("cra-poiscail-sauteur", "p1");
    const alone = testGameState({
      players: [testPlayer("p1", { hand: [sauteurSeul], reason: 10 }), testPlayer("p2")],
    });

    const played = dispatch(alone, { type: "playCard", playerId: "p1", instanceId: sauteurSeul.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(peons(played.state.players[0]!.board)).toBe(0);

    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const withFriend = testGameState({
      players: [
        testPlayer("p1", { hand: [sauteur], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const summoned = dispatch(withFriend, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(summoned.ok).toBe(true);
    if (!summoned.ok) return;
    expect(peons(summoned.state.players[0]!.board)).toBe(1);
  });

  it("donne au Péon invoqué une des trois variantes d'illustration, tirée avec le RNG de la partie", () => {
    const def = getCardDefinition(PEON);
    expect(def.illustrationVariants).toBe(3);

    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [sauteur], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const peon = result.state.players[0]!.board.find((unit) => unit.cardId === PEON)!;
    expect(peon.illustrationVariant).toBeGreaterThanOrEqual(1);
    expect(peon.illustrationVariant).toBeLessThanOrEqual(3);
    // Le RNG de la partie a avancé : le tirage n'est pas un `Math.random()`
    // hors de l'état, il est rejouable à l'identique.
    expect(result.state.rngState).not.toBe(state.rngState);
  });

  it("remplit les Slots libres sans les dépasser — on n'invoque pas plus qu'il n'en tient", () => {
    // Le Brise-Lames a 6 Slots. "Fesses en Avant !" est une Anomalie à
    // résolution immédiate : elle n'occupe aucun Slot (`permanent: false`).
    // Avec 5 permanents déjà posés, il ne reste donc qu'une place pour ses
    // 2 Péons.
    const anomalie = instance("fesses-en-avant", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", {
          hand: [anomalie],
          board: [
            instance("tetard-fesse", "p1"),
            instance("tetard-fesse", "p1"),
            instance("tetard-fesse", "p1"),
            instance("ptite-fesse", "p1"),
            instance("ptite-fesse", "p1"),
          ],
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const board = result.state.players[0]!.board;
    expect(peons(board)).toBe(1);
    expect(board.length).toBeLessThanOrEqual(6);
  });

  it("laisse les Péons de « Fesses en Avant ! » attaquer le tour même (Ruée)", () => {
    const anomalie = instance("fesses-en-avant", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [anomalie], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summoned = result.state.players[0]!.board.filter((unit) => unit.cardId === PEON);
    expect(summoned).toHaveLength(2);
    expect(summoned.every((unit) => unit.summoningSick === false)).toBe(true);
  });
});

describe("archétype Cra-Poiscail — Le Seau", () => {
  it("reste sur le plateau une fois posé, pour pouvoir être Brisé plus tard", () => {
    const seau = instance("le-seau", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [seau], reason: 10 }), testPlayer("p2")] });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: seau.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Un permanent sans Résistance meurt au premier `processDeaths` : tout
    // Objet doit en porter une, sinon il ne survit pas à sa propre pose.
    expect(result.state.players[0]!.board.some((u) => u.cardId === "le-seau")).toBe(true);
  });

  it("invoque 1 Péon depuis le board, 2 en Bris depuis la main auprès d'un Cra-Poiscail", () => {
    const seauBoard = instance("le-seau", "p1");
    const fromBoard = testGameState({
      players: [
        testPlayer("p1", { board: [seauBoard, instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const broken = dispatch(fromBoard, { type: "breakObject", playerId: "p1", instanceId: seauBoard.instanceId });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    // Depuis le board : la clause "depuis la main" ne s'applique pas.
    expect(peons(broken.state.players[0]!.board)).toBe(1);

    const seauHand = instance("le-seau", "p1");
    const fromHand = testGameState({
      players: [
        testPlayer("p1", { hand: [seauHand], board: [instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const brokenFromHand = dispatch(fromHand, {
      type: "breakObject",
      playerId: "p1",
      instanceId: seauHand.instanceId,
      fromHand: true,
    });
    expect(brokenFromHand.ok).toBe(true);
    if (!brokenFromHand.ok) return;
    expect(peons(brokenFromHand.state.players[0]!.board)).toBe(2);
  });

  it("n'invoque qu'un Péon en Bris depuis la main sans aucun Cra-Poiscail en jeu — le Péon créé ne satisfait pas sa propre condition", () => {
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [seau], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId, fromHand: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(peons(result.state.players[0]!.board)).toBe(1);
  });
});

describe("archétype Cra-Poiscail — bonus de banc", () => {
  it("donne +1 Puissance au Banc à partir de 3 AUTRES Cra-Poiscail, pas avant", () => {
    const banc = instance("banc-de-cra-poiscail", "p1");
    const board = [banc, instance("tetard-fesse", "p1"), instance("ptite-fesse", "p1")];
    const player = testPlayer("p1", { board });

    // 2 autres Cra-Poiscail (le Banc ne se compte pas lui-même) : pas de bonus.
    const below = computeEffectiveStats(banc, "calme", { controllerBoard: board, controllerReason: player.reason });
    expect(below.attack).toBe(2);

    const biggerBoard = [...board, instance("cra-poiscail-grand-gueule", "p1")];
    const above = computeEffectiveStats(banc, "calme", {
      controllerBoard: biggerBoard,
      controllerReason: player.reason,
    });
    expect(above.attack).toBe(3);
  });

  it("compte les Péons invoqués comme des Cra-Poiscail", () => {
    const banc = instance("banc-de-cra-poiscail", "p1");
    const board = [banc, instance(PEON, "p1"), instance(PEON, "p1"), instance(PEON, "p1")];
    const stats = computeEffectiveStats(banc, "calme", { controllerBoard: board, controllerReason: 10 });
    expect(stats.attack).toBe(3);
  });
});

describe("jetons", () => {
  it("le Péon est hors du catalogue collectionnable mais résolvable par le moteur", async () => {
    const { CORE_SET } = await import("@/game/cards/sets/core");
    expect(CORE_SET.some((def) => def.id === PEON)).toBe(false);
    expect(getCardDefinition(PEON).token).toBe(true);
  });
});

describe("archétype Cra-Poiscail — capacités d'observateur (Booster 2)", () => {
  it("le Bavard donne +1 Puissance au Cra-Poiscail qui arrive, une seule fois par tour", () => {
    const bavard = instance("cra-poiscail-bavard", "p1");
    const premier = instance("tetard-fesse", "p1");
    const second = instance("ptite-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [premier, second], board: [bavard], reason: 10 }), testPlayer("p2")],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: premier.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // "il gagne" = l'arrivant (Têtard-Fesse 1/1 → 2/1), pas le Bavard.
    const arrivant = first.state.players[0]!.board.find((u) => u.instanceId === premier.instanceId)!;
    expect(computeEffectiveStats(arrivant, "calme").attack).toBe(2);
    const bavardAfter = first.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!;
    expect(computeEffectiveStats(bavardAfter, "calme").attack).toBe(1);

    const second1 = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: second.instanceId });
    expect(second1.ok).toBe(true);
    if (!second1.ok) return;
    // "La première fois à chaque tour" : la deuxième arrivée ne reçoit rien.
    const afterSecond = second1.state.players[0]!.board.find((u) => u.instanceId === second.instanceId)!;
    expect(computeEffectiveStats(afterSecond, "calme").attack).toBe(1);
  });

  it("ne réagit pas à sa propre arrivée ni à un Cra-Poiscail adverse", () => {
    const bavard = instance("cra-poiscail-bavard", "p1");
    const ownEntry = testGameState({
      players: [testPlayer("p1", { hand: [bavard], reason: 10 }), testPlayer("p2")],
    });
    const played = dispatch(ownEntry, { type: "playCard", playerId: "p1", instanceId: bavard.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const self = played.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!;
    expect(computeEffectiveStats(self, "calme").attack).toBe(1);

    // L'adversaire pose un Cra-Poiscail : rien pour le Bavard (`sameController`).
    const opponentCard = instance("tetard-fesse", "p2");
    const withOpponent = testGameState({
      activePlayerId: "p2",
      players: [
        testPlayer("p1", { board: [instance("cra-poiscail-bavard", "p1")] }),
        testPlayer("p2", { hand: [opponentCard], reason: 10 }),
      ],
    });
    const opponentPlay = dispatch(withOpponent, { type: "playCard", playerId: "p2", instanceId: opponentCard.instanceId });
    expect(opponentPlay.ok).toBe(true);
    if (!opponentPlay.ok) return;
    // Ni le Bavard, ni le Cra-Poiscail adverse qui vient d'arriver.
    const untouched = opponentPlay.state.players[0]!.board[0]!;
    expect(computeEffectiveStats(untouched, "calme").attack).toBe(1);
    const enemyArrival = opponentPlay.state.players[1]!.board.find((u) => u.instanceId === opponentCard.instanceId)!;
    expect(computeEffectiveStats(enemyArrival, "calme").attack).toBe(1);
  });

  it("voit arriver un Péon invoqué, pas seulement une carte posée", () => {
    const bavard = instance("cra-poiscail-bavard", "p1");
    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [sauteur], board: [bavard], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Le Péon invoqué par le Sauteur arrive lui aussi en jeu : c'est LUI
    // (première arrivée résolue du tour) que le Bavard renforce, 1/1 → 2/1.
    expect(peons(result.state.players[0]!.board)).toBe(1);
    const peon = result.state.players[0]!.board.find((u) => u.cardId === PEON)!;
    expect(computeEffectiveStats(peon, "calme").attack).toBe(2);
  });

  it("le Ramasseur profite du Bris d'un Objet, y compris depuis la main", () => {
    const ramasseur = instance("cra-poiscail-ramasseur", "p1");
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [seau], board: [ramasseur], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId, fromHand: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const buffed = result.state.players[0]!.board.find((u) => u.instanceId === ramasseur.instanceId)!;
    const stats = computeEffectiveStats(buffed, "calme");
    expect(stats.attack).toBe(3);
    expect(stats.health).toBe(3);
  });

  it("La Grande Migration remplace un Cra-Poiscail détruit par un Péon, une fois par tour", () => {
    const migration = instance("la-grande-migration", "p1");
    const victime = instance("tetard-fesse", "p1", { damageMarked: 0 });
    const state = testGameState({
      players: [testPlayer("p1", { board: [migration, victime] }), testPlayer("p2")],
    });

    // Une Créature 1/1 qui prend 1 dégât meurt au prochain `processDeaths`,
    // déclenché par n'importe quelle action du moteur.
    const damaged = {
      ...state,
      players: [
        { ...state.players[0]!, board: [migration, { ...victime, damageMarked: 5 }] },
        state.players[1]!,
      ] as typeof state.players,
    };

    const result = dispatch(damaged, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(peons(result.state.players[0]!.board)).toBe(1);
  });

  it("l'orientation de la Marée décide du bonus des Bas-Fonds et des Hautes-Eaux", () => {
    const basFonds = instance("cra-poiscail-des-bas-fonds", "p1");
    const hautesEaux = instance("cra-poiscail-des-hautes-eaux", "p1");
    const board = [basFonds, hautesEaux];

    const montante = { controllerBoard: board, controllerReason: 10, tideOrientation: "montante" as const };
    expect(computeEffectiveStats(basFonds, "calme", montante).attack).toBe(2);
    expect(computeEffectiveStats(hautesEaux, "calme", montante).attack).toBe(2);

    const descendante = { controllerBoard: board, controllerReason: 10, tideOrientation: "descendante" as const };
    expect(computeEffectiveStats(basFonds, "calme", descendante).attack).toBe(3);
    expect(computeEffectiveStats(hautesEaux, "calme", descendante).attack).toBe(1);
  });

  it("le Trône de Bouchon ne renforce le banc qu'à partir de 3 Cra-Poiscail", () => {
    const trone = instance("le-trone-de-bouchon", "p1");
    const unite = instance("tetard-fesse", "p1");

    const small = [trone, unite];
    expect(computeEffectiveStats(unite, "calme", { controllerBoard: small, controllerReason: 10 }).attack).toBe(1);

    const big = [trone, unite, instance("ptite-fesse", "p1"), instance("tetard-fesse", "p1")];
    expect(computeEffectiveStats(unite, "calme", { controllerBoard: big, controllerReason: 10 }).attack).toBe(2);
  });

  it("un Équipement de la famille ne peut se poser que sur un Cra-Poiscail", () => {
    const slip = getCardDefinition("slip-de-guerre-cra-poiscail");
    const cra = instance("tetard-fesse", "p1");
    const etranger = instance("murene-aveugle", "p1");
    const board = [cra, etranger];
    expect(canBeEquipTarget(slip, board, cra)).toBe(true);
    expect(canBeEquipTarget(slip, board, etranger)).toBe(false);
  });
});

describe("archétype Cra-Poiscail — branche Chevalier (Booster 3)", () => {
  it("le Chevalier gagne +1 Puissance ET Garde tant qu'un Destrier l'accompagne", () => {
    const chevalier = instance("chevalier-cra-poiscail", "p1");
    const destrier = instance("destrier-du-grand-etang", "p1");

    const seul = testGameState({ players: [testPlayer("p1", { board: [chevalier] }), testPlayer("p2")] });
    const soloStats = computeEffectiveStats(chevalier, "calme", {
      controllerBoard: seul.players[0]!.board,
      controllerReason: 10,
    });
    expect(soloStats.attack).toBe(3);
    expect(hasGarde(seul, "p1", chevalier.instanceId)).toBe(false);

    const monte = testGameState({ players: [testPlayer("p1", { board: [chevalier, destrier] }), testPlayer("p2")] });
    const montedStats = computeEffectiveStats(chevalier, "calme", {
      controllerBoard: monte.players[0]!.board,
      controllerReason: 10,
    });
    expect(montedStats.attack).toBe(4);
    // +1 Résistance de l'aura du Destrier par-dessus la base 3.
    expect(montedStats.health).toBe(4);
    expect(hasGarde(monte, "p1", chevalier.instanceId)).toBe(true);
  });

  it("l'Écuyer et le Destrier cumulent leur Résistance sur le Chevalier", () => {
    const chevalier = instance("chevalier-cra-poiscail", "p1");
    const board = [chevalier, instance("destrier-du-grand-etang", "p1"), instance("ecuyer-cra-poiscail", "p1")];
    const stats = computeEffectiveStats(chevalier, "calme", { controllerBoard: board, controllerReason: 10 });
    expect(stats.health).toBe(5);
  });

  it("Le Grand Saut invoque trois Péons 2/1 prêts à attaquer", () => {
    const saut = instance("le-grand-saut", "p1");
    const state = testGameState({ players: [testPlayer("p1", { hand: [saut], reason: 10 }), testPlayer("p2")] });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: saut.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summoned = result.state.players[0]!.board.filter((u) => u.cardId === PEON);
    expect(summoned).toHaveLength(3);
    for (const peon of summoned) {
      expect(peon.summoningSick).toBe(false);
      expect(computeEffectiveStats(peon, "calme").attack).toBe(2);
    }
  });

  it("Le Tournoi ne fait piocher que si les trois champions sont là", () => {
    const deck = [instance("tetard-fesse", "p1"), instance("ptite-fesse", "p1")];

    const incomplet = instance("le-tournoi-du-grand-etang", "p1");
    const sansBourreau = testGameState({
      players: [
        testPlayer("p1", {
          hand: [incomplet],
          board: [instance("chevalier-cra-poiscail", "p1"), instance("destrier-du-grand-etang", "p1")],
          deck,
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });
    const partial = dispatch(sansBourreau, { type: "playCard", playerId: "p1", instanceId: incomplet.instanceId });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.state.players[0]!.hand).toHaveLength(0);

    const complet = instance("le-tournoi-du-grand-etang", "p1");
    const avecBourreau = testGameState({
      players: [
        testPlayer("p1", {
          hand: [complet],
          board: [
            instance("chevalier-cra-poiscail", "p1"),
            instance("destrier-du-grand-etang", "p1"),
            instance("bourreau-cra-poiscail", "p1"),
          ],
          deck,
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });
    const full = dispatch(avecBourreau, { type: "playCard", playerId: "p1", instanceId: complet.instanceId });
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.state.players[0]!.hand).toHaveLength(1);
  });

  it("la Bannière ne renforce que les Cra-Poiscail INVOQUÉS, pas ceux posés de la main", () => {
    const banniere = instance("banniere-en-vieille-chaussette", "p1");
    const porteur = instance("tetard-fesse", "p1");
    const pose = instance("ptite-fesse", "p1");

    const posee = testGameState({
      players: [
        testPlayer("p1", {
          hand: [pose],
          board: [porteur, { ...banniere, attachedToInstanceId: porteur.instanceId }],
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });
    const played = dispatch(posee, { type: "playCard", playerId: "p1", instanceId: pose.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const posee2 = played.state.players[0]!.board.find((u) => u.instanceId === pose.instanceId)!;
    expect(computeEffectiveStats(posee2, "calme").attack).toBe(1);

    const seau = instance("le-seau", "p1");
    const invoquee = testGameState({
      players: [
        testPlayer("p1", {
          hand: [seau],
          board: [porteur, { ...banniere, attachedToInstanceId: porteur.instanceId }],
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });
    const broken = dispatch(invoquee, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId, fromHand: true });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;
    const peon = broken.state.players[0]!.board.find((u) => u.cardId === PEON)!;
    expect(computeEffectiveStats(peon, "calme").attack).toBe(2);
  });

  it("le Roi Abyssal fait payer 1 Raison au premier Péon du tour, une seule fois", () => {
    const roi = instance("roi-cra-poiscail-abyssal", "p1");
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [roi, seau], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Coût du Bris depuis le board (0) + 1 Raison perdue pour le Péon arrivé.
    expect(result.state.players[0]!.reason).toBe(9);
  });
});

describe("comptage d'archétype — Marins et Créatures uniquement", () => {
  it("ignore les Structures, Objets et Anomalies de la famille dans les seuils", () => {
    const banc = instance("banc-de-cra-poiscail", "p1");
    // Trois "Cra-Poiscail" non-unités : le seuil de 3 AUTRES ne doit pas s'allumer.
    const decor = [banc, instance("la-flaque-sacree", "p1"), instance("le-seau", "p1"), instance("le-trone-de-bouchon", "p1")];
    expect(computeEffectiveStats(banc, "calme", { controllerBoard: decor, controllerReason: 10 }).attack).toBe(2);

    const vraiBanc = [banc, instance("tetard-fesse", "p1"), instance("ptite-fesse", "p1"), instance(PEON, "p1")];
    expect(computeEffectiveStats(banc, "calme", { controllerBoard: vraiBanc, controllerReason: 10 }).attack).toBe(3);
  });

  it("le Sauteur n'invoque pas si la famille n'est représentée que par des Objets", () => {
    const sauteur = instance("cra-poiscail-sauteur", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [sauteur], board: [instance("le-seau", "p1")], reason: 10 }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: sauteur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(peons(result.state.players[0]!.board)).toBe(0);
  });
});

describe("durées de bonus", () => {
  it("un bonus « jusqu'à la fin du tour » tombe dès que le tour se termine", () => {
    const bavard = instance("cra-poiscail-bavard", "p1");
    const arrivant = instance("tetard-fesse", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [arrivant], board: [bavard], reason: 10, deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { deck: [instance("murene-aveugle", "p2")] }),
      ],
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: arrivant.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(computeEffectiveStats(played.state.players[0]!.board.find((u) => u.instanceId === arrivant.instanceId)!, "calme").attack).toBe(2);

    const ended = dispatch(played.state, { type: "endTurn", playerId: "p1" });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    // Le +1 servait à attaquer ce tour-ci : il ne doit pas servir à défendre ensuite.
    const after = ended.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === arrivant.instanceId)!;
    expect(computeEffectiveStats(after, "calme").attack).toBe(1);
  });

  it("un bonus « jusqu'à votre prochain tour » survit au tour adverse", () => {
    const flaque = instance("la-flaque-sacree", "p1");
    const arrivant = instance("tetard-fesse", "p1");
    // Des decks non vides : une pioche à vide déclencherait le Jugement de
    // l'Océan et terminerait la partie avant la fin du test.
    const deck = () => [instance("murene-aveugle", "p1"), instance("murene-aveugle", "p1"), instance("murene-aveugle", "p1")];
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [arrivant], board: [flaque], reason: 10, deck: deck() }),
        testPlayer("p2", { reason: 10, deck: deck() }),
      ],
    });

    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: arrivant.instanceId });
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    const buffed = played.state.players[0]!.board.find((u) => u.instanceId === arrivant.instanceId)!;
    expect(computeEffectiveStats(buffed, "calme").health).toBe(2);

    const p1Ended = dispatch(played.state, { type: "endTurn", playerId: "p1" });
    expect(p1Ended.ok).toBe(true);
    if (!p1Ended.ok) return;
    // Pendant le tour adverse, la Résistance tient encore.
    const duringOpponentTurn = p1Ended.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === arrivant.instanceId)!;
    expect(computeEffectiveStats(duringOpponentTurn, "calme").health).toBe(2);

    const p2Ended = dispatch(p1Ended.state, { type: "endTurn", playerId: "p2" });
    expect(p2Ended.ok).toBe(true);
    if (!p2Ended.ok) return;
    const backToOwner = p2Ended.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === arrivant.instanceId)!;
    expect(computeEffectiveStats(backToOwner, "calme").health).toBe(1);
  });
});

describe("P'tite Fesse, Grand Rêve — réagit à tout gain de Puissance", () => {
  it("se déclenche quand un buff explicite renforce un autre Cra-Poiscail", () => {
    const reve = instance("ptite-fesse-grand-reve", "p1");
    const porteur = instance("tetard-fesse", "p1");
    const banniere = instance("banniere-en-vieille-chaussette", "p1");
    const seau = instance("le-seau", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", {
          board: [reve, porteur, { ...banniere, attachedToInstanceId: porteur.instanceId }, seau],
          reason: 10,
        }),
        testPlayer("p2"),
      ],
    });

    // Le Bris invoque un Péon, que la Bannière renforce : ce Péon gagne
    // de la Puissance, donc P'tite Fesse aussi.
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: seau.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = result.state.players[0]!.board.find((u) => u.instanceId === reve.instanceId)!;
    expect(computeEffectiveStats(after, "calme").attack).toBe(2);
  });

  it("se déclenche aussi sur un bonus de plateau, sans buff posé", () => {
    const reve = instance("ptite-fesse-grand-reve", "p1");
    const etendard = instance("cra-poiscail-porte-etendard", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [etendard], board: [reve, instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    // Le Porte-Étendard arrive : le Têtard-Fesse passe de 1 à 2 Puissance
    // sans qu'aucun buff ne lui soit posé — c'est un gain quand même.
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: etendard.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const board = result.state.players[0]!.board;
    const after = board.find((u) => u.instanceId === reve.instanceId)!;
    // 1 de base + 1 de l'aura du Porte-Étendard + 1 de sa propre capacité.
    expect(
      computeEffectiveStats(after, "calme", { controllerBoard: board, controllerReason: 10 }).attack
    ).toBe(3);
  });
});

/** Puissance/Résistance effectives d'une unité, vues depuis le plateau de son contrôleur. */
function statsOf(state: ReturnType<typeof testGameState>, playerId: string, instanceId: string) {
  const player = state.players.find((p) => p.id === playerId)!;
  const unit = player.board.find((u) => u.instanceId === instanceId)!;
  return computeEffectiveStats(unit, state.environment.tideState, {
    controllerBoard: player.board,
    controllerReason: player.reason,
    tideOrientation: state.environment.tideOrientation,
  });
}

describe("archétype Cra-Poiscail — cibles désignées par le joueur", () => {
  it("Le Tas de Trucs : briser un Objet ouvre une fenêtre où le joueur choisit QUEL Cra-Poiscail gagne +1 / +1", () => {
    const tas = instance("le-tas-de-trucs", "p1");
    const objet = instance("cartes-des-courants", "p1");
    const cible = instance("tetard-fesse", "p1"); // Cra-Poiscail 1/1
    const autre = instance("ptite-fesse", "p1"); // Cra-Poiscail 1/2, l'autre choix possible
    const state = testGameState({
      players: [testPlayer("p1", { board: [tas, objet, cible, autre], reason: 10 }), testPlayer("p2")],
    });

    const broken = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;

    // Rien n'est appliqué d'office : c'est au joueur de désigner sa cible.
    expect(broken.state.pendingReaction?.awaitingPlayerId).toBe("p1");
    expect(statsOf(broken.state, "p1", cible.instanceId).attack).toBe(1);

    const activated = dispatch(broken.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: tas.instanceId,
      abilityIndex: 0,
      targetInstanceId: cible.instanceId,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;

    expect(statsOf(activated.state, "p1", cible.instanceId).attack).toBe(2);
    expect(statsOf(activated.state, "p1", cible.instanceId).health).toBe(2);
    // L'autre Cra-Poiscail n'a rien reçu : le choix portait bien sur une seule carte.
    expect(statsOf(activated.state, "p1", autre.instanceId).attack).toBe(1);
  });

  it("Le Tas de Trucs : refuse une cible hors famille, et ne se propose pas du tout sans Cra-Poiscail à renforcer", () => {
    const tas = instance("le-tas-de-trucs", "p1");
    const objet = instance("cartes-des-courants", "p1");
    const horsFamille = instance("marin-des-jetees", "p1");
    const withTarget = testGameState({
      players: [
        testPlayer("p1", { board: [tas, objet, horsFamille, instance("tetard-fesse", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });

    const broken = dispatch(withTarget, { type: "breakObject", playerId: "p1", instanceId: objet.instanceId });
    expect(broken.ok).toBe(true);
    if (!broken.ok) return;

    const illegal = dispatch(broken.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: tas.instanceId,
      abilityIndex: 0,
      targetInstanceId: horsFamille.instanceId,
    });
    expect(illegal.ok).toBe(false);

    // Même plateau sans le moindre Cra-Poiscail : la fenêtre ne s'ouvre pas.
    const tasSeul = instance("le-tas-de-trucs", "p1");
    const objetSeul = instance("cartes-des-courants", "p1");
    const withoutTarget = testGameState({
      players: [
        testPlayer("p1", { board: [tasSeul, objetSeul, instance("marin-des-jetees", "p1")], reason: 10 }),
        testPlayer("p2"),
      ],
    });
    const brokenAlone = dispatch(withoutTarget, { type: "breakObject", playerId: "p1", instanceId: objetSeul.instanceId });
    expect(brokenAlone.ok).toBe(true);
    if (!brokenAlone.ok) return;
    expect(brokenAlone.state.pendingReaction).toBeUndefined();
  });

  it("Le Tas de Trucs : une seule fois par tour, quel que soit le nombre d'Objets brisés", () => {
    const tas = instance("le-tas-de-trucs", "p1");
    const premier = instance("cartes-des-courants", "p1");
    const second = instance("cartes-des-courants", "p1");
    const cible = instance("tetard-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [tas, premier, second, cible], reason: 10 }), testPlayer("p2")],
    });

    const first = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: premier.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const used = dispatch(first.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: tas.instanceId,
      abilityIndex: 0,
      targetInstanceId: cible.instanceId,
    });
    expect(used.ok).toBe(true);
    if (!used.ok) return;

    const secondBreak = dispatch(used.state, { type: "breakObject", playerId: "p1", instanceId: second.instanceId });
    expect(secondBreak.ok).toBe(true);
    if (!secondBreak.ok) return;
    expect(secondBreak.state.pendingReaction).toBeUndefined();
  });

  it("Fourchette du Grand Étang : l'attaque du PORTEUR renforce directement un AUTRE Cra-Poiscail, sans fenêtre", () => {
    const porteur = instance("tetard-fesse", "p1"); // 1/1 Cra-Poiscail
    const fourchette = instance("fourchette-du-grand-etang", "p1", { attachedToInstanceId: porteur.instanceId });
    const autre = instance("ptite-fesse", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [porteur, fourchette, autre], reason: 10 }), testPlayer("p2")],
    });

    const attacked = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: porteur.instanceId });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;

    // Chaîné à l'attaque : aucune fenêtre à voir, l'autre Cra-Poiscail est
    // déjà renforcé — et « un AUTRE » : ni l'Équipement, ni le porteur.
    expect(attacked.state.pendingReaction).toBeUndefined();
    expect(statsOf(attacked.state, "p1", autre.instanceId).attack).toBe(2);
    // Le porteur n'a rien reçu de CETTE capacité (« un AUTRE ») : son 1 + 1
    // vient de l'aura de la Fourchette qu'il porte, et de rien d'autre.
    expect(statsOf(attacked.state, "p1", porteur.instanceId).attack).toBe(2);
  });

  it("Fourchette du Grand Étang : sans autre Cra-Poiscail, l'attaque passe et rien ne se déclenche", () => {
    const porteur = instance("tetard-fesse", "p1");
    const fourchette = instance("fourchette-du-grand-etang", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [porteur, fourchette], reason: 10 }), testPlayer("p2")],
    });

    const attacked = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: porteur.instanceId });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;
    expect(attacked.state.pendingReaction).toBeUndefined();
  });

  it("Chevalier Cra-Poiscail Abyssal : sa propre attaque renforce directement un autre Cra-Poiscail, une fois par tour", () => {
    const chevalier = instance("chevalier-cra-poiscail-abyssal", "p1");
    const autre = instance("tetard-fesse", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [chevalier, autre], reason: 10 }), testPlayer("p2")],
    });

    const attacked = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: chevalier.instanceId });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;

    expect(attacked.state.pendingReaction).toBeUndefined();
    expect(statsOf(attacked.state, "p1", autre.instanceId).attack).toBe(2);
    expect(statsOf(attacked.state, "p1", autre.instanceId).health).toBe(2);
  });
});

describe("Casque-Coquille — bouclier contre les dégâts d'effet", () => {
  it("réduit de 1 les dégâts d'un effet de carte, puis se détruit", () => {
    const porteur = instance("tetard-fesse", "p1", { damageMarked: 0 });
    const casque = instance("casque-coquille", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, casque] }), testPlayer("p2")],
    });

    const damaged = resolveEffect(
      state,
      { type: "damage", target: { kind: "chosenUnit" }, amount: { kind: "flat", value: 2 } },
      { controllerId: "p2", chosenTargetInstanceId: porteur.instanceId, turnNumber: 1 }
    );

    const survivor = damaged.state.players[0]!.board.find((u) => u.instanceId === porteur.instanceId)!;
    expect(survivor.damageMarked).toBe(1);
    // L'Équipement a payé de sa personne.
    expect(damaged.state.players[0]!.board.some((u) => u.instanceId === casque.instanceId)).toBe(false);
    expect(damaged.state.players[0]!.graveyard.some((u) => u.instanceId === casque.instanceId)).toBe(true);
  });

  it("ne joue qu'une fois : le second effet frappe à plein", () => {
    const porteur = instance("cra-poiscail-des-hautes-eaux", "p1"); // 1/3, encaisse deux coups
    const casque = instance("casque-coquille", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, casque] }), testPlayer("p2")],
    });
    const effect = { type: "damage" as const, target: { kind: "chosenUnit" as const }, amount: { kind: "flat" as const, value: 1 } };
    const context = { controllerId: "p2", chosenTargetInstanceId: porteur.instanceId, turnNumber: 1 };

    const first = resolveEffect(state, effect, context);
    expect(first.state.players[0]!.board.find((u) => u.instanceId === porteur.instanceId)!.damageMarked).toBe(0);

    const second = resolveEffect(first.state, effect, context);
    expect(second.state.players[0]!.board.find((u) => u.instanceId === porteur.instanceId)!.damageMarked).toBe(1);
  });

  it("n'intercepte PAS les dégâts de combat — c'est un dégât physique, pas un effet", () => {
    const porteur = instance("cra-poiscail-des-hautes-eaux", "p1"); // 1/3
    const casque = instance("casque-coquille", "p1", { attachedToInstanceId: porteur.instanceId });
    const attaquant = instance("marin-des-jetees", "p2");
    const state = testGameState({
      phase: "combatPhase",
      activePlayerId: "p2",
      players: [testPlayer("p1", { board: [porteur, casque] }), testPlayer("p2", { board: [attaquant] })],
    });

    const attacked = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: attaquant.instanceId,
      defenderInstanceId: porteur.instanceId,
    });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;

    const attaquantDef = getCardDefinition("marin-des-jetees");
    const defender = attacked.state.players[0]!.board.find((u) => u.instanceId === porteur.instanceId);
    expect(defender?.damageMarked).toBe(attaquantDef.attack);
    // Le Casque est toujours là : rien ne l'a consommé.
    expect(attacked.state.players[0]!.board.some((u) => u.instanceId === casque.instanceId)).toBe(true);
  });
});

describe("Casque-Coquille — les dégâts de Marée sont des dégâts d'effet", () => {
  it("absorbe le dégât de MALADE de la Houle et se détruit, laissant le porteur intact", () => {
    const porteur = instance("cra-poiscail-des-hautes-eaux", "p1", { statuses: [STATUS_MALADE] });
    const casque = instance("casque-coquille", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, casque] }), testPlayer("p2")],
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 5 }),
    });

    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const unit = result.state.players[0]!.board.find((u) => u.instanceId === porteur.instanceId);
    expect(unit?.damageMarked).toBe(0);
    expect(result.state.players[0]!.board.some((u) => u.instanceId === casque.instanceId)).toBe(false);
  });
});

describe("déclencheurs d'attaque filtrés par carte", () => {
  it("La Quête du Grand Nénuphar reconnaît le Chevalier qui attaque (l'événement porte enfin son cardId)", () => {
    const quete = instance("la-quete-du-grand-nenuphar", "p1");
    const chevalier = instance("chevalier-cra-poiscail", "p1");
    const destrier = instance("destrier-du-grand-etang", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [quete, chevalier, destrier], reason: 5 }), testPlayer("p2")],
    });

    const attacked = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: chevalier.instanceId });
    expect(attacked.ok).toBe(true);
    if (!attacked.ok) return;
    expect(attacked.state.players[0]!.reason).toBe(6);

    // Un autre attaquant que le Chevalier ne déclenche rien.
    const autre = instance("tetard-fesse", "p1");
    const quete2 = instance("la-quete-du-grand-nenuphar", "p1");
    const neutral = testGameState({
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [quete2, autre, instance("destrier-du-grand-etang", "p1")], reason: 5 }),
        testPlayer("p2"),
      ],
    });
    const other = dispatch(neutral, { type: "attack", playerId: "p1", attackerInstanceId: autre.instanceId });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.state.players[0]!.reason).toBe(5);
  });
});

describe("Équipements — le sort de l'Équipement suit celui de son porteur", () => {
  /** Slip de Guerre (Équipement Cra-Poiscail, +1 Résistance permanent) déjà attaché à `wearer`. */
  function equipped(wearerInstanceId: string) {
    return instance("slip-de-guerre-cra-poiscail", "p1", { attachedToInstanceId: wearerInstanceId });
  }

  it("part au cimetière quand le permanent équipé est détruit au combat", () => {
    const porteur = instance("tetard-fesse", "p1", { damageMarked: 0 });
    const slip = equipped(porteur.instanceId);
    // Un attaquant adverse assez fort pour tuer le porteur (1/1, +1 Rés. par le Slip → 1/2).
    const assaillant = instance("cra-poiscail-grand-gueule", "p2", { summoningSick: false });
    const state = testGameState({
      activePlayerId: "p2",
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [porteur, slip] }), testPlayer("p2", { board: [assaillant] })],
    });

    const result = dispatch(state, {
      type: "attack",
      playerId: "p2",
      attackerInstanceId: assaillant.instanceId,
      defenderInstanceId: porteur.instanceId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.board.some((u) => u.instanceId === porteur.instanceId)).toBe(false);
    expect(p1.board.some((u) => u.instanceId === slip.instanceId)).toBe(false);
    expect(p1.graveyard.some((c) => c.instanceId === slip.instanceId)).toBe(true);
  });

  it("part au cimetière quand le permanent équipé est sabordé", () => {
    const porteur = instance("tetard-fesse", "p1");
    const slip = equipped(porteur.instanceId);
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, slip] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: porteur.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p1 = result.state.players.find((p) => p.id === "p1")!;
    expect(p1.board).toHaveLength(0);
    expect(p1.graveyard.map((c) => c.instanceId)).toContain(slip.instanceId);
  });

  it("reste en jeu tant que son porteur y est, et ne concerne pas un Équipement jamais attaché", () => {
    const porteur = instance("tetard-fesse", "p1");
    const slip = equipped(porteur.instanceId);
    const libre = instance("slip-de-guerre-cra-poiscail", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [porteur, slip, libre] }), testPlayer("p2")],
    });

    const result = dispatch(state, { type: "advancePhase", playerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.board).toHaveLength(3);
  });
});
