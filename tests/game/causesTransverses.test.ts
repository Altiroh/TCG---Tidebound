import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import type { GameState, PlayerState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testGameState, testPlayer } from "./testHelpers";

/**
 * Causes communes relevées par la revue cartes ↔ moteur (B1 à B7, phase 1).
 * Chaque bloc joue les cartes via `dispatch` et vérifie l'effet observable,
 * avec le cas qui était faux avant la correction.
 */

const p = (state: GameState, id: string): PlayerState => state.players.find((x) => x.id === id)!;
const unit = (state: GameState, instanceId: string) =>
  state.players.flatMap((x) => x.board).find((u) => u.instanceId === instanceId);

function ok(result: ReturnType<typeof dispatch>): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("« unité <famille> » : Marin ou Créature, jamais une Structure, un Équipement ou un Objet", () => {
  it("Chef de Banc et Bavard ne voient pas arriver une Structure Cra-Poiscail, mais voient la Créature qui suit", () => {
    const chef = instance("cra-poiscail-chef-de-banc", "p1");
    const bavard = instance("cra-poiscail-bavard", "p1");
    const tas = instance("le-tas-de-trucs", "p1");
    const fesse = instance("ptite-fesse", "p1");
    let state = testGameState({
      players: [testPlayer("p1", { board: [chef, bavard], hand: [tas, fesse] }), testPlayer("p2", { shipId: "le-goliath" })],
    });

    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: tas.instanceId }));
    // Avant : la Structure recevait +1/+1 permanent et +1/0, et les deux
    // « une fois par tour » étaient brûlés.
    expect(unit(state, tas.instanceId)!.modifiers).toEqual([]);

    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: fesse.instanceId }));
    const mods = unit(state, fesse.instanceId)!.modifiers;
    expect(mods.reduce((s, m) => s + m.attack, 0)).toBe(2);
    expect(mods.reduce((s, m) => s + m.health, 0)).toBe(1);
  });

  it("Tas de Bouts de Bois ne grandit pas quand une Structure Cra-Poiscail est Sabordée, mais quand une unité est détruite", () => {
    const bois = instance("tas-de-bouts-de-bois", "p1", { turnsRemaining: 3 });
    const flaque = instance("la-flaque-sacree", "p1", { turnsRemaining: 3 });
    const tetard = instance("ptite-fesse", "p1", { damageMarked: 1 });
    let state = testGameState({
      players: [testPlayer("p1", { board: [bois, flaque, tetard] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: flaque.instanceId }));
    expect(unit(state, bois.instanceId)!.modifiers).toEqual([]);

    // Une unité Cra-Poiscail détruite par un effet : le Tas la voit.
    state = {
      ...state,
      players: state.players.map((x) =>
        x.id === "p1" ? { ...x, board: x.board.map((u) => (u.instanceId === tetard.instanceId ? { ...u, pendingRemoval: "destroyed" as const } : u)) } : x
      ) as [PlayerState, PlayerState],
    };
    state = ok(dispatch(state, { type: "advancePhase", playerId: "p1" }));
    expect(unit(state, bois.instanceId)!.modifiers.reduce((s, m) => s + m.health, 0)).toBe(1);
  });

  it("Le Régisseur Sans Visage ne se propose pas à la pose d'un Objet Marionnette", () => {
    const regisseur = instance("le-regisseur-sans-visage", "p1");
    const autre = instance("pulcinella-gonfle", "p1");
    const masque = instance("le-masque-fendu", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [regisseur, autre], hand: [masque] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const posed = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: masque.instanceId }));
    expect(pendingCandidates(posed).some((c) => c.cardId === "le-regisseur-sans-visage")).toBe(false);
  });

  it("Arlecchino n'est pas proposé quand la seule autre Marionnette en jeu est une Structure", () => {
    const theatre = instance("le-theatre-englouti", "p1", { turnsRemaining: 4 });
    const arlecchino = instance("arlecchino-des-profondeurs", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [theatre], hand: [arlecchino] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const posed = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: arlecchino.instanceId }));
    expect(pendingCandidates(posed).some((c) => c.cardId === "arlecchino-des-profondeurs")).toBe(false);
  });

  it("La réduction du Régisseur abyssal n'est pas consommée par un Objet Marionnette", () => {
    const regisseur = instance("le-regisseur-des-profondeurs-abyssal", "p1");
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const masque = instance("le-masque-fendu", "p1");
    const arlecchino = instance("arlecchino-des-profondeurs", "p1");
    let state = testGameState({
      players: [
        testPlayer("p1", { board: [regisseur, pulcinella, masque], hand: [arlecchino, instance("murene-aveugle", "p1")], deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    // Le Masque renvoie Pulcinella : le Régisseur pose « la prochaine UNITÉ
    // Marionnette coûte 1 de moins ».
    state = ok(dispatch(state, { type: "breakObject", playerId: "p1", instanceId: masque.instanceId, targetInstanceId: pulcinella.instanceId }));
    if (state.pendingChoice?.kind === "handDiscard") {
      const hand = p(state, "p1").hand;
      const murene = hand.find((c) => c.cardId === "murene-aveugle")!;
      state = ok(dispatch(state, { type: "resolveChoice", playerId: "p1", choice: { discardInstanceIds: [murene.instanceId] } }));
    }
    const before = p(state, "p1").reason;
    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: arlecchino.instanceId }));
    // Arlecchino (coût 2) est une unité : il profite de la réduction.
    expect(p(state, "p1").reason).toBe(before - 1);
  });
});

