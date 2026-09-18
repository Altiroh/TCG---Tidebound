/**
 * Le bot et la capacité activable de Navire (Le Goliath — Canon de proue).
 *
 * Un Navire dont le bot ne sait pas se servir est un Navire que le bot joue
 * en moins bien qu'un autre : le Goliath n'a ni passif ni faiblesse, toute
 * son identité tient dans son Canon. S'il ne l'arme jamais, il joue avec un
 * Navire vide.
 *
 * Deux choses à garantir, et elles sont distinctes :
 *   1. les deux gestes sont ÉNUMÉRÉS (`enumerateActions`) — sinon le bot ne
 *      peut littéralement pas y penser ;
 *   2. un canon armé VAUT quelque chose (`evaluateState`) — sinon armer est
 *      un coup purement négatif, et les difficultés qui jugent à un coup ne
 *      le joueront jamais.
 */
import { describe, expect, it } from "vitest";
import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { evaluateState } from "@/game/bot/evaluateState";
import { runBotTurn } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import { isShipArmed } from "@/game/state/shipAbility";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/**
 * Deck de secours. Sans lui, la pioche de fin de tour vide déclenche le
 * Jugement de l'Océan et la partie se termine au premier `endTurn` — le bot
 * ne joue alors pas un tour, il gagne ou perd la partie, et on ne mesure
 * plus rien de ce qu'on voulait mesurer.
 */
function deckOf(ownerId: string) {
  return Array.from({ length: 12 }, () => instance("marin-des-jetees", ownerId));
}

/** Partie où le bot (p1) mène Le Goliath. `board` garnit le plateau adverse. */
function goliathBotState(overrides: Partial<GameState> = {}, opponentBoard = [] as ReturnType<typeof instance>[]): GameState {
  return testGameState({
    players: [
      testPlayer("p1", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: deckOf("p1") }),
      testPlayer("p2", { shipId: "le-brise-lames", board: opponentBoard, deck: deckOf("p2") }),
    ],
    ...overrides,
  });
}

describe("le bot et le Canon de proue — énumération", () => {
  it("propose d'armer en Phase principale, et seulement là", () => {
    const main = enumerateCandidateActions(goliathBotState(), "p1");
    expect(main.some((a) => a.type === "activateShipAbility")).toBe(true);

    // En combat, la capacité n'est pas dans sa fenêtre : ne pas la proposer.
    const combat = enumerateCandidateActions(goliathBotState({ phase: "combatPhase" }), "p1");
    expect(combat.some((a) => a.type === "activateShipAbility")).toBe(false);
  });

  it("ne propose rien pour un Navire sans capacité câblée", () => {
    const actions = enumerateCandidateActions(testGameState(), "p1");
    expect(actions.some((a) => a.type === "activateShipAbility" || a.type === "fireShipAbility")).toBe(false);
  });

  it("une fois armé, propose le tir sur le Navire adverse ET sur chaque permanent adverse", () => {
    const cible = instance("crabe-de-fer", "p2");
    const armed = dispatch(goliathBotState({}, [cible]), { type: "activateShipAbility", playerId: "p1" });
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    // Toujours en Phase principale : le tir n'est pas encore dans sa fenêtre.
    expect(enumerateCandidateActions(armed.state, "p1").some((a) => a.type === "fireShipAbility")).toBe(false);

    const inCombat = enumerateCandidateActions({ ...armed.state, phase: "combatPhase" }, "p1");
    const shots = inCombat.filter((a) => a.type === "fireShipAbility");
    expect(shots).toHaveLength(2);
    expect(shots.some((a) => a.type === "fireShipAbility" && a.targetInstanceId === undefined)).toBe(true);
    expect(shots.some((a) => a.type === "fireShipAbility" && a.targetInstanceId === cible.instanceId)).toBe(true);
  });

  it("ne propose pas de tirer tant que le canon n'est pas armé", () => {
    const combat = enumerateCandidateActions(goliathBotState({ phase: "combatPhase" }), "p1");
    expect(combat.some((a) => a.type === "fireShipAbility")).toBe(false);
  });
});

