import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { instance, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * Sila, Opalin du Large — « À l'arrivée : votre prochaine unité de coût 5+
 * coûte 1 de moins. Première unité de coût 5+ jouée chaque tour : elle gagne
 * +1/+1. » Le second effet ne se résolvait pas (retour du 19/10/2026) : le
 * déclencheur « quand une carte est jouée » ignorait son filtre et ne savait
 * pas QUELLE carte avait été jouée.
 */
const pioche = (o: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", o));
function table(hand: CardInstance[], board: CardInstance[] = []): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 30, reasonMax: 30, hand, board, deck: pioche("p1") }),
      testPlayer("p2", { reason: 10, reasonMax: 10, deck: pioche("p2") }),
    ],
  });
}
function jouer(state: GameState, carte: CardInstance): GameState {
  const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const stats = (s: GameState, id: string) => {
  const u = s.players[0]!.board.find((x) => x.instanceId === id)!;
  return computeEffectiveStats(u, "calme", auraContextOf(s, "p1"));
};

describe("Sila, Opalin du Large", () => {
  it("jouée, elle est elle-même la première unité de coût 5+ du tour : +1/+1", () => {
    const sila = instance("sila-opalin-du-large", "p1");
    const s = jouer(table([sila]), sila);
    expect(stats(s, sila.instanceId)).toMatchObject({ attack: 5, health: 7 });
  });

  it("en jeu, elle donne +1/+1 à la première unité de coût 5+ jouée du tour, et à elle seule", () => {
    const sila = instance("sila-opalin-du-large", "p1");
    const tharos = instance("tharos-opalin-des-brisants", "p1"); // 7/6, coût 6
    const velm = instance("velm-opalin-des-armures", "p1"); // 4/6, coût 6
    let s = jouer(table([tharos, velm], [sila]), tharos);
    expect(stats(s, tharos.instanceId)).toMatchObject({ attack: 8, health: 7 });
    s = jouer(s, velm);
    expect(stats(s, velm.instanceId)).toMatchObject({ attack: 4, health: 6 });
  });

  it("une petite unité ne la déclenche pas", () => {
    const sila = instance("sila-opalin-du-large", "p1");
    const petite = instance("crabe-de-fer", "p1");
    const base = computeEffectiveStats(petite, "calme", auraContextOf(table([]), "p1"));
    const s = jouer(table([petite], [sila]), petite);
    expect(stats(s, petite.instanceId)).toMatchObject({ attack: base.attack, health: base.health });
  });
});
