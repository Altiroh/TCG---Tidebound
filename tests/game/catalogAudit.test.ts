/**
 * Audit du catalogue (2026-09-16) : les capacités qui restaient « non
 * appliquées » dans `core.ts` et que le moteur sait désormais exprimer.
 * Chaque test lit le texte de la carte et vérifie qu'il se produit bien.
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { computeEffectiveStats } from "@/game/cards/stats";
import { processTrigger } from "@/game/triggers/triggerBus";
import { processDeaths } from "@/game/state/processDeaths";
import { eligibleCandidatesFor } from "@/game/reactions/reactionWindow";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, answerHandDiscard, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

const STRUCTURE = "le-trone-de-bouchon"; // Structure toujours visible, 4 Résistance, sans capacité
const EPAVE = "epave-a-fleur-deau"; // visible en Houle uniquement

/** Deck non vide : un joueur qui pioche dans un deck vide déclenche un Jugement de l'Océan qui termine la partie. */
function filler(ownerId: string) {
  return [instance("marin-des-jetees", ownerId), instance("marin-des-jetees", ownerId)];
}

function board(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!.board;
}
function player(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId)!;
}
function ok<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
}
/** Réactions actuellement proposées au joueur attendu par la fenêtre ouverte. */
function candidates(state: GameState) {
  const pending = state.pendingReaction;
  if (!pending) return [];
  return eligibleCandidatesFor(state, pending.events, pending.awaitingPlayerId, pending.turnNumber, pending.usedCandidateKeys);
}

describe("observateurs de Structures — Plongeur des Épaves, Mécanicien aux Mains Noires, Treuil Rouillé", () => {
  it("Plongeur des Épaves : PROPOSE 1 Raison quand une Structure est Sabordée, une fois par tour, et se refuse", () => {
    const plongeur = instance("plongeur-des-epaves", "p1");
    const own = instance(STRUCTURE, "p1");
    const own2 = instance(STRUCTURE, "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [plongeur, own, own2], reason: 5 }), testPlayer("p2")],
    });

    const saborded = dispatch(state, { type: "saborder", playerId: "p1", instanceId: own.instanceId });
    ok(saborded);
    // Rien n'est encaissé d'office : « vous pouvez ».
    expect(player(saborded.state, "p1").reason).toBe(5);

    const accepted = activateReactionFor(saborded.state, "plongeur-des-epaves");
    ok(accepted);
    expect(player(accepted.state, "p1").reason).toBe(6);

    // Une fois par tour : la seconde Structure sabordée ne propose plus rien.
    const second = dispatch(accepted.state, { type: "saborder", playerId: "p1", instanceId: own2.instanceId });
    ok(second);
    expect(pendingCandidates(second.state).some((c) => c.cardId === "plongeur-des-epaves")).toBe(false);

    // Le joueur peut aussi refuser : la fenêtre se ferme, rien ne se passe.
    const refused = dispatch(saborded.state, { type: "passReaction", playerId: "p1" });
    ok(refused);
    expect(player(refused.state, "p1").reason).toBe(5);
  });

  it("Plongeur des Épaves : réagit aussi à une Structure ADVERSE", () => {
    const plongeur = instance("plongeur-des-epaves", "p1");
    const enemy = instance(STRUCTURE, "p2");
    const state = testGameState({
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      players: [testPlayer("p1", { board: [plongeur], reason: 5 }), testPlayer("p2", { board: [enemy] })],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p2", instanceId: enemy.instanceId });
    ok(result);
    // La fenêtre s'ouvre pour p1, propriétaire du Plongeur, hors de son tour.
    expect(result.state.pendingReaction?.awaitingPlayerId).toBe("p1");
    const accepted = activateReactionFor(result.state, "plongeur-des-epaves");
    ok(accepted);
    expect(player(accepted.state, "p1").reason).toBe(6);
  });

  it("Mécanicien aux Mains Noires : le joueur DÉSIGNE l'autre Structure qui gagne +1 Résistance", () => {
    const mecanicien = instance("mecanicien-aux-mains-noires", "p1");
    const lost = instance(STRUCTURE, "p1");
    const kept = instance(STRUCTURE, "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [mecanicien, lost, kept] }), testPlayer("p2")],
    });
    const saborded = dispatch(state, { type: "saborder", playerId: "p1", instanceId: lost.instanceId });
    ok(saborded);
    const candidate = pendingCandidates(saborded.state).find((c) => c.cardId === "mecanicien-aux-mains-noires");
    expect(candidate?.needsTarget).toBe(true);

    const result = activateReactionFor(saborded.state, "mecanicien-aux-mains-noires", kept.instanceId);
    ok(result);
    const survivor = board(result.state, "p1").find((u) => u.instanceId === kept.instanceId)!;
    expect(computeEffectiveStats(survivor, result.state.environment.tideState).health).toBe(5);
    // Le Marin lui-même n'est pas une Structure : il n'est jamais une cible légale.
    const marin = board(result.state, "p1").find((u) => u.instanceId === mecanicien.instanceId)!;
    expect(marin.modifiers).toHaveLength(0);
    expect(
      dispatch(saborded.state, {
        type: "activateReaction",
        playerId: "p1",
        sourceInstanceId: mecanicien.instanceId,
        abilityIndex: candidate!.abilityIndex,
        targetInstanceId: mecanicien.instanceId,
      }).ok
    ).toBe(false);
  });

  it("Treuil Rouillé : pioche 1 carte quand la Structure équipée quitte le board", () => {
    const structure = instance(STRUCTURE, "p1");
    const treuil = instance("treuil-rouille", "p1", { attachedToInstanceId: structure.instanceId });
    const inDeck = instance("marin-des-jetees", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [structure, treuil], deck: [inDeck] }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: structure.instanceId });
    ok(result);
    expect(player(result.state, "p1").hand.map((c) => c.instanceId)).toEqual([inDeck.instanceId]);
    // Le Treuil, orphelin, a suivi sa Structure au cimetière.
    expect(board(result.state, "p1").some((u) => u.instanceId === treuil.instanceId)).toBe(false);
  });
});