describe("renvois en main par une RÉACTION : relayés à `onReturnedToHand`", () => {
  it("Le Théâtre Englouti rend 1 Raison quand Arlecchino renvoie une Marionnette", () => {
    const theatre = instance("le-theatre-englouti", "p1", { turnsRemaining: 4 });
    const pulcinella = instance("pulcinella-gonfle", "p1");
    const arlecchino = instance("arlecchino-des-profondeurs", "p1");
    let state = testGameState({
      players: [testPlayer("p1", { board: [theatre, pulcinella], hand: [arlecchino] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    state = ok(dispatch(state, { type: "playCard", playerId: "p1", instanceId: arlecchino.instanceId }));
    const before = p(state, "p1").reason;
    state = ok(activateReactionFor(state, "arlecchino-des-profondeurs", pulcinella.instanceId));
    expect(p(state, "p1").hand.map((c) => c.cardId)).toContain("pulcinella-gonfle");
    expect(p(state, "p1").reason).toBe(before + 1);
  });
});

describe("Bris : l'Objet brisé n'est jamais sa propre cible", () => {
  it("Le Masque Fendu ne peut pas se désigner lui-même", () => {
    const masque = instance("le-masque-fendu", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [masque], deck: [instance("murene-aveugle", "p1")] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: masque.instanceId, targetInstanceId: masque.instanceId });
    expect(result.ok).toBe(false);
  });

  it("Changement de rôle ! ne pose pas sa gratuité en se ciblant lui-même", () => {
    const role = instance("changement-de-role", "p1");
    const state = testGameState({
      players: [testPlayer("p1", { board: [role] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const result = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: role.instanceId, targetInstanceId: role.instanceId });
    expect(result.ok).toBe(false);
  });
});

describe("un attaquant détruit pendant la fenêtre d'interception ne frappe pas", () => {
  it("Pont Miné (Réaction cachée) : la coque ne bouge pas", () => {
    const pont = instance("pont-mine", "p2", { turnsRemaining: 3 });
    const brute = instance("la-chose-qui-remonte", "p1");
    let state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [brute] }), testPlayer("p2", { shipId: "le-goliath", board: [pont] })],
    });
    const anchor = p(state, "p2").anchor;
    state = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId }));
    state = ok(activateReactionFor(state, "pont-mine"));
    expect(p(state, "p2").anchor).toBe(anchor);
    expect(p(state, "p1").board.some((u) => u.instanceId === brute.instanceId)).toBe(false);
  });

  it("Harpon à Ressort qui tue l'attaquant : la coque ne bouge pas non plus", () => {
    const harpon = instance("harpon-a-ressort", "p2");
    const murene = instance("murene-aveugle", "p1");
    let state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [murene] }), testPlayer("p2", { shipId: "le-goliath", board: [harpon] })],
    });
    const anchor = p(state, "p2").anchor;
    state = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: murene.instanceId }));
    state = ok(activateReactionFor(state, "harpon-a-ressort"));
    expect(p(state, "p2").anchor).toBe(anchor);
  });
});

