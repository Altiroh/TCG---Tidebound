import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { deriveAttack } from "@/features/match/useAttackPresentation";
import { BASE_FRAME_MS, framePaceMs } from "@/features/match/framePacing";
import { activateReactionFor, instance, testEnvironment, testGameState, testPlayer } from "../game/testHelpers";
import type { GameEvent, GameState } from "@/game";

/**
 * Le retard d'affichage des attaques (`useAttackPresentation`) montre l'état
 * d'AVANT le choc pendant l'animation. Tout ce qui DÉCIDE — le bot, la
 * validation d'une action — doit continuer à lire l'état réel.
 *
 * Ces tests portent sur l'invariant de moteur qui rend le bug possible :
 * rejouer une action depuis un état périmé ramène en jeu une carte déjà
 * partie au cimetière. C'est ce qu'on voyait à l'écran — la carte détruite
 * revenait encaisser le coup avant de repartir.
 */
function boardIds(state: GameState, playerId: string): string[] {
  return state.players.find((p) => p.id === playerId)!.board.map((card) => card.cardId);
}

describe("état réel contre état affiché", () => {
  it("rejouer depuis un état périmé remet en jeu une carte détruite", () => {
    const attacker = instance("murene-aveugle", "p1", { summoningSick: false });
    const victim = instance("poisson-lanterne", "p2");
    const base = testGameState();
    const before: GameState = {
      ...base,
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [attacker] }),
        testPlayer("p2", { shipId: "lerrant", board: [victim] }),
      ] as typeof base.players,
    };

    const attack = dispatch(before, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: victim.instanceId,
    });
    expect(attack.ok).toBe(true);
    if (!attack.ok) return;

    // Murène 3/1 contre Poisson-Lanterne 1/1 : la victime meurt.
    expect(boardIds(attack.state, "p2")).toEqual([]);

    // L'état d'AVANT, celui que l'affichage retient pendant l'animation,
    // contient toujours la victime. C'est légitime pour PEINDRE, jamais
    // pour décider : toute action repartant de là la ressuscite.
    expect(boardIds(before, "p2")).toEqual(["poisson-lanterne"]);
  });

  it("l'état d'après une attaque ne réapparaît jamais de lui-même", () => {
    // Garde-fou de lecture : deux états successifs du moteur sont
    // indépendants, et rien dans l'état d'après ne permet de revenir à
    // celui d'avant. Le retour en arrière ne peut donc venir que d'un
    // appelant qui a gardé l'ancien — ce que le bot faisait.
    const attacker = instance("murene-aveugle", "p1", { summoningSick: false });
    const victim = instance("poisson-lanterne", "p2");
    const base = testGameState();
    const before: GameState = {
      ...base,
      phase: "combatPhase",
      players: [
        testPlayer("p1", { board: [attacker] }),
        testPlayer("p2", { shipId: "lerrant", board: [victim] }),
      ] as typeof base.players,
    };

    const attack = dispatch(before, {
      type: "attack",
      playerId: "p1",
      attackerInstanceId: attacker.instanceId,
      defenderInstanceId: victim.instanceId,
    });
    if (!attack.ok) return;

    // Le journal ne perd rien, et la victime est bien au cimetière.
    expect(attack.state.eventLog.length).toBeGreaterThan(before.eventLog.length);
    expect(attack.state.players[1].graveyard.map((c) => c.cardId)).toContain("poisson-lanterne");
  });
});

describe("animation d'attaque : seul le coup porté compte", () => {
  const base = { turnNumber: 3, timestamp: 0 };
  const attacker = instance("requin-balafre", "p1");
  const defender = instance("murene-aveugle", "p2");
  const after = testGameState({
    players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [defender] })],
  });

  it("les dégâts d'une capacité qui suivent le coup ne s'y ajoutent pas", () => {
    const events: GameEvent[] = [
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: attacker.instanceId, defenderInstanceId: defender.instanceId },
      { ...base, type: "DAMAGE", targetInstanceId: defender.instanceId, amount: 4, combat: "strike" },
      // Une capacité « lorsqu'elle subit des dégâts » qui la blesse encore, puis blesse l'attaquant.
      { ...base, type: "DAMAGE", targetInstanceId: defender.instanceId, amount: 2 },
      { ...base, type: "DAMAGE", targetInstanceId: attacker.instanceId, amount: 5 },
      { ...base, type: "DAMAGE", targetInstanceId: attacker.instanceId, amount: 3, combat: "retaliation" },
    ];
    expect(deriveAttack(events, after, 1)).toMatchObject({ amount: 4, retaliation: 3 });
  });

  it("un renvoi au Navire de l'attaquant n'est pas lu comme le coup", () => {
    const events: GameEvent[] = [
      { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: attacker.instanceId },
      { ...base, type: "DAMAGE", targetPlayerId: "p1", amount: 3, targetAnchorAfter: 27 },
    ];
    // Aucun coup marqué : l'animation vise toujours le Navire adverse, pour 0.
    expect(deriveAttack(events, after, 1)).toMatchObject({ defenderPlayerId: "p2", amount: 0 });
  });
});