describe("Structures qui deviennent visibles — Gardien du Sondeur, Contremaître des Amarres, Épave à Fleur d'Eau", () => {
  /** Calme → Houle à la fin du tour de p1 : l'Épave (Houle) de p1 devient visible. */
  function revealSetup(extraP1: ReturnType<typeof instance>[], extraP2: ReturnType<typeof instance>[]) {
    const epave = instance(EPAVE, "p1");
    const state = testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 1, tideOrientation: "montante" }),
      players: [
        testPlayer("p1", { board: [epave, ...extraP1], reason: 5, hand: [instance("marin-des-jetees", "p1")], deck: [instance("requin-balafre", "p1")] }),
        testPlayer("p2", { board: extraP2, deck: filler("p2") }),
      ],
    });
    return { epave, state };
  }

  it("Gardien du Sondeur : +1 Raison la première fois qu'une de vos Structures devient visible", () => {
    const { state } = revealSetup([instance("gardien-du-sondeur", "p1")], []);
    const control = revealSetup([], []);

    const withGardien = dispatch(state, { type: "endTurn", playerId: "p1" });
    const without = dispatch(control.state, { type: "endTurn", playerId: "p1" });
    ok(withGardien);
    ok(without);
    expect(withGardien.state.environment.tideState).toBe("houle");
    expect(player(withGardien.state, "p1").reason).toBe(player(without.state, "p1").reason + 1);
  });

  it("Contremaître des Amarres : une Structure ADVERSE qui devient visible perd 1 Résistance", () => {
    const { epave, state } = revealSetup([], [instance("contremaitre-des-amarres", "p2")]);
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(result);
    const revealed = board(result.state, "p1").find((u) => u.instanceId === epave.instanceId)!;
    expect(revealed.damageMarked).toBe(1);
  });

  it("Épave à Fleur d'Eau : propose de défausser 1 carte pour en piocher 1 quand elle devient visible", () => {
    const { state } = revealSetup([], []);
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.events.some((e) => e.type === "STRUCTURE_REVEALED")).toBe(true);
    expect(result.state.pendingReaction?.awaitingPlayerId).toBe("p1");
    const candidate = candidates(result.state).find((c) => c.cardId === EPAVE)!;
    expect(candidate).toBeDefined();

    const before = player(result.state, "p1");
    const activated = dispatch(result.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidate.sourceInstanceId,
      abilityIndex: candidate.abilityIndex,
    });
    ok(activated);

    // « Vous pouvez défausser 1 carte » : c'est le joueur qui dit laquelle.
    // La pioche qui suit (« si vous le faites ») attend sa réponse.
    expect(activated.state.pendingChoice?.kind).toBe("handDiscard");
    const discarded = answerHandDiscard(activated.state);
    ok(discarded);

    const after = player(discarded.state, "p1");
    expect(after.hand).toHaveLength(before.hand.length);
    expect(after.deck).toHaveLength(before.deck.length - 1);
    expect(after.graveyard).toHaveLength(before.graveyard.length + 1);
  });
});