describe("tir de Navire : « une UNITÉ adverse attaque » ne s'ouvre pas", () => {
  function armedGoliath(defenderBoard: ReturnType<typeof instance>[]): GameState {
    const state = testGameState({
      players: [testPlayer("p1", { shipId: "le-goliath", reason: 10 }), testPlayer("p2", { board: defenderBoard })],
    });
    const armed = ok(dispatch(state, { type: "activateShipAbility", playerId: "p1" }));
    return { ...armed, phase: "combatPhase" };
  }

  it("Contre-Harpon et Pas un Pas de Plus ne sont pas proposés contre un tir", () => {
    const contre = instance("contre-harpon", "p2");
    const pas = instance("pas-un-pas-de-plus", "p2");
    const garde = instance("murene-aveugle", "p2");
    const state = ok(dispatch(armedGoliath([contre, pas, garde]), { type: "fireShipAbility", playerId: "p1" }));
    expect(pendingCandidates(state).map((c) => c.cardId)).toEqual([]);
  });

  it("Contre-Harpon reste proposé contre une vraie attaque directe", () => {
    const contre = instance("contre-harpon", "p2");
    const brute = instance("la-chose-qui-remonte", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [brute] }), testPlayer("p2", { shipId: "le-goliath", board: [contre] })],
    });
    const declared = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId }));
    expect(pendingCandidates(declared).map((c) => c.cardId)).toContain("contre-harpon");
  });

  it("Corde de Rappel ne se propose pas sur une attaque directe, seulement quand une de vos unités est ciblée", () => {
    const corde = instance("corde-de-rappel", "p2");
    const cible = instance("murene-aveugle", "p2");
    const brute = instance("la-chose-qui-remonte", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [brute] }), testPlayer("p2", { shipId: "le-goliath", board: [corde, cible] })],
    });
    const direct = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId });
    expect(direct.ok && pendingCandidates(direct.state).some((c) => c.cardId === "corde-de-rappel")).toBe(false);
    const vise = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId, defenderInstanceId: cible.instanceId }));
    expect(pendingCandidates(vise).map((c) => c.cardId)).toContain("corde-de-rappel");
  });
});

describe("toute perte de Raison passe par le bouclier (Vieux Loup de Mer)", () => {
  it("la perte après l'attaque du Harponneur est réduite à 0", () => {
    const loup = instance("vieux-loup-de-mer", "p1");
    const harponneur = instance("harponneur-du-dernier-quai", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [loup, harponneur], reason: 6 }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: harponneur.instanceId }));
    expect(p(after, "p1").reason).toBe(6);
  });

  it("la perte infligée par l'Anguille en Abysses est réduite par le bouclier du défenseur", () => {
    const loup = instance("vieux-loup-de-mer", "p2");
    const anguille = instance("anguille-des-profondeurs", "p1");
    const state = testGameState({
      phase: "combatPhase",
      environment: { ...testGameState().environment, tideState: "abysses", tideRemainingTurns: 2 },
      players: [testPlayer("p1", { board: [anguille] }), testPlayer("p2", { shipId: "le-goliath", board: [loup], reason: 6 })],
    });
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: anguille.instanceId }));
    expect(p(after, "p2").reason).toBe(6);
  });
});

describe("« détruite » n'est pas « Sabordée »", () => {
  it("Têtard-Fesse Sabordé n'invoque pas de Péon", () => {
    const tetard = instance("tetard-fesse", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [tetard] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: tetard.instanceId }));
    expect(p(after, "p1").board).toEqual([]);
  });

  it("Mécanicien aux Mains Noires ne se propose pas quand on Saborde sa propre Structure", () => {
    const meca = instance("mecanicien-aux-mains-noires", "p1");
    const s1 = instance("la-flaque-sacree", "p1", { turnsRemaining: 3 });
    const s2 = instance("le-tas-de-trucs", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [meca, s1, s2] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: s1.instanceId }));
    expect(pendingCandidates(after).some((c) => c.cardId === "mecanicien-aux-mains-noires")).toBe(false);
  });

  it("Mécanicien aux Mains Noires se propose quand une Structure est détruite par un effet", () => {
    const meca = instance("mecanicien-aux-mains-noires", "p1");
    const s1 = instance("la-flaque-sacree", "p1", { turnsRemaining: 3, pendingRemoval: "destroyed" });
    const s2 = instance("le-tas-de-trucs", "p1");
    const state = testGameState({ players: [testPlayer("p1", { board: [meca, s1, s2] }), testPlayer("p2", { shipId: "le-goliath" })] });
    const after = ok(dispatch(state, { type: "advancePhase", playerId: "p1" }));
    expect(pendingCandidates(after).some((c) => c.cardId === "mecanicien-aux-mains-noires")).toBe(true);
  });

  it("Chaîne de Fer Noir : saborder la Créature équipée ne coûte pas de Raison", () => {
    const porteur = instance("murene-aveugle", "p1");
    const chaine = instance("chaine-de-fer-noir", "p1", { attachedToInstanceId: porteur.instanceId });
    const state = testGameState({ players: [testPlayer("p1", { board: [porteur, chaine], reason: 6 }), testPlayer("p2", { shipId: "le-goliath" })] });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: porteur.instanceId }));
    expect(p(after, "p1").reason).toBe(6);
  });
});

