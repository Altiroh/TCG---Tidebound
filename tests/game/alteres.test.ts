import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import { eveilsThisTurn } from "@/game/rules/eveil";
import type { CardInstance } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 16 — LES ALTÉRÉS : l'Éveil.
 *
 * Tout passe par `dispatch`, comme en partie. Ce qui est vérifié : l'Éveil
 * se résout à l'arrivée et à chaque « déclenchez l'Éveil », au MILIEU de la
 * séquence qui le demande ; son rang dans le tour est compté ; toute
 * désignation est une question au joueur, qui peut refuser — et plusieurs
 * questions d'une même chaîne attendent leur tour au lieu de s'écraser.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const puissance = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id)).attack;
};
const main = (state: GameState, id = "p1") => joueur(state, id).hand.length;
const eveils = (state: GameState, instanceId: string) => eveilsThisTurn(unite(state, instanceId)!, state.turnNumber);

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}): GameState {
  const pioche = (owner: string) => Array.from({ length: 10 }, () => instance("marin-des-jetees", owner));
  return testGameState({
    turnNumber: 1,
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
  });
}

function jouer(state: GameState, carte: CardInstance, targetInstanceId?: string) {
  return dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

/** Répond à la question « choisissez jusqu'à N unités » en cours. */
function designer(state: GameState, ...instanceIds: string[]) {
  const choice = state.pendingChoice;
  if (choice?.kind !== "pickUnits") throw new Error(`Aucune désignation en attente (question : ${choice?.kind ?? "aucune"}).`);
  return dispatch(state, { type: "resolveChoice", playerId: choice.playerId, choice: { pickInstanceIds: instanceIds } });
}

describe("l'Éveil se résout à l'arrivée, puis à chaque déclenchement", () => {
  it("L'Entendant pioche 1 carte en arrivant : c'est son premier Éveil du tour", () => {
    const entendant = instance("lentendant", "p1");
    const r = jouer(table({ hand: [entendant] }), entendant);
    ok(r);
    expect(main(r.state)).toBe(1);
    expect(eveils(r.state, entendant.instanceId)).toBe(1);
    expect(r.events.some((e) => e.type === "EVEIL" && e.instanceId === entendant.instanceId && e.count === 1)).toBe(true);
  });

  it("à son deuxième Éveil du tour, il pioche 2 cartes à la place, et Altération Forcée lui donne +1 Puissance", () => {
    const entendant = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const forcee = instance("alteration-forcee", "p1");
    const r = jouer(table({ board: [entendant], hand: [forcee] }), forcee, entendant.instanceId);
    ok(r);
    expect(main(r.state)).toBe(2);
    expect(eveils(r.state, entendant.instanceId)).toBe(2);
    expect(puissance(r.state, entendant.instanceId)).toBe(3);
  });

  it("le compteur repart à zéro au tour suivant : un Éveil de la veille ne compte pas", () => {
    const entendant = instance("lentendant", "p1", { eveils: { turn: 0, count: 3 } });
    const forcee = instance("alteration-forcee", "p1");
    const r = jouer(table({ board: [entendant], hand: [forcee] }), forcee, entendant.instanceId);
    ok(r);
    expect(eveils(r.state, entendant.instanceId)).toBe(1);
    expect(main(r.state)).toBe(1);
  });

  it("Le Dédoublé invoque un Péon Altéré, puis deux à son deuxième Éveil", () => {
    const dedouble = instance("le-dedouble", "p1");
    const forcee = instance("alteration-forcee", "p1");
    const r1 = jouer(table({ hand: [dedouble, forcee] }), dedouble);
    ok(r1);
    const peons = (s: GameState) => joueur(s, "p1").board.filter((u) => u.cardId === "peon-altere").length;
    expect(peons(r1.state)).toBe(1);
    const r2 = jouer(r1.state, forcee, dedouble.instanceId);
    ok(r2);
    expect(peons(r2.state)).toBe(3);
  });
});

describe("Surcharge : deux Éveils PUIS le dégât", () => {
  it("Le Recousu à 1 Résistance se soigne à son premier Éveil, ouvre sa propagation, puis subit le dégât une fois soigné", () => {
    const recousu = instance("le-recousu", "p1", { damageMarked: 4 });
    const entendant = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const surcharge = instance("surcharge", "p1");
    const r = jouer(table({ board: [recousu, entendant], hand: [surcharge] }), surcharge, recousu.instanceId);
    ok(r);
    // Les deux Éveils sont passés avant le dégât : sinon 4 + 1 = 5 l'aurait emporté.
    expect(eveils(r.state, recousu.instanceId)).toBe(2);
    expect(unite(r.state, recousu.instanceId)!.damageMarked).toBe(1);
    // Le premier Éveil (1 Résistance restante) a proposé de propager ; le second, soigné, non.
    expect(r.state.pendingChoice?.kind).toBe("pickUnits");
    expect(r.state.pendingChoiceQueue ?? []).toHaveLength(0);
    const suite = designer(r.state, entendant.instanceId);
    ok(suite);
    expect(eveils(suite.state, entendant.instanceId)).toBe(2);
    expect(main(suite.state)).toBe(2);
  });
});

describe("chaque désignation est une question, refusable", () => {
  it("L'Instable : une unité adverse détruite propage l'Éveil à un autre Altéré", () => {
    const instable = instance("linstable", "p1");
    const entendant = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const victime = instance("le-buveur", "p2", { damageMarked: 1 });
    const r = jouer(table({ board: [entendant], hand: [instable] }, { board: [victime] }), instable);
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("pickUnits");
    const coup = designer(r.state, victime.instanceId);
    ok(coup);
    expect(unite(coup.state, victime.instanceId)).toBeUndefined();
    // La propagation : un AUTRE Altéré, jamais L'Instable lui-même.
    const choix = coup.state.pendingChoice;
    expect(choix?.kind === "pickUnits" && choix.among).toEqual([entendant.instanceId]);
    const fin = designer(coup.state, entendant.instanceId);
    ok(fin);
    expect(main(fin.state)).toBe(2);
  });

  it("L'Instable : une unité qui survit ne propage rien, et le joueur peut refuser de frapper", () => {
    const instable = instance("linstable", "p1");
    const entendant = instance("lentendant", "p1");
    const costaud = instance("le-recousu", "p2");
    const r = jouer(table({ board: [entendant], hand: [instable] }, { board: [costaud] }), instable);
    ok(r);
    const coup = designer(r.state, costaud.instanceId);
    ok(coup);
    expect(unite(coup.state, costaud.instanceId)!.damageMarked).toBe(1);
    expect(coup.state.pendingChoice).toBeUndefined();

    const refus = designer(r.state);
    ok(refus);
    expect(unite(refus.state, costaud.instanceId)!.damageMarked).toBe(0);
  });

  it("Le Fendu désigne l'unité adverse, puis l'Altéré : deux questions, l'une après l'autre", () => {
    const fendu = instance("le-fendu", "p1");
    const entendant = instance("lentendant", "p1");
    const adverse = instance("le-recousu", "p2");
    const r = jouer(table({ board: [entendant], hand: [fendu] }, { board: [adverse] }), fendu);
    ok(r);
    const q1 = r.state.pendingChoice;
    expect(q1?.kind === "pickUnits" && q1.among).toEqual([adverse.instanceId]);
    const r2 = designer(r.state, adverse.instanceId);
    ok(r2);
    expect(unite(r2.state, adverse.instanceId)!.damageMarked).toBe(1);
    const q2 = r2.state.pendingChoice;
    expect(q2?.kind === "pickUnits" && q2.among).toEqual([entendant.instanceId]);
    const r3 = designer(r2.state, entendant.instanceId);
    ok(r3);
    expect(unite(r3.state, entendant.instanceId)!.damageMarked).toBe(1);
    expect(eveils(r3.state, entendant.instanceId)).toBe(1);
    expect(main(r3.state)).toBe(1);
  });

  it("Le Buveur vole 1 Puissance ; une unité vidée fait piocher", () => {
    const buveur = instance("le-buveur", "p1");
    const faible = instance("peon-cra-poiscail", "p2");
    const r = jouer(table({ hand: [buveur] }, { board: [faible] }), buveur);
    ok(r);
    const vol = designer(r.state, faible.instanceId);
    ok(vol);
    expect(puissance(vol.state, faible.instanceId)).toBe(0);
    expect(puissance(vol.state, buveur.instanceId)).toBe(4);
    expect(main(vol.state)).toBe(1);
  });
});

describe("répéter, propager", () => {
  it("Le Copieur éveille deux fois un Altéré qui s'était déjà Éveillé, une fois sinon", () => {
    const deja = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const copieur = instance("le-copieur", "p1");
    const r = jouer(table({ board: [deja], hand: [copieur] }), copieur);
    ok(r);
    const fin = designer(r.state, deja.instanceId);
    ok(fin);
    // Rangs 2 puis 3 : 2 cartes, puis 1.
    expect(eveils(fin.state, deja.instanceId)).toBe(3);
    expect(main(fin.state)).toBe(3);

    const neuf = instance("lentendant", "p1");
    const copieur2 = instance("le-copieur", "p1");
    const r2 = jouer(table({ board: [neuf], hand: [copieur2] }), copieur2);
    ok(r2);
    const fin2 = designer(r2.state, neuf.instanceId);
    ok(fin2);
    expect(eveils(fin2.state, neuf.instanceId)).toBe(1);
    expect(main(fin2.state)).toBe(1);
  });

  it("La Conscience Commune répète le premier Éveil du tour, pas les suivants", () => {
    const conscience = instance("la-conscience-commune", "p1");
    const entendant = instance("lentendant", "p1");
    const second = instance("lentendant", "p1");
    const r = jouer(table({ board: [conscience], hand: [entendant, second] }), entendant);
    ok(r);
    // Arrivée (rang 1 : 1 carte) puis répétition (rang 2 : 2 cartes) ; la main avait déjà `second`.
    expect(eveils(r.state, entendant.instanceId)).toBe(2);
    expect(main(r.state)).toBe(1 + 3);
    const r2 = jouer(r.state, second);
    ok(r2);
    expect(eveils(r2.state, second.instanceId)).toBe(1);
  });

  it("Le Meneur : le premier Éveil d'un autre Altéré en appelle un autre, DIFFÉRENT, une fois par tour", () => {
    const meneur = instance("le-meneur", "p1");
    const entendant = instance("lentendant", "p1");
    const autre = instance("lentendant", "p1");
    const forcee1 = instance("alteration-forcee", "p1");
    const forcee2 = instance("alteration-forcee", "p1");
    const r = jouer(table({ board: [meneur, entendant, autre], hand: [forcee1, forcee2] }), forcee1, entendant.instanceId);
    ok(r);
    const q = r.state.pendingChoice;
    expect(q?.kind === "pickUnits" && q.among).toEqual([autre.instanceId]);
    const r2 = designer(r.state, autre.instanceId);
    ok(r2);
    expect(eveils(r2.state, autre.instanceId)).toBe(1);
    // Deuxième Éveil du tour d'un autre Altéré : Le Meneur a déjà servi.
    const r3 = jouer(r2.state, forcee2, entendant.instanceId);
    ok(r3);
    expect(r3.state.pendingChoice).toBeUndefined();
  });

  it("Le Diable en Personne coûte 1 Ancrage et ne rejoue que l'Éveil d'un Altéré déjà Éveillé", () => {
    const diable = instance("le-diable-en-personne", "p1");
    const deja = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const neuf = instance("lentendant", "p1");
    const state = table({ board: [deja, neuf], hand: [diable] });
    const avant = joueur(state, "p1").anchor;
    const r = jouer(state, diable);
    ok(r);
    expect(joueur(r.state, "p1").anchor).toBe(avant - 1);
    const q = r.state.pendingChoice;
    expect(q?.kind === "pickUnits" && q.among).toEqual([deja.instanceId]);
  });

  it("L'Anomalie Première éveille tous vos autres Altérés, puis en éveille un une seconde fois", () => {
    const anomalie = instance("lanomalie-premiere", "p1");
    const a = instance("lentendant", "p1");
    const b = instance("le-dedouble", "p1");
    const r = jouer(table({ board: [a, b], hand: [anomalie] }), anomalie);
    ok(r);
    expect(eveils(r.state, a.instanceId)).toBe(1);
    expect(eveils(r.state, b.instanceId)).toBe(1);
    const q = r.state.pendingChoice;
    expect(q?.kind === "pickUnits" && [...q.among].sort()).toEqual([a.instanceId, b.instanceId].sort());
    const fin = designer(r.state, a.instanceId);
    ok(fin);
    expect(eveils(fin.state, a.instanceId)).toBe(2);
  });

  it("La Chute de l'Ange ne propage qu'à 2 Résistance restante ou moins", () => {
    const intacte = instance("la-chute-de-lange", "p1");
    const forcee = instance("alteration-forcee", "p1");
    const entendant = instance("lentendant", "p1");
    const r = jouer(table({ board: [intacte, entendant], hand: [forcee] }), forcee, intacte.instanceId);
    ok(r);
    // 4 − 1 = 3 : seule l'unité adverse se demanderait — il n'y en a pas.
    expect(r.state.pendingChoice).toBeUndefined();
    expect(unite(r.state, intacte.instanceId)!.damageMarked).toBe(1);

    const blessee = instance("la-chute-de-lange", "p1", { damageMarked: 1 });
    const forcee2 = instance("alteration-forcee", "p1");
    const r2 = jouer(table({ board: [blessee, entendant], hand: [forcee2] }), forcee2, blessee.instanceId);
    ok(r2);
    const q = r2.state.pendingChoice;
    expect(q?.kind === "pickUnits" && q.among).toEqual([entendant.instanceId]);
  });
});

describe("les variantes Abyssales", () => {
  it("La Chute de l'Ange — ABYSSALE inflige 3 dégâts et propage dès 3 Résistance restante", () => {
    const chute = instance("la-chute-de-lange-abyssal", "p1");
    const forcee = instance("alteration-forcee", "p1");
    const entendant = instance("lentendant", "p1");
    const cible = instance("le-recousu", "p2");
    // 5 − 1 = 4 : pas encore assez entamée pour propager.
    const r = jouer(table({ board: [chute, entendant], hand: [forcee] }, { board: [cible] }), forcee, chute.instanceId);
    ok(r);
    const coup = designer(r.state, cible.instanceId);
    ok(coup);
    expect(unite(coup.state, cible.instanceId)!.damageMarked).toBe(3);
    expect(coup.state.pendingChoice).toBeUndefined();

    const entamee = instance("la-chute-de-lange-abyssal", "p1", { damageMarked: 1 });
    const forcee2 = instance("alteration-forcee", "p1");
    const r2 = jouer(table({ board: [entamee, entendant], hand: [forcee2] }), forcee2, entamee.instanceId);
    ok(r2);
    const q = r2.state.pendingChoice;
    expect(q?.kind === "pickUnits" && q.among).toEqual([entendant.instanceId]);
  });

  it("Le Diable en Personne — ABYSSALE rejoue l'Éveil de jusqu'à deux Altérés déjà Éveillés", () => {
    const diable = instance("le-diable-en-personne-abyssal", "p1");
    const a = instance("lentendant", "p1", { eveils: { turn: 1, count: 1 } });
    const b = instance("le-dedouble", "p1", { eveils: { turn: 1, count: 1 } });
    const neuf = instance("lentendant", "p1");
    const r = jouer(table({ board: [a, b, neuf], hand: [diable] }), diable);
    ok(r);
    const q = r.state.pendingChoice;
    expect(q?.kind === "pickUnits" && q.pick).toBe(2);
    expect(q?.kind === "pickUnits" && [...q.among].sort()).toEqual([a.instanceId, b.instanceId].sort());
    const fin = designer(r.state, a.instanceId, b.instanceId);
    ok(fin);
    expect(eveils(fin.state, a.instanceId)).toBe(2);
    expect(eveils(fin.state, b.instanceId)).toBe(2);
  });
});

describe("Le Féral et L'Attire-Fer", () => {
  it("Le Féral : +2 Puissance à chaque Éveil, Pied marin au deuxième, 2 dégâts au Navire adverse au troisième", () => {
    const feral = instance("le-feral", "p1", { summoningSick: true, eveils: { turn: 1, count: 1 } });
    const forcee1 = instance("alteration-forcee", "p1");
    const forcee2 = instance("alteration-forcee", "p1");
    const state = table({ board: [feral], hand: [forcee1, forcee2] });
    const ancrage = joueur(state, "p2").anchor;
    const r = jouer(state, forcee1, feral.instanceId);
    ok(r);
    expect(hasEffectiveKeyword(r.state, joueur(r.state, "p1"), unite(r.state, feral.instanceId)!, "pied-marin")).toBe(true);
    expect(joueur(r.state, "p2").anchor).toBe(ancrage);
    const r2 = jouer(r.state, forcee2, feral.instanceId);
    ok(r2);
    expect(joueur(r2.state, "p2").anchor).toBe(ancrage - 2);
  });

  it("L'Attire-Fer renvoie un Objet adverse à son propriétaire, pioche, puis éveille un Altéré", () => {
    const attire = instance("lattire-fer", "p1");
    const objet = instance("eclat-de-bouteille", "p2");
    const entendant = instance("lentendant", "p1");
    const r = jouer(table({ board: [entendant], hand: [attire] }, { board: [objet] }), attire);
    ok(r);
    const renvoi = designer(r.state, objet.instanceId);
    ok(renvoi);
    expect(joueur(renvoi.state, "p2").hand.some((c) => c.cardId === "eclat-de-bouteille")).toBe(true);
    expect(main(renvoi.state)).toBe(1);
    // « un Altéré » sans « autre » : L'Attire-Fer peut se désigner lui-même.
    const q = renvoi.state.pendingChoice;
    expect(q?.kind === "pickUnits" && [...q.among].sort()).toEqual([attire.instanceId, entendant.instanceId].sort());
  });
});

describe("Cimetière et pioche", () => {
  it("La Revenante repêche un Altéré coûtant 3 ou moins, moins cher s'il coûte 2 ou moins", () => {
    const revenante = instance("la-revenante", "p1");
    const petit = instance("linstable", "p1");
    const moyen = instance("le-recousu", "p1");
    const autre = instance("marin-des-jetees", "p1");
    const r = jouer(table({ hand: [revenante], graveyard: [petit, moyen, autre] }), revenante);
    ok(r);
    const q = r.state.pendingChoice;
    expect(q?.kind).toBe("deckLook");
    expect(q?.kind === "deckLook" && q.zone).toBe("graveyard");
    expect(q?.kind === "deckLook" && q.revealed.map((c) => c.instanceId).sort()).toEqual([petit.instanceId, moyen.instanceId].sort());
    const prise = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [petit.instanceId] } });
    ok(prise);
    const p1 = joueur(prise.state, "p1");
    expect(p1.hand.some((c) => c.instanceId === petit.instanceId)).toBe(true);
    expect(p1.graveyard.map((c) => c.instanceId).sort()).toEqual([moyen.instanceId, autre.instanceId].sort());
    expect(p1.costDiscounts?.some((d) => d.amount === 1 && d.onlyInstanceIds?.includes(petit.instanceId))).toBe(true);
  });

  it("Ils Étaient Déjà Là : une carte Altéré coûtant 2 ou moins, les autres au-dessus dans l'ordre choisi", () => {
    const sort = instance("ils-etaient-deja-la", "p1");
    const top = [
      instance("marin-des-jetees", "p1"),
      instance("le-recousu", "p1"),
      instance("propagation", "p1"),
      instance("marin-des-jetees", "p1"),
      instance("linstable", "p1"),
    ];
    const fond = instance("marin-des-jetees", "p1");
    const r = jouer(table({ hand: [sort], deck: [...top, fond] }), sort);
    ok(r);
    const q = r.state.pendingChoice;
    expect(q?.kind === "deckLook" && q.restTo).toBe("deckTopChosenOrder");
    // Le Recousu coûte 3 : pas prenable.
    const refuse = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [top[1]!.instanceId] } });
    expect(refuse.ok).toBe(false);
    const ordre = [top[4]!, top[0]!, top[1]!, top[3]!].map((c) => c.instanceId);
    const prise = dispatch(r.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { takeInstanceIds: [top[2]!.instanceId], restOrder: ordre },
    });
    ok(prise);
    const p1 = joueur(prise.state, "p1");
    expect(p1.hand.some((c) => c.instanceId === top[2]!.instanceId)).toBe(true);
    expect(p1.deck.map((c) => c.instanceId)).toEqual([...ordre, fond.instanceId]);
  });
});

