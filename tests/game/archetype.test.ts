import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { canBeEquipTarget, getCardDefinition } from "@/game/cards/sets/core";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { instance, testGameState, testPlayer } from "./testHelpers";

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
  it("le Bavard gagne +1 Puissance quand un autre Cra-Poiscail arrive, une seule fois par tour", () => {
    const bavard = instance("cra-poiscail-bavard", "p1");
    const premier = instance("tetard-fesse", "p1");
    const second = instance("ptite-fesse", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { hand: [premier, second], board: [bavard], reason: 10 }), testPlayer("p2")],
    });

    const first = dispatch(state, { type: "playCard", playerId: "p1", instanceId: premier.instanceId });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const afterFirst = first.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!;
    expect(computeEffectiveStats(afterFirst, "calme").attack).toBe(2);

    const second1 = dispatch(first.state, { type: "playCard", playerId: "p1", instanceId: second.instanceId });
    expect(second1.ok).toBe(true);
    if (!second1.ok) return;
    // "La première fois à chaque tour" : la deuxième arrivée ne rebuffe pas.
    const afterSecond = second1.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!;
    expect(computeEffectiveStats(afterSecond, "calme").attack).toBe(2);
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
    const untouched = opponentPlay.state.players[0]!.board[0]!;
    expect(computeEffectiveStats(untouched, "calme").attack).toBe(1);
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

    // Le Sauteur arrive (1er déclenchement, consommé), puis invoque un Péon.
    expect(peons(result.state.players[0]!.board)).toBe(1);
    const buffed = result.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!;
    expect(computeEffectiveStats(buffed, "calme").attack).toBe(2);
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
    expect(computeEffectiveStats(played.state.players[0]!.board.find((u) => u.instanceId === bavard.instanceId)!, "calme").attack).toBe(2);

    const ended = dispatch(played.state, { type: "endTurn", playerId: "p1" });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    // Le +1 servait à attaquer ce tour-ci : il ne doit pas servir à défendre ensuite.
    const after = ended.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === bavard.instanceId)!;
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
