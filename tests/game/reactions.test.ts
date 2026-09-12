import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { instance, testGameState, testPlayer } from "./testHelpers";

describe("moteur de réactions — fenêtre facultative (Notion 'Moteur de partie')", () => {
  it("ouvre une fenêtre de réaction quand une capacité `optional` devient éligible, et bloque les actions normales tant qu'elle reste ouverte", () => {
    const guetteur = instance("guetteur-mefiant", "p2"); // onCardPlayed, optional, coût 1 Raison
    const cardToPlay = instance("marin-des-jetees", "p1"); // coût 1
    const bigUnit = instance("baleine-aux-cicatrices-blanches", "p1"); // 5/6, cible potentielle
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], board: [bigUnit], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 3 }),
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.pendingReaction).toBeDefined();
    expect(result.state.pendingReaction?.awaitingPlayerId).toBe("p2");
    expect(result.events.some((e) => e.type === "REACTION_WINDOW_OPENED")).toBe(true);

    // Aucune action normale n'est acceptée tant que la fenêtre est ouverte,
    // même pour le joueur qui n'attend pas la réponse.
    const blockedEndTurn = dispatch(result.state, { type: "endTurn", playerId: "p1" });
    expect(blockedEndTurn.ok).toBe(false);

    // Le mauvais joueur ne peut pas répondre à la place de celui attendu.
    const wrongPlayer = dispatch(result.state, { type: "passReaction", playerId: "p1" });
    expect(wrongPlayer.ok).toBe(false);
  });

  it("n'ouvre aucune fenêtre si la Raison ne permet pas de payer le coût de la capacité facultative", () => {
    const guetteur = instance("guetteur-mefiant", "p2");
    const cardToPlay = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 0 }), // ne peut pas payer 1 Raison
      ],
    });

    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingReaction).toBeUndefined();
  });

  it("passer ferme la fenêtre quand il ne reste aucun joueur éligible", () => {
    const guetteur = instance("guetteur-mefiant", "p2");
    const cardToPlay = instance("marin-des-jetees", "p1");
    const bigUnit = instance("baleine-aux-cicatrices-blanches", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], board: [bigUnit], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 3 }),
      ],
    });

    const opened = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const passed = dispatch(opened.state, { type: "passReaction", playerId: "p2" });
    expect(passed.ok).toBe(true);
    if (!passed.ok) return;
    expect(passed.state.pendingReaction).toBeUndefined();
    expect(passed.events.some((e) => e.type === "REACTION_PASSED")).toBe(true);

    // La partie continue normalement une fois la fenêtre refermée.
    const endTurn = dispatch(passed.state, { type: "endTurn", playerId: "p1" });
    expect(endTurn.ok).toBe(true);
  });

  it("active une réaction éligible : paie son coût, résout son effet ciblé, puis referme la fenêtre (capacité déjà utilisée)", () => {
    const guetteur = instance("guetteur-mefiant", "p2");
    const cardToPlay = instance("marin-des-jetees", "p1");
    const bigUnit = instance("baleine-aux-cicatrices-blanches", "p1"); // 5/6
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], board: [bigUnit], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 3 }),
      ],
    });

    const opened = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const activated = dispatch(opened.state, {
      type: "activateReaction",
      playerId: "p2",
      sourceInstanceId: guetteur.instanceId,
      abilityIndex: 0,
      targetInstanceId: bigUnit.instanceId,
    });
    expect(activated.ok).toBe(true);
    if (!activated.ok) return;

    const p2After = activated.state.players.find((p) => p.id === "p2")!;
    expect(p2After.reason).toBe(2); // 3 - 1 (coût de la réaction)

    // La Baleine aux Cicatrices Blanches réduit de 1 le premier dégât qu'elle
    // subit chaque tour (`reduceOwnDamageTakenOncePerTurn`) : 2 dégâts bruts
    // devient donc 1 dégât marqué.
    const targetAfter = activated.state.players.find((p) => p.id === "p1")!.board.find((u) => u.instanceId === bigUnit.instanceId);
    expect(targetAfter?.damageMarked).toBe(1);

    // Plus rien d'éligible : cette capacité a déjà été activée pendant
    // cette fenêtre (`usedCandidateKeys`), la fenêtre se referme.
    expect(activated.state.pendingReaction).toBeUndefined();
    expect(activated.events.some((e) => e.type === "REACTION_ACTIVATED")).toBe(true);
  });

  it("refuse d'activer une capacité qui ne figure pas (ou plus) parmi les candidats éligibles", () => {
    const guetteur = instance("guetteur-mefiant", "p2");
    const cardToPlay = instance("marin-des-jetees", "p1");
    const bigUnit = instance("baleine-aux-cicatrices-blanches", "p1");
    const state = testGameState({
      players: [
        testPlayer("p1", { hand: [cardToPlay], board: [bigUnit], reason: 5 }),
        testPlayer("p2", { board: [guetteur], reason: 3 }),
      ],
    });

    const opened = dispatch(state, { type: "playCard", playerId: "p1", instanceId: cardToPlay.instanceId });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const wrongAbility = dispatch(opened.state, {
      type: "activateReaction",
      playerId: "p2",
      sourceInstanceId: guetteur.instanceId,
      abilityIndex: 1, // cette carte n'a qu'une seule capacité (index 0)
      targetInstanceId: bigUnit.instanceId,
    });
    expect(wrongAbility.ok).toBe(false);
  });
});