describe("Propagation : une réaction jouée depuis la main", () => {
  it("se propose après l'Éveil d'un Altéré, se paie, part au Cimetière et éveille un AUTRE Altéré", () => {
    const propagation = instance("propagation", "p1");
    const entendant = instance("lentendant", "p1");
    const autre = instance("lentendant", "p1");
    const r = jouer(table({ board: [autre], hand: [entendant, propagation] }), entendant);
    ok(r);
    expect(pendingCandidates(r.state).some((c) => c.cardId === "propagation" && c.fromHand)).toBe(true);
    const raison = joueur(r.state, "p1").reason;
    const act = activateReactionFor(r.state, "propagation", autre.instanceId);
    ok(act);
    const p1 = joueur(act.state, "p1");
    expect(p1.reason).toBe(raison - 1);
    expect(p1.graveyard.some((c) => c.instanceId === propagation.instanceId)).toBe(true);
    expect(eveils(act.state, autre.instanceId)).toBe(1);
  });

  it("ne vise pas l'Altéré qui vient de s'Éveiller", () => {
    const propagation = instance("propagation", "p1");
    const entendant = instance("lentendant", "p1");
    const autre = instance("lentendant", "p1");
    const r = jouer(table({ board: [autre], hand: [entendant, propagation] }), entendant);
    ok(r);
    const tente = activateReactionFor(r.state, "propagation", entendant.instanceId);
    expect(tente.ok).toBe(false);
  });

  it("ne se joue pas en phase principale", () => {
    const propagation = instance("propagation", "p1");
    const r = jouer(table({ board: [instance("lentendant", "p1")], hand: [propagation] }), propagation);
    expect(r.ok).toBe(false);
  });
});