describe("Marée — Balise des Profondeurs, Épave Engloutie, Veilleuse des Profondeurs, Lanterne aux Verres Noirs", () => {
  it("Balise des Profondeurs : au changement de Marée, peut perdre 1 Raison pour prolonger la nouvelle Marée d'1 tour", () => {
    const balise = instance("balise-des-profondeurs", "p1");
    const state = testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 1, tideOrientation: "montante" }),
      players: [testPlayer("p1", { board: [balise], reason: 5 }), testPlayer("p2", { deck: filler("p2") })],
    });
    const ended = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(ended);
    expect(ended.state.environment.tideState).toBe("houle");
    const candidate = candidates(ended.state).find((c) => c.cardId === "balise-des-profondeurs");
    expect(candidate).toBeDefined();

    const remaining = ended.state.environment.tideRemainingTurns;
    const reason = player(ended.state, "p1").reason;
    const activated = dispatch(ended.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidate!.sourceInstanceId,
      abilityIndex: candidate!.abilityIndex,
    });
    ok(activated);
    expect(activated.state.environment.tideRemainingTurns).toBe(remaining + 1);
    expect(player(activated.state, "p1").reason).toBe(reason - 1);
  });

  it("Épave Engloutie : quitte le board lorsque la Marée quitte les Abysses", () => {
    const epave = instance("epave-engloutie", "p1");
    const state = testGameState({
      turnNumber: 2,
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 1, tideOrientation: "descendante" }),
      players: [testPlayer("p1", { board: [epave] }), testPlayer("p2", { deck: filler("p2") })],
    });
    const result = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(result);
    expect(result.state.environment.tideState).not.toBe("abysses");
    expect(board(result.state, "p1").some((u) => u.instanceId === epave.instanceId)).toBe(false);
    expect(player(result.state, "p1").graveyard.some((u) => u.instanceId === epave.instanceId)).toBe(true);
  });

  it("Veilleuse des Profondeurs : en Abysses, force l'orientation descendante (sans rien proposer)", () => {
    const veilleuse = instance("veilleur-des-profondeurs", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3, tideOrientation: "montante" }),
      players: [testPlayer("p1", { hand: [veilleuse], reason: 10 }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "playCard", playerId: "p1", instanceId: veilleuse.instanceId });
    ok(result);
    expect(result.state.environment.tideOrientation).toBe("descendante");
    expect(result.state.pendingReaction).toBeUndefined();
  });

  it("Veilleuse des Profondeurs : hors Abysses, propose de réduire la Marée d'1 tour", () => {
    const veilleuse = instance("veilleur-des-profondeurs", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3, tideOrientation: "montante" }),
      players: [testPlayer("p1", { hand: [veilleuse], reason: 10 }), testPlayer("p2")],
    });
    const played = dispatch(state, { type: "playCard", playerId: "p1", instanceId: veilleuse.instanceId });
    ok(played);
    expect(played.state.environment.tideOrientation).toBe("montante");
    const candidate = candidates(played.state).find((c) => c.cardId === "veilleur-des-profondeurs");
    expect(candidate).toBeDefined();
    const activated = dispatch(played.state, {
      type: "activateReaction",
      playerId: "p1",
      sourceInstanceId: candidate!.sourceInstanceId,
      abilityIndex: candidate!.abilityIndex,
    });
    ok(activated);
    expect(activated.state.environment.tideRemainingTurns).toBe(2);
  });

  it("Lanterne aux Verres Noirs : deux options au début du tour, une seule activable", () => {
    const marin = instance("marin-des-jetees", "p2");
    const lanterne = instance("lanterne-aux-verres-noirs", "p2", { attachedToInstanceId: marin.instanceId });
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 3, tideOrientation: "montante" }),
      players: [testPlayer("p1"), testPlayer("p2", { board: [marin, lanterne], reason: 5, deck: filler("p2") })],
    });
    const ended = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(ended);
    const options = candidates(ended.state).filter((c) => c.cardId === "lanterne-aux-verres-noirs");
    expect(options.map((c) => c.abilityIndex).sort()).toEqual([0, 1]);

    const inverted = dispatch(ended.state, {
      type: "activateReaction",
      playerId: "p2",
      sourceInstanceId: lanterne.instanceId,
      abilityIndex: 1,
    });
    ok(inverted);
    expect(inverted.state.environment.tideOrientation).toBe("descendante");
    // L'autre option du même groupe est écartée : la fenêtre se referme.
    expect(inverted.state.pendingReaction).toBeUndefined();
    expect(inverted.state.environment.tideRemainingTurns).toBe(3);
  });
});