/**
 * Fenêtre de réaction ouverte à la DÉCLARATION (`suspendrePourInterception`) :
 * le moteur émet `ATTACK` deux fois, à la déclaration puis à la reprise.
 * Une seule mise en scène — celle du coup résolu.
 */
describe("animation d'attaque : une seule quand une fenêtre de réaction s'ouvre", () => {
  const nouveaux = (avant: GameState, apres: GameState) => apres.eventLog.slice(avant.eventLog.length);
  function situation() {
    const attaquant = instance("la-chose-qui-remonte", "p1", { summoningSick: false }); // 5 Puissance
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [attaquant], anchor: 20 }), testPlayer("p2", { board: [cylindre], anchor: 20 })],
    });
    return { attaquant, state };
  }

  it("la déclaration suspendue ne se met pas en scène, la résolution si", () => {
    const { attaquant, state } = situation();
    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    expect(declaree.ok).toBe(true);
    if (!declaree.ok) return;
    const declaration = nouveaux(state, declaree.state);
    expect(declaration.some((event) => event.type === "ATTACK")).toBe(true);
    expect(declaration.some((event) => event.type === "REACTION_WINDOW_OPENED")).toBe(true);
    expect(deriveAttack(declaration, declaree.state, 1)).toBeNull();
    // Rien n'est retenu : la fenêtre s'affiche aussitôt, sans attendre un élan.
    expect(framePaceMs(state, declaree.state)).toBe(BASE_FRAME_MS);

    const passe = dispatch(declaree.state, { type: "passReaction", playerId: "p2" });
    expect(passe.ok).toBe(true);
    if (!passe.ok) return;
    expect(deriveAttack(nouveaux(declaree.state, passe.state), passe.state, 2)).toMatchObject({
      attackerInstanceId: attaquant.instanceId,
      defenderPlayerId: "p2",
      amount: 5,
    });
  });

  it("un coup intercepté (Cylindre flottant) : une seule mise en scène, à 0 dégât", () => {
    const attaquant = instance("murene-aveugle", "p1", { summoningSick: false }); // 3/1
    const cylindre = instance("cylindre-flottant", "p2", { turnsRemaining: 3 });
    const state = testGameState({
      phase: "combatPhase",
      environment: testEnvironment({ tideState: "houle", tideRemainingTurns: 4 }),
      players: [testPlayer("p1", { board: [attaquant], anchor: 20 }), testPlayer("p2", { board: [cylindre], anchor: 20 })],
    });
    const declaree = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    expect(declaree.ok).toBe(true);
    if (!declaree.ok) return;
    expect(deriveAttack(nouveaux(state, declaree.state), declaree.state, 1)).toBeNull();
    const active = activateReactionFor(declaree.state, "cylindre-flottant");
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(active.state.pendingAttack).toBeUndefined();
    // Le Cylindre a annulé les dégâts : le coup se joue, pour rien.
    expect(deriveAttack(nouveaux(declaree.state, active.state), active.state, 2)).toMatchObject({ amount: 0 });
  });

  it("sans fenêtre, l'attaque se met en scène dès la déclaration", () => {
    const attaquant = instance("la-chose-qui-remonte", "p1", { summoningSick: false });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [attaquant], anchor: 20 }), testPlayer("p2", { anchor: 20 })],
    });
    const result = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(deriveAttack(nouveaux(state, result.state), result.state, 1)).toMatchObject({ defenderPlayerId: "p2", amount: 5 });
  });
});

import { ATTACK_TOTAL_MS, resolvedAttackIndex, stage } from "@/features/match/useAttackPresentation";

