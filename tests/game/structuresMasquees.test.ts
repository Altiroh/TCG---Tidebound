/**
 * Grammaire des Structures visible / cachée (21/09/2026).
 *
 * Règle générale : une Structure masquée par la Marée existe toujours —
 * elle occupe son Slot et sa durée se consume — mais elle est INACTIVE.
 * L'unique exception est une capacité déclarée `hiddenReaction`.
 *
 * Avant cette passe, le masquage ne bloquait rien : il fallait que chaque
 * capacité porte `condition: { selfVisible: true }`, ou chacun de ses effets
 * `conditionSelfVisible`. Le catalogue le faisait par discipline, mais rien
 * ne le tenait — ces tests vérifient que le MOTEUR le tient désormais.
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getCardDefinition } from "@/game/cards/sets/core";
import { instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";
import type { GameState } from "@/game/state/types";

const BALISE = "balise-des-profondeurs"; // optional, onTideStateEntered, SANS garde de visibilité

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  expect(r.ok).toBe(true);
}

/**
 * Fin du tour de p1 alors que la Marée est sur le point de changer d'état.
 * La Marée n'est PAS un cycle : elle monte Calme → Houle → Tempête →
 * Abysses et redescend, l'orientation se retournant d'office aux deux
 * bornes. Pour entrer en Calme il faut donc venir de Houle en descendant.
 */
function changementDeMaree(vers: "calme" | "houle"): GameState {
  const balise = instance(BALISE, "p1", { turnsRemaining: 4 });
  const depuis = vers === "calme" ? "houle" : "calme";
  const orientation = vers === "calme" ? "descendante" : "montante";
  return testGameState({
    turnNumber: 2,
    activePlayerId: "p1",
    environment: testEnvironment({ tideState: depuis, tideRemainingTurns: 1, tideOrientation: orientation }),
    players: [
      testPlayer("p1", { board: [balise], reason: 6, deck: [instance("marin-des-jetees", "p1")] }),
      testPlayer("p2", { deck: [instance("marin-des-jetees", "p2")] }),
    ],
  });
}

describe("Structure masquée par la Marée — inactive par défaut", () => {
  it("la Balise des Profondeurs n'est PAS proposée quand la Marée entre dans un état où elle est masquée", () => {
    // Houle → Calme. La Balise est visible en Houle, Tempête et Abysses,
    // donc masquée en Calme : sa capacité ne doit pas être proposée.
    expect(getCardDefinition(BALISE).visibleDuringTide).not.toContain("calme");

    const result = dispatch(changementDeMaree("calme"), { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.state.environment.tideState).toBe("calme");
    expect(pendingCandidates(result.state).some((c) => c.cardId === BALISE)).toBe(false);
  });

  it("elle EST proposée quand la Marée entre dans un état où elle est visible", () => {
    // Calme → Houle : visible, donc la fenêtre s'ouvre normalement. C'est la
    // contre-épreuve — sans elle, le test ci-dessus passerait aussi si la
    // capacité ne se déclenchait jamais.
    expect(getCardDefinition(BALISE).visibleDuringTide).toContain("houle");

    const result = dispatch(changementDeMaree("houle"), { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.state.environment.tideState).toBe("houle");
    expect(pendingCandidates(result.state).some((c) => c.cardId === BALISE)).toBe(true);
  });

  it("masquée, elle garde son Slot et sa durée continue de se consumer", () => {
    // « Elle existe toujours » : l'inactivité ne la met pas en pause.
    const state = changementDeMaree("calme");
    const avant = state.players[0]!.board[0]!.turnsRemaining!;
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(result);

    const apres = result.state.players[0]!.board.find((u) => u.cardId === BALISE);
    expect(apres).toBeDefined();
    // Le décompte a lieu au début du tour de SON contrôleur : p2 vient de
    // prendre la main, donc la durée de p1 n'a pas encore bougé ce tour-ci.
    expect(apres!.turnsRemaining).toBe(avant);

    const tourSuivant = dispatch(result.state, { type: "endTurn", playerId: "p2" });
    ok(tourSuivant);
    const apresSonTour = tourSuivant.state.players[0]!.board.find((u) => u.cardId === BALISE);
    expect(apresSonTour!.turnsRemaining).toBe(avant - 1);
  });
});