describe("Équipements récurrents — Kit de Calfatage, Treuil à Chair", () => {
  it("Kit de Calfatage : la Structure équipée récupère 1 Résistance au début du tour si elle est visible", () => {
    const damaged = instance(EPAVE, "p2", { damageMarked: 2 });
    const kit = instance("kit-de-calfatage", "p2", { attachedToInstanceId: damaged.instanceId });
    const visible = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [testPlayer("p1"), testPlayer("p2", { board: [damaged, kit], deck: filler("p2") })],
    });
    const healed = dispatch(visible, { type: "endTurn", playerId: "p1" });
    ok(healed);
    expect(board(healed.state, "p2").find((u) => u.instanceId === damaged.instanceId)!.damageMarked).toBe(1);

    const hidden = testGameState({
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 4 }),
      players: [testPlayer("p1"), testPlayer("p2", { board: [damaged, kit], deck: filler("p2") })],
    });
    const untouched = dispatch(hidden, { type: "endTurn", playerId: "p1" });
    ok(untouched);
    expect(board(untouched.state, "p2").find((u) => u.instanceId === damaged.instanceId)!.damageMarked).toBe(2);
  });

  it("Treuil à Chair : perd 1 Raison à la fin du tour seulement si la Créature équipée a attaqué", () => {
    const setup = (hasAttacked: boolean) => {
      const creature = instance("requin-balafre", "p1", { hasAttackedThisTurn: hasAttacked });
      const treuil = instance("treuil-a-chair", "p1", { attachedToInstanceId: creature.instanceId });
      return testGameState({
        environment: testEnvironment({ tideRemainingTurns: 5 }),
        players: [testPlayer("p1", { board: [creature, treuil], reason: 5 }), testPlayer("p2", { deck: filler("p2") })],
      });
    };
    const attacked = dispatch(setup(true), { type: "endTurn", playerId: "p1" });
    const idle = dispatch(setup(false), { type: "endTurn", playerId: "p1" });
    ok(attacked);
    ok(idle);
    expect(player(attacked.state, "p1").reason).toBe(player(idle.state, "p1").reason - 1);
  });
});

