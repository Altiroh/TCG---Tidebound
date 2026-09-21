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
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";
import type { GameState } from "@/game/state/types";

const BALISE = "balise-des-profondeurs"; // optional, onTideStateEntered, SANS garde de visibilité

const player = (st: GameState, id: string) => st.players.find((p) => p.id === id)!;
const board = (st: GameState, id: string) => player(st, id).board;

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

describe("Fenêtre d'interception — le bot sait y répondre", () => {
  it("ne reste jamais bloqué devant une attaque suspendue", () => {
    // Le Cylindre flottant n'est dans aucune liste v4 : les parties de bot
    // ne croisent donc jamais cette fenêtre d'elles-mêmes. Sans ce test, une
    // partie en ligne se figerait le jour où la carte serait jouée.
    const attaquant = instance("baleine-aux-cicatrices-blanches", "p1");
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const cible = instance("murene-aveugle", "p1");
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [attaquant, cible], anchor: 20 }),
        testPlayer("p2", { board: [cylindre], anchor: 20 }),
      ],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(declaree);
    expect(declaree.state.pendingAttack).toBeDefined();

    // Le défenseur est le bot : il doit avoir quelque chose à décider, et
    // le coup qu'il rend doit être légal.
    expect(botHasSomethingToDo(declaree.state, "p2")).toBe(true);
    const coup = chooseBotAction(declaree.state, "p2", "moyen");
    const joue = dispatch(declaree.state, coup);
    ok(joue);

    // Quoi qu'il ait choisi, l'attaque est résolue : plus rien en suspens.
    expect(joue.state.pendingAttack).toBeUndefined();
    expect(joue.state.pendingReaction).toBeUndefined();
  });
});

describe("Pièges simultanés et cibles devenues invalides", () => {
  it("deux pièges éligibles sur la même attaque s'enchaînent sans casser la fenêtre", () => {
    // Cage de Flottaison (−3 cachée) et Caisses Arrimées (−2 cachée) sont
    // toutes deux masquées en Abysses. Les deux doivent pouvoir répondre, et
    // leurs réductions s'additionner.
    const attaquant = instance("baleine-aux-cicatrices-blanches", "p1"); // 5 Puissance
    const cage = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const caisses = instance("caisses-arrimees", "p2", { turnsRemaining: 4 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3 }),
      players: [
        testPlayer("p1", { board: [attaquant], anchor: 20 }),
        testPlayer("p2", { board: [cage, caisses], anchor: 20 }),
      ],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(declaree);
    const noms = pendingCandidates(declaree.state).map((c) => c.cardId);
    expect(noms).toContain("cage-de-flottaison");
    expect(noms).toContain("caisses-arrimees");

    const premier = activateReactionFor(declaree.state, "cage-de-flottaison");
    ok(premier);
    // La fenêtre reste ouverte pour le second piège.
    expect(premier.state.pendingReaction).toBeDefined();
    expect(premier.state.pendingAttack).toBeDefined();

    const second = activateReactionFor(premier.state, "caisses-arrimees");
    ok(second);
    // 5 − 3 (Cage) − 2 (Caisses) = 0 : la coque ne prend rien. Et les Caisses
    // rendent 2 Ancrage en se Sabordant — leur texte le dit, et le Sabordage
    // d'une Réaction cachée est un Sabordage comme un autre.
    expect(player(second.state, "p2").anchor).toBe(22);
    expect(second.state.pendingAttack).toBeUndefined();
  });

  it("un piège qui détruit l'attaquant n'empêche pas l'attaque de se terminer proprement", () => {
    // Le Cylindre renvoie 5 dégâts sur une Murène à 1 de Résistance : elle
    // meurt AVANT que l'attaque ne reprenne. La reprise doit rester saine.
    const attaquant = instance("murene-aveugle", "p1"); // 3/1
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [
        testPlayer("p1", { board: [attaquant], anchor: 20 }),
        testPlayer("p2", { board: [cylindre], anchor: 20 }),
      ],
    });

    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(declaree);
    const active = activateReactionFor(declaree.state, "cylindre-flottant", attaquant.instanceId);
    ok(active);

    expect(active.state.pendingAttack).toBeUndefined();
    expect(active.state.status).toBe("active");
    expect(player(active.state, "p2").anchor).toBe(20); // dégâts annulés
  });
});
