/**
 * Capacités activables de NAVIRE (Roadmap Phase 2, P1) et leur première
 * application : Le Goliath — Canon de proue.
 *
 * Geste en deux temps arrêté le 18/09/2026 : on paie 2 Raison en Phase
 * principale pour ARMER (les planches s'écartent), puis on tire — ou non —
 * pendant la Phase de combat. Le tir vise comme une attaque, mais ses
 * dégâts sont des dégâts de CAPACITÉ : pas de riposte, pas de faiblesse
 * d'attaque directe, aucune attaque d'unité consommée.
 */
import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { getShipDefinition } from "@/game/environment/shipData";
import { isShipArmed, shipAbilityView } from "@/game/state/shipAbility";
import { getPlayer, type GameState } from "@/game/state/types";
import { instance, testGameState, testPlayer } from "./testHelpers";

/** Partie où p1 mène Le Goliath, p2 Le Brise-Lames — sans rien sur les plateaux. */
function goliathState(overrides: Partial<GameState> = {}): GameState {
  return testGameState({
    players: [
      testPlayer("p1", { shipId: "le-goliath", reason: 10, reasonMax: 10 }),
      testPlayer("p2", { shipId: "le-brise-lames" }),
    ],
    ...overrides,
  });
}

const arm = { type: "activateShipAbility", playerId: "p1" } as const;
const fire = (targetInstanceId?: string) =>
  ({ type: "fireShipAbility", playerId: "p1", ...(targetInstanceId ? { targetInstanceId } : {}) }) as const;