describe("Filet à la Dérive, Radeau de Fortune, Carcasse Renversée, Il Capitano Naufragé", () => {
  it("Filet à la Dérive : au début du tour, si visible, le joueur DÉSIGNE une Créature adverse qui perd 1 Puissance", () => {
    const filet = instance("filet-a-la-derive", "p2");
    const marin = instance("marin-des-jetees", "p1"); // Marin : pas une Créature
    const creature = instance("requin-balafre", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [marin, creature] }), testPlayer("p2", { board: [filet], deck: filler("p2") })],
    });
    const started = dispatch(state, { type: "endTurn", playerId: "p1" });
    ok(started);
    const result = activateReactionFor(started.state, "filet-a-la-derive", creature.instanceId);
    ok(result);
    const base = computeEffectiveStats(creature, "calme").attack;
    const debuffed = board(result.state, "p1").find((u) => u.instanceId === creature.instanceId)!;
    expect(computeEffectiveStats(debuffed, "calme").attack).toBe(base - 1);
    // Un Marin n'est pas une Créature : il ne fait pas partie des cibles.
    expect(board(result.state, "p1").find((u) => u.instanceId === marin.instanceId)!.modifiers).toHaveLength(0);

    // Invisible (Tempête) : rien.
    const hidden = testGameState({
      environment: testEnvironment({ tideState: "tempete", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [creature] }), testPlayer("p2", { board: [filet], deck: filler("p2") })],
    });
    const nothing = dispatch(hidden, { type: "endTurn", playerId: "p1" });
    ok(nothing);
    expect(pendingCandidates(nothing.state).some((c) => c.cardId === "filet-a-la-derive")).toBe(false);
    expect(board(nothing.state, "p1").find((u) => u.instanceId === creature.instanceId)!.modifiers).toHaveLength(0);
  });

  it("Radeau de Fortune : Sabordé, il rend 1 Ancrage", () => {
    const radeau = instance("radeau-de-fortune", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [radeau], anchor: 10 }), testPlayer("p2")],
    });
    const result = dispatch(state, { type: "saborder", playerId: "p1", instanceId: radeau.instanceId });
    ok(result);
    expect(player(result.state, "p1").anchor).toBe(11);
  });

  it("Carcasse Renversée : tant qu'elle est visible, le Navire ne subit pas plus de 4 dégâts d'une même attaque", () => {
    const setup = (tideState: "houle" | "calme") => {
      const attacker = instance("baleine-aux-cicatrices-blanches", "p1"); // 5 Puissance
      const carcasse = instance("carcasse-renversee", "p2");
      return {
        attacker,
        state: testGameState({
          phase: "combatPhase",
          environment: testEnvironment({ tideState, tideRemainingTurns: 4 }),
          players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [carcasse], anchor: 20 })],
        }),
      };
    };
    const capped = setup("houle");
    const cappedResult = dispatch(capped.state, { type: "attack", playerId: "p1", attackerInstanceId: capped.attacker.instanceId });
    ok(cappedResult);
    expect(player(cappedResult.state, "p2").anchor).toBe(16);

    const free = setup("calme"); // Carcasse invisible en Calme
    const freeResult = dispatch(free.state, { type: "attack", playerId: "p1", attackerInstanceId: free.attacker.instanceId });
    ok(freeResult);
    expect(player(freeResult.state, "p2").anchor).toBe(15);
  });

  it("Il Capitano Naufragé : ne perd ses -3 / -2 qu'une seule fois, même sur plusieurs tours", () => {
    const capitano = instance("il-capitano-naufrage", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [capitano] }), testPlayer("p2")] });
    const event = { trigger: "onDamaged" as const, playerId: "p1", cardId: capitano.cardId, sourceInstanceId: capitano.instanceId };

    const first = processTrigger(state, event, 1);
    const second = processTrigger(first.state, event, 3);
    const unit = board(second.state, "p1").find((u) => u.instanceId === capitano.instanceId)!;
    expect(unit.modifiers).toHaveLength(1);
    expect(computeEffectiveStats(unit, "calme")).toMatchObject({ attack: 3, health: 4 });
  });
});