describe("L'Intangible : inciblable par l'adversaire jusqu'à votre prochain tour", () => {
  const inciblable = { id: "mod_test", source: "lintangible", attack: 0, health: 0, duration: "untilYourNextTurn" as const, keywords: ["inciblable"] };

  it("son Éveil la rend inciblable", () => {
    const intangible = instance("lintangible", "p1");
    const r = jouer(table({ hand: [intangible] }), intangible);
    ok(r);
    expect(unite(r.state, intangible.instanceId)!.modifiers.some((m) => m.keywords?.includes("inciblable"))).toBe(true);
  });

  it("l'adversaire ne peut pas la désigner ; il se rabat sur une autre unité, et vous piochez 1 carte", () => {
    const intangible = instance("lintangible", "p1", { modifiers: [inciblable] });
    const autre = instance("lentendant", "p1");
    const renvoi = instance("par-dessus-bord", "p2");
    const renvoi2 = instance("par-dessus-bord", "p2");
    const state = testGameState({
      ...table({ board: [intangible, autre] }, { hand: [renvoi, renvoi2] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const vise = dispatch(state, { type: "playCard", playerId: "p2", instanceId: renvoi.instanceId, targetInstanceId: intangible.instanceId });
    expect(vise.ok).toBe(false);
    const rabat = dispatch(state, { type: "playCard", playerId: "p2", instanceId: renvoi2.instanceId, targetInstanceId: autre.instanceId });
    ok(rabat);
    expect(unite(rabat.state, autre.instanceId)).toBeUndefined();
    expect(main(rabat.state, "p1")).toBe(1 + 1);
  });

  it("ses propres effets la désignent toujours", () => {
    const intangible = instance("lintangible", "p1", { modifiers: [inciblable] });
    const forcee = instance("alteration-forcee", "p1");
    const r = jouer(table({ board: [intangible], hand: [forcee] }), forcee, intangible.instanceId);
    ok(r);
    expect(eveils(r.state, intangible.instanceId)).toBe(1);
  });
});

describe("Mutation Réflexe : une réaction jouée depuis la main quand un Altéré est attaqué", () => {
  function attaque(defenseur: CardInstance, main2: CardInstance[]) {
    const brute = instance("le-feral", "p1");
    const state = testGameState({
      ...table({ board: [brute] }, { board: [defenseur], hand: main2 }),
      // Une attaque : pas au tout premier tour de la partie.
      turnNumber: 3,
      phase: "combatPhase",
    });
    return { brute, r: dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: brute.instanceId, defenderInstanceId: defenseur.instanceId }) };
  }

  it("éveille l'Altéré attaqué, annule l'attaque et part au Cimetière", () => {
    const entendant = instance("lentendant", "p2");
    const mutation = instance("mutation-reflexe", "p2");
    const { r } = attaque(entendant, [mutation]);
    ok(r);
    expect(pendingCandidates(r.state).some((c) => c.cardId === "mutation-reflexe" && c.fromHand)).toBe(true);
    const raison = joueur(r.state, "p2").reason;
    const act = activateReactionFor(r.state, "mutation-reflexe");
    ok(act);
    const p2 = joueur(act.state, "p2");
    expect(p2.reason).toBe(raison - 2);
    expect(p2.graveyard.some((c) => c.instanceId === mutation.instanceId)).toBe(true);
    expect(eveils(act.state, entendant.instanceId)).toBe(1);
    // L'attaque n'a pas porté : L'Entendant (2 / 3) aurait péri sous les 5 Puissance du Féral.
    expect(unite(act.state, entendant.instanceId)!.damageMarked).toBe(0);
  });

  it("ne se propose pas pour une unité qui n'est pas un Altéré", () => {
    const autre = instance("le-recousu", "p2");
    const nonAltere = instance("marin-des-jetees", "p2");
    const mutation = instance("mutation-reflexe", "p2");
    const vise = attaque(nonAltere, [mutation]);
    ok(vise.r);
    expect(pendingCandidates(vise.r.state).some((c) => c.cardId === "mutation-reflexe")).toBe(false);
    void autre;
  });
});

describe("une question et une fenêtre de réaction ouvertes ensemble", () => {
  it("la fenêtre passe d'abord, puis la question reprend : la partie ne se fige pas", () => {
    // Une chaîne d'Éveils pose une question (« déclenchez l'Éveil d'un autre
    // Altéré ») dans la même action que des dégâts qui ouvrent une fenêtre de
    // sauvetage chez l'adversaire. Avant le correctif, chacune refusait l'autre.
    const a = instance("lentendant", "p1");
    const b = instance("lentendant", "p1");
    const state: GameState = {
      ...table({ board: [a, b] }),
      pendingChoice: {
        kind: "pickUnits",
        playerId: "p1",
        controllerId: "p1",
        pick: 1,
        among: [b.instanceId],
        effects: [{ type: "triggerEveil", target: { kind: "triggerSource" } }],
        sourceInstanceId: a.instanceId,
        turnNumber: 1,
      },
      pendingReaction: { events: [], awaitingPlayerId: "p2", priorityQueue: [], usedCandidateKeys: [], turnNumber: 1 },
    };
    expect(dispatch(state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [b.instanceId] } }).ok).toBe(false);
    const passe = dispatch(state, { type: "passReaction", playerId: "p2" });
    ok(passe);
    expect(passe.state.pendingReaction).toBeUndefined();
    const reponse = designer(passe.state, b.instanceId);
    ok(reponse);
    expect(eveils(reponse.state, b.instanceId)).toBe(1);
  });
});