describe("d'abord l'attaque, PUIS les effets qu'elle déclenche", () => {
  it("un bonus « lorsqu'elle attaque » part après l'animation d'attaque, pas avec elle", () => {
    const sterne = instance("sterne-des-embruns", "p1", { summoningSick: false });
    const victim = instance("poisson-lanterne", "p2");
    const base = testGameState();
    const before: GameState = {
      ...base,
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [sterne] }), testPlayer("p2", { shipId: "lerrant", board: [victim] })] as typeof base.players,
    };
    const result = dispatch(before, { type: "attack", playerId: "p1", attackerInstanceId: sterne.instanceId, defenderInstanceId: victim.instanceId });
    if (!result.ok) throw new Error(result.error);
    const events = result.state.eventLog.slice(before.eventLog.length);
    expect(resolvedAttackIndex(events, result.state)).toBeGreaterThanOrEqual(0);

    const staged = stage(before, result.state, events, { current: 0 });
    // L'attaque est mise en scène, et rien ne part avec elle.
    expect(staged.attack).not.toBeNull();
    expect(staged.volley).toBeNull();
    // Le bonus part une fois l'attaque jouée, retour compris.
    const apres = staged.post?.volleys ?? [];
    expect(apres.length).toBeGreaterThan(0);
    expect(Math.min(...apres.map((volley) => volley.delayMs))).toBeGreaterThanOrEqual(ATTACK_TOTAL_MS);
  });
});

import { withAttackOutcome } from "@/features/match/useAttackPresentation";
import { CHARGE_MS } from "@/features/match/impactTier";

describe("plus le coup est fort, plus l'élan se charge", () => {
  const base = { turnNumber: 3, timestamp: 0 };
  const attacker = instance("requin-balafre", "p1");
  const defender = instance("murene-aveugle", "p2");
  const after = testGameState({
    players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [defender] })],
  });
  const hit = (amount: number): GameEvent[] => [
    { ...base, type: "ATTACK", playerId: "p1", attackerInstanceId: attacker.instanceId, defenderInstanceId: defender.instanceId },
    { ...base, type: "DAMAGE", targetInstanceId: defender.instanceId, amount, combat: "strike" },
  ];

  it("un coup léger part tout de suite, sans charge", () => {
    const attack = deriveAttack(hit(3), after, 1)!;
    expect(attack.chargeMs).toBeUndefined();
    expect(attack.leadMs).toBeUndefined();
  });

  it("un coup lourd, puis massif, charge de plus en plus longtemps avant de partir", () => {
    const lourd = deriveAttack(hit(5), after, 1)!;
    const massif = deriveAttack(hit(7), after, 1)!;
    expect(lourd.chargeMs).toBe(CHARGE_MS.heavy);
    expect(lourd.leadMs).toBe(CHARGE_MS.heavy);
    expect(massif.chargeMs).toBe(CHARGE_MS.massive);
    expect(massif.chargeMs!).toBeGreaterThan(lourd.chargeMs!);
  });
});

describe("un jet de dé qui suit l'attaque : le coup, PUIS le dé", () => {
  it("pendant que le dé roule, le plateau montre l'issue du coup et pas celle du jet", () => {
    const attacker = instance("requin-balafre", "p1");
    const defender = instance("murene-aveugle", "p2");
    const bystander = instance("poisson-lanterne", "p2");
    const shown = testGameState({
      players: [testPlayer("p1", { board: [attacker] }), testPlayer("p2", { board: [defender, bystander] })],
    });
    // Après le lot : le défenseur est mort, l'attaquant blessé, et le jet a encore blessé le spectateur.
    const live = testGameState({
      players: [
        testPlayer("p1", { board: [{ ...attacker, damageMarked: 1 }] }),
        testPlayer("p2", { board: [{ ...bystander, damageMarked: 1 }] }),
      ],
    });
    const attack = deriveAttack(
      [{ turnNumber: 3, timestamp: 0, type: "ATTACK", playerId: "p1", attackerInstanceId: attacker.instanceId, defenderInstanceId: defender.instanceId }],
      live,
      1
    )!;
    const display = withAttackOutcome(shown, live, attack);
    expect(display.players[0].board).toEqual([{ ...attacker, damageMarked: 1 }]);
    // Le défenseur est parti ; le spectateur garde l'état d'avant le jet.
    expect(display.players[1].board).toEqual([bystander]);
  });
});
