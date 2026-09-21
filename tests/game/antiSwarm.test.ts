/**
 * Anti-swarm (21/09/2026) — les deux primitives génériques et la première
 * paire de cartes qui s'en sert.
 *
 * Le pool « crée un board large plus facilement qu'il ne sait le punir »
 * (Notion, « Audit systémique »). La mesure le confirme : Le Banc Déborde
 * fabrique 9 à 20 corps par partie pour 5 à 9 cartes posées — ses unités ne
 * passent pas par la Raison, donc aucune courbe de Raison ne les freine.
 *
 * La réponse n'est PAS un board wipe : rien ici ne détruit d'office. Un
 * montant COMPTÉ (`unitCount`) et une porte de seuil (`opponentUnitsAtLeast`)
 * rendent simplement un prix au nombre, et s'arrêter à trois corps reste une
 * réponse complète.
 *
 * Les deux seuils diffèrent, et c'est MESURÉ : Le Banc Déborde tient 3,6
 * corps en moyenne contre La Ligne Tenue. À 4 unités, une carte ne mord que
 * sur les pointes — ce qu'on veut d'une punition sèche et unique (la Nasse),
 * pas d'une goutte lente (le Rôle, à 3).
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";
import type { GameState } from "@/game/state/types";

const NASSE = "la-nasse-trop-pleine"; // visible en Tempête et Abysses
const ROLE = "le-role-dequipage"; // toujours visible

const player = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const board = (st: GameState, id: string) => player(st, id).board;

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

/** `n` corps adverses sur le plateau de p2, et Le Rôle d'Équipage chez p1. */
function finDeTourAvec(n: number, extra: ReturnType<typeof instance>[] = []) {
  const role = instance(ROLE, "p1", { turnsRemaining: 4 });
  const corps = Array.from({ length: n }, () => instance("marin-des-jetees", "p2"));
  return testGameState({
    turnNumber: 3,
    activePlayerId: "p1",
    players: [
      testPlayer("p1", { board: [role], deck: [instance("marin-des-jetees", "p1")] }),
      testPlayer("p2", { board: [...corps, ...extra], reason: 6, deck: [instance("marin-des-jetees", "p2")] }),
    ],
  });
}