describe("« quand il INFLIGE des dégâts directs » : seulement si la coque est touchée", () => {
  const sansPuissance = { id: "test_zero", source: "test", attack: -10, health: 0, duration: "permanent" as const };

  it("Requin Balafré à 0 Puissance ne subit pas son contrecoup", () => {
    const requin = instance("requin-balafre", "p1", { modifiers: [sansPuissance] });
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [requin] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: requin.instanceId }));
    expect(unit(after, requin.instanceId)!.damageMarked).toBe(0);
  });

  it("Requin Balafré qui touche la coque subit 1 dégât", () => {
    const requin = instance("requin-balafre", "p1");
    const state = testGameState({
      phase: "combatPhase",
      players: [testPlayer("p1", { board: [requin] }), testPlayer("p2", { shipId: "le-goliath" })],
    });
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: requin.instanceId }));
    expect(unit(after, requin.instanceId)!.damageMarked).toBe(1);
  });

  it("Anguille à 0 Puissance en Abysses ne fait pas perdre de Raison", () => {
    const anguille = instance("anguille-des-profondeurs", "p1", { modifiers: [sansPuissance] });
    const state = testGameState({
      phase: "combatPhase",
      environment: { ...testGameState().environment, tideState: "abysses", tideRemainingTurns: 2 },
      players: [testPlayer("p1", { board: [anguille] }), testPlayer("p2", { shipId: "le-goliath", reason: 6 })],
    });
    const after = ok(dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: anguille.instanceId }));
    expect(p(after, "p2").reason).toBe(6);
  });
});

describe("transition de Marée FORCÉE : mêmes déclencheurs qu'une transition naturelle", () => {
  it("la Sonde des Courants Perdus voit la Marée avancée par le Compas", () => {
    const sonde = instance("sonde-des-courants-perdus", "p1", { turnsRemaining: 4 });
    const compas = instance("compas-aux-aiguilles-noires", "p1", { turnsRemaining: 4 });
    const state = testGameState({
      environment: { ...testGameState().environment, tideState: "houle", tideRemainingTurns: 2 },
      players: [
        testPlayer("p1", { board: [sonde, compas], hand: [instance("crabe-de-fer", "p1")], deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const handBefore = p(state, "p1").hand.length;
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId }));
    expect(after.environment.tideState).toBe("tempete");
    // Pioche faite, défausse demandée au joueur.
    expect(p(after, "p1").hand.length).toBe(handBefore + 1);
    expect(after.pendingChoice?.kind).toBe("handDiscard");
  });

  it("le choc d'entrée des Abysses n'est appliqué qu'une fois", () => {
    const sonde = instance("sonde-des-courants-perdus", "p1", { turnsRemaining: 4 });
    const compas = instance("compas-aux-aiguilles-noires", "p1", { turnsRemaining: 4 });
    const state = testGameState({
      environment: { ...testGameState().environment, tideState: "tempete", tideRemainingTurns: 2 },
      players: [
        testPlayer("p1", { board: [sonde, compas], deck: [instance("murene-aveugle", "p1")] }),
        testPlayer("p2", { shipId: "le-goliath" }),
      ],
    });
    const after = ok(dispatch(state, { type: "saborder", playerId: "p1", instanceId: compas.instanceId }));
    expect(after.environment.tideState).toBe("abysses");
    const chocs = after.eventLog.filter((e) => e.type === "DAMAGE" && e.targetPlayerId === "p2");
    expect(chocs).toHaveLength(1);
    expect(p(after, "p2").reasonMax).toBe(p(state, "p2").reasonMax - 2);
  });
});
