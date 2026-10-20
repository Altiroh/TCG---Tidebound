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
// Effets d'arrivée facultatifs (12/10/2026) : jouer une carte accepte son effet d'arrivée, comme « Appliquer ».
import { dispatch } from "@/tests/game/arrivalDispatch";
import { getCardDefinition } from "@/game/cards/sets/core";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer, enFinDeTour } from "./testHelpers";
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

    const result = dispatch(enFinDeTour(changementDeMaree("calme")), { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.state.environment.tideState).toBe("calme");
    expect(pendingCandidates(result.state).some((c) => c.cardId === BALISE)).toBe(false);
  });

  it("elle EST proposée quand la Marée entre dans un état où elle est visible", () => {
    // Calme → Houle : visible, donc la fenêtre s'ouvre normalement. C'est la
    // contre-épreuve — sans elle, le test ci-dessus passerait aussi si la
    // capacité ne se déclenchait jamais.
    expect(getCardDefinition(BALISE).visibleDuringTide).toContain("houle");

    const result = dispatch(enFinDeTour(changementDeMaree("houle")), { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.state.environment.tideState).toBe("houle");
    expect(pendingCandidates(result.state).some((c) => c.cardId === BALISE)).toBe(true);
  });

  it("masquée, elle garde son Slot et sa durée continue de se consumer", () => {
    // « Elle existe toujours » : l'inactivité ne la met pas en pause.
    const state = changementDeMaree("calme");
    const avant = state.players[0]!.board[0]!.turnsRemaining!;
    const result = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p1" });
    ok(result);

    const apres = result.state.players[0]!.board.find((u) => u.cardId === BALISE);
    expect(apres).toBeDefined();
    // Le décompte a lieu au début du tour de SON contrôleur : p2 vient de
    // prendre la main, donc la durée de p1 n'a pas encore bougé ce tour-ci.
    expect(apres!.turnsRemaining).toBe(avant);

    const tourSuivant = dispatch(enFinDeTour(result.state), { type: "endTurn", playerId: "p2" });
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
    const attaquant = instance("la-chose-qui-remonte", "p1");
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
  it("un piège qui annule le coup laisse l'attaque se terminer proprement", () => {
    // Le Cylindre annule le coup et le renvoie au Navire adverse (texte du
    // 20/10/2026) : l'attaque doit se terminer proprement.
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
    const active = activateReactionFor(declaree.state, "cylindre-flottant");
    ok(active);

    expect(active.state.pendingAttack).toBeUndefined();
    expect(active.state.status).toBe("active");
    expect(player(active.state, "p2").anchor).toBe(20); // dégâts annulés
    expect(player(active.state, "p1").anchor).toBe(17); // renvoyés au Navire adverse (3 de la Murène)
    expect(board(active.state, "p2").some((u) => u.cardId === "cylindre-flottant")).toBe(false);
  });
});

/**
 * STRUCTURES SIMPLIFIÉES (Notion, 13/10/2026) : un effet unique, sans
 * Réaction cachée, actif même lorsque la Marée masque la carte
 * (`activeWhileHidden`) — la Marée ne la cache qu'à l'adversaire.
 */
describe("Structures simplifiées — actives même masquées", () => {
  it("Cage de Flottaison masquée (Abysses) réduit de 2 l'attaque directe, sans rien demander", () => {
    const attaquant = instance("la-chose-qui-remonte", "p1"); // 5 Puissance
    const cage = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [attaquant], anchor: 20 }), testPlayer("p2", { board: [cage], anchor: 20 })],
    });
    const attaque = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(attaque);
    expect(attaque.state.pendingReaction).toBeUndefined();
    expect(player(attaque.state, "p2").anchor).toBe(17); // 5 − 2
  });

  it("Filet à la Dérive masqué (Abysses) affaiblit la première attaque du tour, pas la seconde", () => {
    const premier = instance("murene-aveugle", "p1");
    const second = instance("marin-des-jetees", "p1");
    const filet = instance("filet-a-la-derive", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [premier, second], anchor: 20 }), testPlayer("p2", { board: [filet], anchor: 20 })],
    });
    const attaque1 = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: premier.instanceId });
    ok(attaque1);
    expect(attaque1.state.pendingReaction).toBeUndefined();
    const murene = getCardDefinition("murene-aveugle").attack ?? 0;
    expect(20 - player(attaque1.state, "p2").anchor).toBe(murene - 1);

    const avant = player(attaque1.state, "p2").anchor;
    const attaque2 = dispatch(attaque1.state, { type: "attack", playerId: "p1", attackerInstanceId: second.instanceId });
    ok(attaque2);
    expect(avant - player(attaque2.state, "p2").anchor).toBe(getCardDefinition("marin-des-jetees").attack ?? 0);
  });

  it("Cylindre flottant masqué (Abysses) se propose quand même, et renvoie le coup au Navire adverse", () => {
    const attaquant = instance("la-chose-qui-remonte", "p1"); // 5 Puissance
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 4 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3 }),
      players: [testPlayer("p1", { board: [attaquant], anchor: 20 }), testPlayer("p2", { board: [cylindre], anchor: 20 })],
    });
    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    ok(declaree);
    expect(pendingCandidates(declaree.state).map((c) => c.cardId)).toContain("cylindre-flottant");
    const active = activateReactionFor(declaree.state, "cylindre-flottant");
    ok(active);
    expect(player(active.state, "p2").anchor).toBe(20);
    expect(player(active.state, "p1").anchor).toBe(15);
    expect(board(active.state, "p2").some((u) => u.cardId === "cylindre-flottant")).toBe(false);
  });

  it("aucune de ces Structures n'a plus de Réaction cachée", () => {
    for (const id of ["caisses-arrimees", "cylindre-flottant", "filet-a-la-derive", "cage-de-flottaison"]) {
      const def = getCardDefinition(id);
      expect(def.activeWhileHidden, id).toBe(true);
      expect((def.abilities ?? []).some((a) => a.hiddenReaction), id).toBe(false);
      expect(def.text, id).not.toMatch(/Réaction cachée/);
    }
  });
});