describe("Le Rôle d'Équipage — la taxe du nombre", () => {
  it("ne coûte rien à deux corps : le seuil est une vraie réponse", () => {
    const result = dispatch(finDeTourAvec(2), { type: "endTurn", playerId: "p1" });
    ok(result);
    // 6 de Raison, puis la récupération naturelle du tour de p2 : la taxe
    // n'a rien prélevé avant elle.
    expect(player(result.state, "p2").reason).toBe(8);
  });

  it("prélève 1 Raison par unité au-delà de la deuxième", () => {
    const result = dispatch(finDeTourAvec(5), { type: "endTurn", playerId: "p1" });
    ok(result);
    // 5 unités → 3 de taxe → 3, puis +2 de récupération au tour de p2.
    expect(player(result.state, "p2").reason).toBe(5);
  });

  it("compte les corps, pas les Slots : une Structure adverse n'arme rien", () => {
    // Deux unités et deux Structures : le texte dit « unités », et le
    // moteur ne doit pas lire le nombre de Slots occupés à la place.
    const structures = [instance("le-trone-de-bouchon", "p2"), instance("bibliotheque-salee", "p2")];
    const result = dispatch(finDeTourAvec(2, structures), { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(player(result.state, "p2").reason).toBe(8);
  });

  it("la taxe est une dette SUBIE : elle ampute le revenu, elle ne coûte pas d'Ancrage", () => {
    // Arbitrage du 21/09 : ce qui est perdu pendant le tour adverse ne se
    // règle jamais en Ancrage. Un adversaire déjà à 0 encaisse la taxe sur
    // sa récupération, et son Navire ne prend rien.
    const state = finDeTourAvec(6);
    const aSec: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "p2" ? { ...p, reason: 0 } : p)) as GameState["players"],
    };
    const ancreAvant = player(aSec, "p2").anchor;
    const result = dispatch(aSec, { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(player(result.state, "p2").anchor).toBe(ancreAvant);
    // Dette de 4, récupération de 2 : entièrement absorbée, rien ne remonte.
    expect(player(result.state, "p2").reason).toBe(0);
  });
});

describe("La Nasse Trop Pleine — le dégât de zone qui n'est pas un board wipe", () => {
  /** p1 défend avec la Nasse ; p2 a `n` corps en jeu et un quatrième en main. */
  function quatriemeCorps(tideState: "tempete" | "calme", n = 3) {
    const nasse = instance(NASSE, "p1", { turnsRemaining: 3 });
    const enJeu = [
      instance("poisson-lanterne", "p2"), // 1/1 : ne survit pas au dégât
      instance("marin-des-jetees", "p2"), // 1/2 : l'encaisse
      ...Array.from({ length: n - 2 }, () => instance("poisson-lanterne", "p2")),
    ];
    const enMain = instance("poisson-lanterne", "p2");
    return {
      nasse,
      enMain,
      state: testGameState({
        turnNumber: 4,
        activePlayerId: "p2",
        environment: testEnvironment({ tideState, tideRemainingTurns: 4 }),
        players: [testPlayer("p1", { board: [nasse] }), testPlayer("p2", { board: enJeu, hand: [enMain], reason: 6 })],
      }),
    };
  }

  it("visible, elle mord d'elle-même quand le quatrième corps arrive", () => {
    const { enMain, state } = quatriemeCorps("tempete");
    const result = dispatch(state, { type: "playCard", playerId: "p2", instanceId: enMain.instanceId });
    ok(result);
    // Les 1/1 tombent, le 1/2 reste : c'est la différence avec un wipe.
    const restants = board(result.state, "p2");
    expect(restants.map((u) => u.cardId)).toEqual(["marin-des-jetees"]);
    // Elle ne se détruit PAS : seule la moitié cachée paie de sa personne.
    expect(board(result.state, "p1").some((u) => u.instanceId === state.players[0]!.board[0]!.instanceId)).toBe(true);
  });

  it("sous le seuil, elle ne se déclenche pas — et ne brûle pas son usage du tour", () => {
    // Deux corps en jeu, un troisième arrive : trois unités, pas quatre.
    const { enMain, state } = quatriemeCorps("tempete", 2);
    const result = dispatch(state, { type: "playCard", playerId: "p2", instanceId: enMain.instanceId });
    ok(result);
    expect(board(result.state, "p2")).toHaveLength(3);
    expect(board(result.state, "p2").every((u) => u.damageMarked === 0)).toBe(true);
  });

  it("masquée, elle est un piège : le joueur décide, et elle se détruit en mordant", () => {
    const { nasse, enMain, state } = quatriemeCorps("calme");
    const result = dispatch(state, { type: "playCard", playerId: "p2", instanceId: enMain.instanceId });
    ok(result);
    expect(pendingCandidates(result.state).map((c) => c.cardId)).toContain(NASSE);

    const active = activateReactionFor(result.state, NASSE);
    ok(active);
    expect(board(active.state, "p2").map((u) => u.cardId)).toEqual(["marin-des-jetees"]);
    expect(board(active.state, "p1").some((u) => u.instanceId === nasse.instanceId)).toBe(false);
  });

  it("masquée, passer la fenêtre laisse le banc intact", () => {
    const { nasse, enMain, state } = quatriemeCorps("calme");
    const result = dispatch(state, { type: "playCard", playerId: "p2", instanceId: enMain.instanceId });
    ok(result);

    const passe = dispatch(result.state, { type: "passReaction", playerId: "p1" });
    ok(passe);
    expect(board(passe.state, "p2")).toHaveLength(4);
    expect(board(passe.state, "p1").some((u) => u.instanceId === nasse.instanceId)).toBe(true);
  });
});