describe("le bot et le Canon de proue — évaluation", () => {
  it("un canon armé vaut mieux que la Raison qu'il a coûtée : armer monte le score", () => {
    const before = goliathBotState();
    const armed = dispatch(before, { type: "activateShipAbility", playerId: "p1" });
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    expect(evaluateState(armed.state, "p1")).toBeGreaterThan(evaluateState(before, "p1"));
  });

  it("…mais jamais assez pour préférer garder le canon chargé plutôt que tirer", () => {
    // Le plus PETIT tir utile : un permanent qui survivra aux 2 dégâts.
    const gros = instance("crabe-de-fer", "p2");
    const armed = dispatch(goliathBotState({}, [gros]), { type: "activateShipAbility", playerId: "p1" });
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const inCombat = { ...armed.state, phase: "combatPhase" as const };

    const shot = dispatch(inCombat, { type: "fireShipAbility", playerId: "p1", targetInstanceId: gros.instanceId });
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;

    expect(evaluateState(shot.state, "p1")).toBeGreaterThan(evaluateState(inCombat, "p1"));
  });
});

describe("le bot et le Canon de proue — en partie", () => {
  /**
   * « difficile » ne se trompe jamais par accident : ses assertions valent
   * sur un seul tour. « moyen » et « facile », eux, renoncent délibérément
   * au meilleur coup (25 % et 55 % du temps) — exiger d'eux le bon geste à
   * chaque tour testerait leur hasard, pas leur connaissance du canon. On
   * leur demande donc seulement de savoir s'en servir, pas de le faire à
   * tous les coups.
   */
  const armedAtLeastOnce = (difficulty: BotDifficulty, runs: number, build: () => GameState) =>
    Array.from({ length: runs }, () => runBotTurn(build(), "p1", difficulty)).filter((s) =>
      s.eventLog.some((e) => e.type === "SHIP_ABILITY_ACTIVATED" && e.playerId === "p1")
    ).length;

  it("« difficile » arme le canon, puis tire avant la fin de son tour", () => {
    const after = runBotTurn(goliathBotState({}, [instance("crabe-de-fer", "p2")]), "p1", "difficile");
    const types = after.eventLog.map((e) => e.type);
    expect(types, "le canon n'a jamais été armé").toContain("SHIP_ABILITY_ACTIVATED");
    expect(types, "le canon a été armé sans jamais tirer").toContain("SHIP_ABILITY_FIRED");
    // Et dans cet ordre : on n'arme pas après avoir tiré.
    expect(types.indexOf("SHIP_ABILITY_ACTIVATED")).toBeLessThan(types.indexOf("SHIP_ABILITY_FIRED"));
  });

  it.each(["moyen", "facile"] as BotDifficulty[])("« %s » sait s'en servir, même s'il ne le fait pas à tous les coups", (difficulty) => {
    const runs = difficulty === "moyen" ? 8 : 16;
    expect(
      armedAtLeastOnce(difficulty, runs, () => goliathBotState()),
      `« ${difficulty} » n'a jamais armé le Canon en ${runs} tours`
    ).toBeGreaterThan(0);
  });

  it("tire sur le Navire adverse quand il n'y a rien d'autre à viser", () => {
    const armed = dispatch(goliathBotState(), { type: "activateShipAbility", playerId: "p1" });
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    const chosen = chooseBotAction({ ...armed.state, phase: "combatPhase" }, "p1", "difficile");
    expect(chosen.type).toBe("fireShipAbility");
    expect(chosen.type === "fireShipAbility" && chosen.targetInstanceId).toBeUndefined();
  });

  it("préfère achever un permanent adverse plutôt que gratter la coque", () => {
    // Un Marin à 1/2 : les 2 dégâts le tuent. Retirer un corps du plateau
    // adverse vaut mieux que 2 points d'Ancrage — le Canon est un outil de
    // contrôle avant d'être un outil de pression, c'est son intention de
    // design.
    const fragile = instance("marin-des-jetees", "p2");
    const armed = dispatch(goliathBotState({}, [fragile]), { type: "activateShipAbility", playerId: "p1" });
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    const chosen = chooseBotAction({ ...armed.state, phase: "combatPhase" }, "p1", "difficile");
    expect(chosen.type).toBe("fireShipAbility");
    expect(chosen.type === "fireShipAbility" && chosen.targetInstanceId).toBe(fragile.instanceId);
  });

  it("ne laisse jamais un canon armé traverser la fin du tour", () => {
    const after = runBotTurn(goliathBotState({}, [instance("crabe-de-fer", "p2")]), "p1", "difficile");
    expect(isShipArmed(getPlayer(after, "p1"), after.turnNumber)).toBe(false);
  });
});