describe("Le Canon du Navire passe par la fenêtre d'interception", () => {
  /** Goliath armé, prêt à tirer sur le Navire adverse. */
  function goliathArme(defenseurs: ReturnType<typeof instance>[]) {
    return testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3 }),
      players: [
        testPlayer("p1", { shipId: "le-goliath", anchor: 20, shipAbility: { armedOnTurn: 1, activations: { turnNumber: 1, count: 1 } } }),
        // Signal de Détresse en main : une Chaîne qui répond aux dégâts directs
        // pendant le tour adverse — de quoi ouvrir la fenêtre d'interception.
        testPlayer("p2", { board: defenseurs, hand: [instance("signal-de-detresse", "p2")], anchor: 20, reason: 6 }),
      ],
      turnNumber: 1,
      activePlayerId: "p1",
    });
  }

  it("un tir sur le Navire adverse ouvre la fenêtre, et une Chaîne peut le réduire", () => {
    const state = goliathArme([]);

    const tir = dispatch(state, { type: "fireShipAbility", playerId: "p1" });
    ok(tir);
    // Avant l'arbitrage du 21/09, le tir traversait tout sans rien demander.
    expect(tir.state.pendingAttack?.kind).toBe("tirDeNavire");
    expect(tir.state.pendingReaction?.awaitingPlayerId).toBe("p2");

    // Activer : le Signal réduit de 3. Le tir de 2 n'atteint donc jamais la coque.
    const active = activateReactionFor(tir.state, "signal-de-detresse");
    ok(active);
    expect(active.state.pendingAttack).toBeUndefined();
    expect(player(active.state, "p2").anchor).toBe(20);
  });

  it("passer laisse le tir porter normalement", () => {
    const state = goliathArme([]);
    const tir = dispatch(state, { type: "fireShipAbility", playerId: "p1" });
    ok(tir);
    const passe = dispatch(tir.state, { type: "passReaction", playerId: "p2" });
    ok(passe);
    expect(passe.state.pendingAttack).toBeUndefined();
    expect(player(passe.state, "p2").anchor).toBe(18); // 20 - 2
  });

  it("un tir sur un PERMANENT n'ouvre aucune fenêtre — ce n'est pas la coque qui est visée", () => {
    const cage = instance("cage-de-flottaison", "p2", { turnsRemaining: 4 });
    const cible = instance("murene-aveugle", "p2");
    const state = goliathArme([cage, cible]);

    const tir = dispatch(state, { type: "fireShipAbility", playerId: "p1", targetInstanceId: cible.instanceId });
    ok(tir);
    expect(tir.state.pendingAttack).toBeUndefined();
    expect(tir.state.pendingReaction).toBeUndefined();
  });
});

describe("Guetteur Méfiant — une seule fenêtre par tour", () => {
  it("ne se propose plus à chaque carte jouée", () => {
    // Sans limite, il ouvrait une fenêtre à CHAQUE carte : trois cartes
    // posées, trois confirmations à donner. C'est le nombre de fenêtres qui
    // pesait, pas leur prix en Raison.
    const guetteur = instance("guetteur-mefiant", "p2");
    const a = instance("marin-des-jetees", "p1");
    const b = instance("marin-des-jetees", "p1");
    const cible = instance("murene-aveugle", "p2");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [a, b], reason: 10 }),
        testPlayer("p2", { board: [guetteur, cible], reason: 10 }),
      ],
    });

    const un = dispatch(state, { type: "playCard", playerId: "p1", instanceId: a.instanceId });
    ok(un);
    expect(pendingCandidates(un.state).some((c) => c.cardId === "guetteur-mefiant")).toBe(true);

    // Il ACTIVE, ce qui consomme son unique usage du tour.
    const active = activateReactionFor(un.state, "guetteur-mefiant", cible.instanceId);
    ok(active);

    const deux = dispatch(active.state, { type: "playCard", playerId: "p1", instanceId: b.instanceId });
    ok(deux);
    expect(pendingCandidates(deux.state).some((c) => c.cardId === "guetteur-mefiant")).toBe(false);
  });
});