describe("capacité activable de Navire — primitive générique", () => {
  it("un Navire sans capacité câblée refuse les deux gestes — les capacités « une fois par partie » restent en texte seul", () => {
    const state = testGameState();
    expect(getShipDefinition("lerrant").activatableAbility).toBeUndefined();
    expect(getShipDefinition("lerrant").capacityText).toContain("Changer de cap");

    const refused = dispatch(state, arm);
    expect(refused.ok).toBe(false);
    expect(shipAbilityView(state, "p1")).toBeUndefined();
  });

  it("l'activation est refusée hors de sa fenêtre de phase, et le tir hors de la sienne", () => {
    // Armer pendant le combat : refusé, la capacité est de Phase principale.
    const inCombat = goliathState({ phase: "combatPhase" });
    const tooLate = dispatch(inCombat, arm);
    expect(tooLate.ok).toBe(false);
    expect(tooLate.ok === false && tooLate.error).toContain("Phase principale");

    // Armer en Phase principale : accepté. Tirer tout de suite : refusé.
    const armed = dispatch(goliathState(), arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const tooEarly = dispatch(armed.state, fire());
    expect(tooEarly.ok).toBe(false);
    expect(tooEarly.ok === false && tooEarly.error).toContain("Phase de combat");
  });

  it("l'activation coûte sa Raison et ne peut pas être répétée dans le tour", () => {
    const first = dispatch(goliathState(), arm);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(getPlayer(first.state, "p1").reason).toBe(8);

    const second = dispatch(first.state, arm);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.error).toContain("déjà été utilisée ce tour");
  });

  it("le coût se paie même sans Raison suffisante — il creuse la Déraison, comme toute perte de Raison", () => {
    const broke = dispatch(goliathState({ players: [testPlayer("p1", { shipId: "le-goliath", reason: 1 }), testPlayer("p2")] }), arm);
    expect(broke.ok).toBe(true);
    if (!broke.ok) return;
    expect(getPlayer(broke.state, "p1").reason).toBe(-1);
    expect(isShipArmed(getPlayer(broke.state, "p1"), broke.state.turnNumber)).toBe(true);
  });

  it("un canon armé et non tiré ne reste pas chargé au tour suivant", () => {
    const armed = dispatch(goliathState(), arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    expect(isShipArmed(getPlayer(armed.state, "p1"), armed.state.turnNumber)).toBe(true);

    // L'armement est horodaté : il périme de lui-même dès que le tour change.
    const nextTurn = { ...armed.state, turnNumber: armed.state.turnNumber + 2, phase: "combatPhase" as const };
    expect(isShipArmed(getPlayer(nextTurn, "p1"), nextTurn.turnNumber)).toBe(false);
    const refused = dispatch(nextTurn, fire());
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toContain("n'est pas armé");
  });

  it("tirer sans avoir armé est refusé", () => {
    const refused = dispatch(goliathState({ phase: "combatPhase" }), fire());
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toContain("n'est pas armé");
  });
});

describe("Le Goliath — Canon de proue", () => {
  it("tire 2 dégâts sur le permanent adverse désigné, referme le canon, et ne subit aucune riposte", () => {
    const defender = instance("crabe-de-fer", "p2");
    const attacker = instance("marin-des-jetees", "p1");
    const state = goliathState({
      players: [
        testPlayer("p1", { shipId: "le-goliath", board: [attacker] }),
        testPlayer("p2", { shipId: "le-brise-lames", board: [defender] }),
      ],
    });

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    const shot = dispatch({ ...armed.state, phase: "combatPhase" }, fire(defender.instanceId));
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;

    const hit = getPlayer(shot.state, "p2").board.find((u) => u.instanceId === defender.instanceId);
    expect(hit?.damageMarked).toBe(2);

    // Aucune riposte : le Marin du Goliath n'a rien encaissé, et il n'a pas
    // « attaqué » — son attaque du tour lui reste.
    const mine = getPlayer(shot.state, "p1").board.find((u) => u.instanceId === attacker.instanceId);
    expect(mine?.damageMarked).toBe(0);
    expect(mine?.hasAttackedThisTurn).toBe(false);

    // Le canon s'est refermé : un second tir est refusé.
    expect(isShipArmed(getPlayer(shot.state, "p1"), shot.state.turnNumber)).toBe(false);
    expect(dispatch(shot.state, fire(defender.instanceId)).ok).toBe(false);
  });

  it("sans cible désignée, le tir frappe le Navire adverse — et la faiblesse « Coque légère » ne s'applique pas", () => {
    // Le Courlis prend +1 sur une ATTAQUE directe : un tir de capacité n'en est pas une.
    const state = goliathState({
      players: [testPlayer("p1", { shipId: "le-goliath" }), testPlayer("p2", { shipId: "le-courlis" })],
    });
    const anchorBefore = getPlayer(state, "p2").anchor;
    expect(getShipDefinition("le-courlis").directAttackWeakness).toBe(1);

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const shot = dispatch({ ...armed.state, phase: "combatPhase" }, fire());
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;

    expect(getPlayer(shot.state, "p2").anchor).toBe(anchorBefore - 2);
  });

  it("Garde s'applique au tir comme à une attaque : le porteur doit être visé en priorité", () => {
    // Porteur de Garde INCONDITIONNEL : le Crabe de Fer, lui, perd Garde
    // pendant Calme — l'état de Marée des tests par défaut.
    const guard = instance("mouette-du-brise-lames", "p2");
    const soft = instance("marin-des-jetees", "p2");
    const state = goliathState({
      players: [
        testPlayer("p1", { shipId: "le-goliath" }),
        testPlayer("p2", { shipId: "le-brise-lames", board: [guard, soft] }),
      ],
    });

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const inCombat = { ...armed.state, phase: "combatPhase" as const };

    // Le Navire adverse est hors d'atteinte tant qu'un Garde tient la ligne.
    const atShip = dispatch(inCombat, fire());
    expect(atShip.ok).toBe(false);
    expect(atShip.ok === false && atShip.error).toContain("Garde");

    // Le permanent sans Garde non plus.
    expect(dispatch(inCombat, fire(soft.instanceId)).ok).toBe(false);

    // Le porteur de Garde, oui.
    const atGuard = dispatch(inCombat, fire(guard.instanceId));
    expect(atGuard.ok).toBe(true);
  });

  it("un Objet adverse n'est pas une cible — il n'a pas de Résistance", () => {
    const objet = instance("thermos-du-dernier-quart", "p2");
    const state = goliathState({
      players: [
        testPlayer("p1", { shipId: "le-goliath" }),
        testPlayer("p2", { shipId: "le-brise-lames", board: [objet] }),
      ],
    });

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const refused = dispatch({ ...armed.state, phase: "combatPhase" }, fire(objet.instanceId));
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.error).toContain("Résistance");
  });

  it("le tir achève un permanent déjà blessé — c'est l'intention de design du Canon", () => {
    // Crabe de Fer : 5 de Résistance. Trois points déjà marqués, le canon
    // apporte les deux qui manquent — seul, il n'aurait rien fini.
    const wounded = instance("crabe-de-fer", "p2", { damageMarked: 3 });
    const state = goliathState({
      players: [
        testPlayer("p1", { shipId: "le-goliath" }),
        testPlayer("p2", { shipId: "le-brise-lames", board: [wounded] }),
      ],
    });

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;
    const shot = dispatch({ ...armed.state, phase: "combatPhase" }, fire(wounded.instanceId));
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;

    const opponent = getPlayer(shot.state, "p2");
    expect(opponent.board.some((u) => u.instanceId === wounded.instanceId)).toBe(false);
    expect(opponent.graveyard.some((u) => u.instanceId === wounded.instanceId)).toBe(true);
  });

  it("la vue d'interface dit ce que le moteur ferait — armable en principale, tirable en combat une fois armé", () => {
    const state = goliathState();
    const before = shipAbilityView(state, "p1")!;
    expect(before.ability.name).toBe("Canon de proue");
    expect(before.canActivate).toBe(true);
    expect(before.armed).toBe(false);
    expect(before.canFire).toBe(false);
    expect(before.fireBlockedBy).toContain("pas armé");

    const armed = dispatch(state, arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    const afterArming = shipAbilityView(armed.state, "p1")!;
    expect(afterArming.armed).toBe(true);
    expect(afterArming.canActivate).toBe(false);
    expect(afterArming.activationBlockedBy).toContain("Déjà utilisée");
    // Toujours en Phase principale : le canon est ouvert mais ne tire pas encore.
    expect(afterArming.canFire).toBe(false);

    const inCombat = shipAbilityView({ ...armed.state, phase: "combatPhase" }, "p1")!;
    expect(inCombat.canFire).toBe(true);
    expect(inCombat.fireBlockedBy).toBeUndefined();
  });

  it("l'adversaire ne peut ni armer ni tirer le canon du Goliath, et rien ne se déclenche hors de son tour", () => {
    const armed = dispatch(goliathState(), arm);
    expect(armed.ok).toBe(true);
    if (!armed.ok) return;

    const opponentTurn = { ...armed.state, activePlayerId: "p2", phase: "combatPhase" as const };
    expect(dispatch(opponentTurn, fire()).ok).toBe(false);
    expect(shipAbilityView(opponentTurn, "p1")!.canFire).toBe(false);
    expect(dispatch(opponentTurn, { type: "activateShipAbility", playerId: "p2" }).ok).toBe(false);
  });
});