describe("Revenante de la Fosse, Ancre de Tempête", () => {
  it("Revenante de la Fosse : en Abysses, la première fois par tour qu'elle devrait être détruite, elle reste à 1 Résistance", () => {
    const revenante = instance("revenante-de-la-fosse-abyssal", "p1", { damageMarked: 4 }); // 4 Résistance : létal
    const state = testGameState({
      environment: testEnvironment({ tideState: "abysses", tideRemainingTurns: 3, tideOrientation: "descendante" }),
      players: [testPlayer("p1", { board: [revenante] }), testPlayer("p2")],
    });
    const first = processDeaths(state, 1);
    const saved = board(first.state, "p1").find((u) => u.instanceId === revenante.instanceId);
    expect(saved).toBeDefined();
    expect(saved!.damageMarked).toBe(computeEffectiveStats(saved!, "abysses").health - 1);

    // Une seconde fois dans le même tour : elle meurt.
    const again = { ...saved!, damageMarked: 10 };
    const second = processDeaths(
      { ...first.state, players: [{ ...player(first.state, "p1"), board: [again] }, player(first.state, "p2")] },
      1
    );
    expect(board(second.state, "p1")).toHaveLength(0);

    // Hors Abysses : aucune survie.
    const calme = testGameState({ players: [testPlayer("p1", { board: [instance("revenante-de-la-fosse-abyssal", "p1", { damageMarked: 4 })] }), testPlayer("p2")] });
    expect(board(processDeaths(calme, 1).state, "p1")).toHaveLength(0);
  });

  it("Ancre de Tempête : tant qu'elle est visible, la première réduction de Marée du tour est augmentée de 1", () => {
    const ancre = instance("ancre-de-tempete", "p1");
    const horloge1 = instance("horloge-de-maree", "p1"); // Sabordage : -2 tours
    const horloge2 = instance("horloge-de-maree", "p1");
    const state = testGameState({
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 6 }),
      players: [testPlayer("p1", { board: [ancre, horloge1, horloge2] }), testPlayer("p2")],
    });
    // L'Horloge ouvre un choix au Sabordage : option 0 = réduire de 2 tours.
    const reduceBy2 = (from: GameState, instanceId: string) => {
      const saborded = dispatch(from, { type: "saborder", playerId: "p1", instanceId });
      ok(saborded);
      const chosen = dispatch(saborded.state, { type: "resolveChoice", playerId: "p1", choice: { abilityIndex: 0 } });
      ok(chosen);
      return chosen.state;
    };
    const first = reduceBy2(state, horloge1.instanceId);
    expect(first.environment.tideRemainingTurns).toBe(3); // 6 - (2 + 1)
    const second = reduceBy2(first, horloge2.instanceId);
    expect(second.environment.tideRemainingTurns).toBe(1); // 3 - 2, sans amplification

    // Invisible (Calme) : pas d'amplification.
    const hidden = testGameState({
      environment: testEnvironment({ tideState: "calme", tideRemainingTurns: 6 }),
      players: [testPlayer("p1", { board: [instance("ancre-de-tempete", "p1"), instance("horloge-de-maree", "p1")] }), testPlayer("p2")],
    });
    const plain = reduceBy2(hidden, player(hidden, "p1").board[1]!.instanceId);
    expect(plain.environment.tideRemainingTurns).toBe(4);
  });
});
