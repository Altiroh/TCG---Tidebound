import { describe, expect, it } from "vitest";
// Effets d'arrivée facultatifs (12/10/2026) : jouer une carte accepte son effet d'arrivée, comme « Appliquer ».
import { dispatch } from "@/tests/game/arrivalDispatch";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { boardCapacity } from "@/game/rules/slotEffects";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, enFinDeTour, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 19 — Les Chairs Dévoyées. Tout passe par `dispatch` : chaque carte fait
 * ce que son texte dit, et les quatre primitives ajoutées pour le lot —
 * `onShipHealed`, `blockIncomingAttack`, `cancelCombatPhase` et les Objets
 * Chaîne instantanés (`chaineLibre`) — sont vérifiées par leur effet visible.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}
function etat(r: ReturnType<typeof dispatch>): GameState {
  ok(r);
  return r.state;
}

const joueur = (state: GameState, id = "p1") => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const stats = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id));
};
const pret = (cardId: string, owner: string) => instance(cardId, owner, { summoningSick: false });

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, overrides: Partial<GameState> = {}): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
    ...overrides,
  });
}

function jouer(state: GameState, carte: CardInstance, targetInstanceId?: string, playerId = "p1") {
  return dispatch(state, { type: "playCard", playerId, instanceId: carte.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

function attaquer(state: GameState, attaquant: CardInstance, defenderInstanceId?: string, playerId = "p1") {
  return dispatch(
    { ...state, phase: "combatPhase" },
    { type: "attack", playerId, attackerInstanceId: attaquant.instanceId, ...(defenderInstanceId ? { defenderInstanceId } : {}) }
  );
}

function finDeTour(state: GameState) {
  return dispatch(enFinDeTour(state), { type: "endTurn", playerId: state.activePlayerId });
}

describe("la coque se recoud : morts, Sangsue et Sabordages rendent de l'Ancrage", () => {
  it("Larve de Cale : à sa mort, votre Navire récupère 1 Ancrage", () => {
    const larve = pret("larve-de-cale", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const state = table({ board: [larve] }, { board: [crabe] });
    const ancrage = joueur(state).anchor;
    const r = etat(attaquer(state, larve, crabe.instanceId));
    expect(unite(r, larve.instanceId)).toBeUndefined();
    expect(joueur(r).anchor).toBe(ancrage + 1);
  });

  it("Moucheron Sanguin : Sangsue rend au Navire les dégâts infligés, et Marin infecté en grandit", () => {
    const moucheron = pret("moucheron-sanguin", "p1");
    const marin = pret("marin-infecte", "p1");
    const state = table({ board: [moucheron, marin], anchor: 10 });
    const r = etat(attaquer(state, moucheron));
    expect(joueur(r).anchor).toBe(12);
    expect(stats(r, marin.instanceId).attack).toBe(3);
    expect(stats(r, marin.instanceId).health).toBe(3);
  });

  it("Marin infecté grandit à chaque soin du Navire par un effet, et pas pour un soin du Navire adverse", () => {
    const marin = pret("marin-infecte", "p1");
    const serum = instance("serum-de-mauvaise-vie", "p1");
    const serumAdverse = instance("serum-de-mauvaise-vie", "p2");
    let state = table({ board: [marin], hand: [serum] });
    state = etat(jouer(state, serum));
    expect(stats(state, marin.instanceId).attack).toBe(3);
    // Le soin de l'ADVERSAIRE ne le nourrit pas (`factOf` : soi par défaut).
    state = { ...state, activePlayerId: "p2", players: state.players.map((p) => (p.id === "p2" ? { ...p, hand: [serumAdverse] } : p)) as GameState["players"] };
    state = etat(jouer(state, serumAdverse, undefined, "p2"));
    expect(stats(state, marin.instanceId).attack).toBe(3);
  });

  it("Parasite Écarlate : Sangsue, et à sa mort 1 Ancrage", () => {
    const parasite = pret("parasite-ecarlate", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const state = table({ board: [parasite], anchor: 10 }, { board: [crabe] });
    const r = etat(attaquer(state, parasite, crabe.instanceId));
    // 2 dégâts infligés au Crabe (Sangsue +2), puis la mort (+1).
    expect(joueur(r).anchor).toBe(13);
  });

  it("Nécrophage des Fonds : une AUTRE Créature alliée meurt, votre Navire récupère 1 Ancrage", () => {
    const necro = pret("necrophage-des-fonds", "p1");
    const murene = pret("murene-aveugle", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const state = table({ board: [necro, murene], anchor: 10 }, { board: [crabe] });
    const r = etat(attaquer(state, murene, crabe.instanceId));
    expect(unite(r, murene.instanceId)).toBeUndefined();
    expect(joueur(r).anchor).toBe(11);
  });

  it("Pigeon Délirant : Sabordé, il rend 3 Ancrage", () => {
    const pigeon = instance("pigeon-delirant", "p1");
    const state = table({ board: [pigeon], anchor: 10 });
    const r = etat(dispatch(state, { type: "saborder", playerId: "p1", instanceId: pigeon.instanceId }));
    expect(unite(r, pigeon.instanceId)).toBeUndefined();
    expect(joueur(r).anchor).toBe(13);
  });

  it("Échec Numéro Treize : en fin de tour, il subit 1 dégât et vous récupérez 1 Ancrage ; l'Abyssale en rend 2", () => {
    const echec = instance("echec-numero-treize", "p1");
    const abyssal = instance("echec-numero-treize-abyssal", "p1");
    const state = table({ board: [echec, abyssal], anchor: 10 });
    const r = etat(finDeTour(state));
    expect(unite(r, echec.instanceId)!.damageMarked).toBe(1);
    expect(unite(r, abyssal.instanceId)!.damageMarked).toBe(1);
    expect(joueur(r).anchor).toBe(13);
  });

  it("Cuve de Régénération : au début de votre tour, votre Navire récupère 1 Ancrage", () => {
    const cuve = instance("cuve-de-regeneration", "p1");
    const state = table({ board: [cuve], anchor: 10 });
    // p1 finit, p2 finit : p1 recommence et la Cuve agit.
    let r = etat(finDeTour(state));
    r = etat(finDeTour(r));
    expect(r.activePlayerId).toBe("p1");
    expect(joueur(r).anchor).toBe(11);
  });

  it("Crabe Transfuseur : une fois par tour, 1 dégât à une Créature alliée et 2 Ancrage", () => {
    const crabe = instance("crabe-transfuseur", "p1");
    const couveuse = instance("couveuse-difforme", "p1");
    const state = table({ board: [crabe, couveuse], anchor: 10 });
    const r = etat(dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: crabe.instanceId, targetInstanceId: couveuse.instanceId }));
    expect(unite(r, couveuse.instanceId)!.damageMarked).toBe(1);
    expect(joueur(r).anchor).toBe(12);
    const encore = dispatch(r, { type: "activateAbility", playerId: "p1", sourceInstanceId: crabe.instanceId, targetInstanceId: couveuse.instanceId });
    expect(encore.ok).toBe(false);
  });

  it("Pluie de Chair : 2 dégâts à toutes les Créatures (pas aux Structures), et 2 Ancrage", () => {
    const pluie = instance("pluie-de-chair", "p1");
    const couveuse = instance("couveuse-difforme", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const cuve = instance("cuve-de-regeneration", "p2");
    const state = table({ hand: [pluie], board: [couveuse], anchor: 10 }, { board: [crabe, cuve] });
    const r = etat(jouer(state, pluie));
    expect(unite(r, couveuse.instanceId)!.damageMarked).toBe(2);
    expect(unite(r, cuve.instanceId)!.damageMarked).toBe(0);
    expect(joueur(r).anchor).toBe(12);
    expect(joueur(r).graveyard.some((c) => c.instanceId === pluie.instanceId)).toBe(true);
  });
});

describe("la couvée et la chair qu'on sacrifie", () => {
  it("Couveuse Difforme : à la fin de votre tour, une Larve 1/1 arrive", () => {
    const couveuse = instance("couveuse-difforme", "p1");
    const r = etat(finDeTour(table({ board: [couveuse] })));
    const larves = joueur(r).board.filter((u) => u.cardId === "larve");
    expect(larves).toHaveLength(1);
  });

  it("Essaim Vorace : à son arrivée, deux Larves 1/1", () => {
    const essaim = instance("essaim-vorace", "p1");
    const r = etat(jouer(table({ hand: [essaim] }), essaim));
    expect(joueur(r).board.filter((u) => u.cardId === "larve")).toHaveLength(2);
  });

  it("Aberration Vorace : Sabordez une Créature alliée, elle gagne +2/+2 conservés", () => {
    const aberration = instance("aberration-vorace", "p1");
    const murene = instance("murene-aveugle", "p1");
    const r = etat(jouer(table({ hand: [aberration], board: [murene] }), aberration, murene.instanceId));
    expect(unite(r, murene.instanceId)).toBeUndefined();
    expect(stats(r, aberration.instanceId).attack).toBe(6);
    expect(stats(r, aberration.instanceId).health).toBe(5);
  });

  it("Petit Chirurgien : Sabordez une Créature alliée, piochez 2", () => {
    const chirurgien = instance("petit-chirurgien", "p1");
    const murene = instance("murene-aveugle", "p1");
    const state = table({ hand: [chirurgien], board: [murene] });
    const r = etat(jouer(state, chirurgien, murene.instanceId));
    expect(unite(r, murene.instanceId)).toBeUndefined();
    // La main a perdu le Chirurgien et gagné 2 cartes.
    expect(joueur(r).hand).toHaveLength(2);
  });

  it("Reine des Charognes : une autre unité alliée meurt, le joueur met +1 / +1 sur une autre unité", () => {
    const reine = pret("reine-des-charognes", "p1");
    const murene = pret("murene-aveugle", "p1");
    const couveuse = instance("couveuse-difforme", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    let state = etat(attaquer(table({ board: [reine, murene, couveuse] }, { board: [crabe] }), murene, crabe.instanceId));
    expect(pendingCandidates(state).some((c) => c.cardId === "reine-des-charognes")).toBe(true);
    state = etat(activateReactionFor(state, "reine-des-charognes", couveuse.instanceId));
    expect(stats(state, couveuse.instanceId).attack).toBe(2);
    expect(stats(state, couveuse.instanceId).health).toBe(5);
  });

  it("Masse Tumorale : une Créature alliée meurt, +1 Puissance conservé", () => {
    const masse = pret("masse-tumorale", "p1");
    const murene = pret("murene-aveugle", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const r = etat(attaquer(table({ board: [masse, murene] }, { board: [crabe] }), murene, crabe.instanceId));
    expect(stats(r, masse.instanceId).attack).toBe(3);
    expect(stats(r, masse.instanceId).health).toBe(6);
  });

  it("Le Parfait Raté : à son arrivée, votre Navire perd 3 Ancrage", () => {
    const rate = instance("le-parfait-rate", "p1");
    const r = etat(jouer(table({ hand: [rate], anchor: 10 }), rate));
    expect(joueur(r).anchor).toBe(7);
  });

  it("Homoncule Recousu : récupère une Créature de coût 1 du Cimetière", () => {
    const homoncule = instance("homoncule-recousu", "p1");
    const larve = instance("larve-de-cale", "p1");
    const chere = instance("couveuse-difforme", "p1");
    const state = table({ hand: [homoncule], graveyard: [larve, chere] });
    const r = etat(dispatch(state, { type: "playCard", playerId: "p1", instanceId: homoncule.instanceId, chosenGraveyardInstanceId: larve.instanceId }));
    expect(joueur(r).hand.some((c) => c.instanceId === larve.instanceId)).toBe(true);
    expect(joueur(r).graveyard.some((c) => c.instanceId === chere.instanceId)).toBe(true);
  });

  it("Expérience Sans Yeux : à sa mort, piochez 1", () => {
    const experience = pret("experience-sans-yeux", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const r = etat(attaquer(table({ board: [experience] }, { board: [crabe] }), experience, crabe.instanceId));
    expect(joueur(r).hand).toHaveLength(1);
  });

  it("Poisson-Bombe : à sa mort, le joueur inflige 2 dégâts à une Créature adverse", () => {
    const bombe = pret("poisson-bombe", "p1");
    const crabe = instance("crabe-de-fer", "p2");
    const cible = instance("couveuse-difforme", "p2");
    let state = etat(attaquer(table({ board: [bombe] }, { board: [crabe, cible] }), bombe, crabe.instanceId));
    state = etat(activateReactionFor(state, "poisson-bombe", cible.instanceId));
    expect(unite(state, cible.instanceId)!.damageMarked).toBe(2);
  });

  it("Scie de Dissection : le porteur gagne +1 Puissance et Sangsue", () => {
    const scie = instance("scie-de-dissection", "p1");
    const murene = pret("murene-aveugle", "p1");
    const depart = table({ hand: [scie], board: [murene], anchor: 10 });
    const nue = stats(depart, murene.instanceId).attack;
    let state = etat(jouer(depart, scie, murene.instanceId));
    const puissance = stats(state, murene.instanceId).attack;
    expect(puissance).toBe(nue + 1);
    state = etat(attaquer(state, murene));
    expect(joueur(state).anchor).toBe(10 + puissance);
  });
});

describe("Objets Chaîne : bloquer, annuler, et les instantanés", () => {
  it("Gâteau garnis : une unité alliée bloque l'attaque directe, la Garde voisine ne s'y oppose pas, et elle gagne +1/+1", () => {
    const gateau = instance("gateau-garnis", "p2");
    const brute = pret("le-parfait-rate", "p1"); // 6/6
    const bloqueur = instance("couveuse-difforme", "p2"); // 1/4
    const garde = instance("le-gardien-des-jouets", "p2"); // Garde
    let state = table({ board: [brute] }, { hand: [gateau], board: [bloqueur, garde], anchor: 20 });
    // Garde adverse : l'attaque doit la viser. On attaque donc le Gardien, et la Couveuse bloque à sa place.
    state = etat(attaquer(state, brute, garde.instanceId));
    expect(pendingCandidates(state).some((c) => c.cardId === "gateau-garnis")).toBe(true);
    state = etat(activateReactionFor(state, "gateau-garnis", bloqueur.instanceId));
    expect(unite(state, bloqueur.instanceId)).toBeUndefined(); // 6 dégâts sur 5 Résistance
    expect(unite(state, garde.instanceId)!.damageMarked).toBe(0);
    expect(unite(state, brute.instanceId)!.damageMarked).toBe(2); // la riposte du bloqueur à 2 Puissance
    expect(joueur(state, "p2").anchor).toBe(20);
  });

  it("Stop : l'attaque adverse n'a pas lieu, et la Phase de combat se ferme", () => {
    const stop = instance("stop", "p2");
    const brute = pret("le-parfait-rate", "p1");
    const autre = pret("murene-aveugle", "p1");
    let state = table({ board: [brute, autre] }, { hand: [stop], anchor: 20 });
    state = etat(attaquer(state, brute));
    state = etat(activateReactionFor(state, "stop"));
    expect(joueur(state, "p2").anchor).toBe(20);
    expect(state.phase).toBe("mainPhase2");
    expect(state.pendingAttack).toBeUndefined();
    expect(joueur(state, "p2").graveyard.some((c) => c.instanceId === stop.instanceId)).toBe(true);
    // Plus d'attaque possible ce tour.
    const encore = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: autre.instanceId });
    expect(encore.ok).toBe(false);
  });

  it("Sérum de Mauvaise Vie : se joue en Phase principale, même plateau plein, et rend 3 Ancrage", () => {
    const serum = instance("serum-de-mauvaise-vie", "p1");
    const plein = Array.from({ length: 8 }, () => instance("murene-aveugle", "p1"));
    const state = table({ hand: [serum], board: plein, anchor: 10 });
    const r = etat(jouer(state, serum));
    expect(joueur(r).anchor).toBe(13);
    expect(joueur(r).graveyard.some((c) => c.instanceId === serum.instanceId)).toBe(true);
  });

  it("Sérum de Mauvaise Vie : se joue aussi en réaction, quand une unité adverse attaque", () => {
    const serum = instance("serum-de-mauvaise-vie", "p2");
    const brute = pret("murene-aveugle", "p1");
    let state = table({ board: [brute] }, { hand: [serum], anchor: 10 });
    const coup = stats(state, brute.instanceId).attack;
    state = etat(attaquer(state, brute));
    state = etat(activateReactionFor(state, "serum-de-mauvaise-vie"));
    // +3, puis la Murène frappe la coque.
    expect(joueur(state, "p2").anchor).toBe(10 + 3 - coup);
    expect(joueur(state, "p2").graveyard.some((c) => c.instanceId === serum.instanceId)).toBe(true);
  });

  it("Greffe Instable : +3 Puissance ce tour et 1 dégât à une Créature alliée", () => {
    const greffe = instance("greffe-instable", "p1");
    const couveuse = instance("couveuse-difforme", "p1");
    const r = etat(jouer(table({ hand: [greffe], board: [couveuse] }), greffe, couveuse.instanceId));
    expect(stats(r, couveuse.instanceId).attack).toBe(4);
    expect(unite(r, couveuse.instanceId)!.damageMarked).toBe(1);
  });

  it("Zone infecté : bloque un emplacement adverse pendant 2 tours de table", () => {
    const zone = instance("zone-infecte", "p1");
    const state = table({ hand: [zone] });
    const avant = boardCapacity(state, joueur(state, "p2"));
    const r = etat(jouer(state, zone));
    expect(boardCapacity(r, joueur(r, "p2"))).toBe(avant - 1);
  });

  it("un Objet Chaîne de réaction (sans `chaineLibre`) reste refusé en Phase principale", () => {
    const stop = instance("stop", "p1");
    expect(jouer(table({ hand: [stop] }), stop).ok).toBe(false);
  });
});
