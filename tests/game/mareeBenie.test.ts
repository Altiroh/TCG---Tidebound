import { describe, expect, it } from "vitest";
import { dispatch } from "@/tests/game/arrivalDispatch";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { markerCount } from "@/game/cards/markers";
import { isBlessed, unitHasVeil } from "@/game/cards/unitConditions";
import { STATUS_BENIE, STATUS_VOILE, type CardInstance } from "@/game/cards/types";
import { LA_MAREE_BENIE_SET } from "@/game/cards/sets/mareeBenie";
import type { GameState } from "@/game/state/types";
import type { TideStateName } from "@/game/environment/types";
import { activateReactionFor, enFinDeTour, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LA MARÉE BÉNIE — Lots 20 (Les Bienfaits du Fond) et 21 (L'Équipage Félin).
 *
 * Chaque carte se joue par `dispatch`, comme en partie : Bénédiction et
 * Souillure se lisent sur l'unité, Voile intrinsèque se consomme à la
 * destruction empêchée, les marqueurs +1/+1 s'ajoutent aux stats, et les
 * déclencheurs (Voile perdu, marqueur reçu, destruction empêchée) passent
 * par le bus comme les autres.
 */

function ok<T extends { ok: boolean }>(r: T): asserts r is T & { ok: true } {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error);
}

const joueur = (state: GameState, id: string) => state.players.find((p) => p.id === id)!;
const unite = (state: GameState, instanceId: string): CardInstance | undefined =>
  state.players.flatMap((p) => p.board).find((u) => u.instanceId === instanceId);
const stats = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return computeEffectiveStats(unite(state, instanceId)!, state.environment.tideState, auraContextOf(state, owner.id));
};
const souillures = (state: GameState, instanceId: string) => markerCount(unite(state, instanceId)!, "souillure");
const plusUns = (state: GameState, instanceId: string) => markerCount(unite(state, instanceId)!, "plus-un");
const benie = (state: GameState, instanceId: string) => isBlessed(unite(state, instanceId)!);
const voile = (state: GameState, instanceId: string) => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return unitHasVeil(unite(state, instanceId)!, owner.board);
};

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, tideState: TideStateName = "calme"): GameState {
  return testGameState({
    environment: testEnvironment({ tideState }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, deck: pioche("p1"), ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, deck: pioche("p2"), ...p2 }),
    ],
  });
}

function pioche(ownerId: string): CardInstance[] {
  return Array.from({ length: 6 }, () => instance("mousse-patapouf", ownerId));
}

function jouer(state: GameState, carte: CardInstance, targetInstanceId?: string) {
  return dispatch(state, { type: "playCard", playerId: "p1", instanceId: carte.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

/** Répond à la question « choisissez jusqu'à N Créatures » en cours. */
function designer(state: GameState, ...instanceIds: string[]) {
  const choice = state.pendingChoice;
  if (choice?.kind !== "pickUnits") throw new Error(`Aucune désignation en attente (question : ${choice?.kind ?? "aucune"}).`);
  return dispatch(state, { type: "resolveChoice", playerId: choice.playerId, choice: { pickInstanceIds: instanceIds } });
}

const beni = (cardId: string, ownerId: string, overrides: Partial<CardInstance> = {}) => instance(cardId, ownerId, { statuses: [STATUS_BENIE], ...overrides });
const voile1 = (cardId: string, ownerId: string, overrides: Partial<CardInstance> = {}) => instance(cardId, ownerId, { statuses: [STATUS_VOILE], ...overrides });
const souillee = (cardId: string, ownerId: string, n = 1, overrides: Partial<CardInstance> = {}) =>
  instance(cardId, ownerId, { markers: { souillure: n }, ...overrides });

describe("Bénédiction et Souillure (Lot 20)", () => {
  it("Le Baptême du Fond bénit une Créature alliée et lui rend 2 Résistance", () => {
    const fils = instance("le-fils-du-pecheur", "p1", { damageMarked: 2 });
    const bapteme = instance("le-bapteme-du-fond", "p1");
    const r = jouer(table({ board: [fils], hand: [bapteme] }), bapteme, fils.instanceId);
    ok(r);
    expect(benie(r.state, fils.instanceId)).toBe(true);
    expect(unite(r.state, fils.instanceId)!.damageMarked).toBe(0);
  });

  it("Fièvre salée : 2 dégâts à une Créature non bénie, 3 si elle est souillée — et ne vise pas une bénie", () => {
    const propre = instance("le-noye-revenu", "p2");
    const sale = souillee("le-noye-revenu", "p2");
    const sainte = beni("le-noye-revenu", "p2");
    const f1 = instance("fievre-salee", "p1");
    const f2 = instance("fievre-salee", "p1");
    const state = table({ hand: [f1, f2] }, { board: [propre, sale, sainte] });

    const r1 = jouer(state, f1, propre.instanceId);
    ok(r1);
    expect(unite(r1.state, propre.instanceId)!.damageMarked).toBe(2);
    const r2 = jouer(r1.state, f2, sale.instanceId);
    ok(r2);
    expect(unite(r2.state, sale.instanceId)!.damageMarked).toBe(3);

    expect(jouer(state, f1, sainte.instanceId).ok).toBe(false);
  });

  it("Le Dernier Réfractaire : +1 Puissance non béni, +1 Résistance s'il est aussi souillé ; béni, rien", () => {
    const nu = instance("le-dernier-refractaire", "p1");
    const sale = souillee("le-dernier-refractaire", "p1");
    const sainte = beni("le-dernier-refractaire", "p1", { markers: { souillure: 1 } });
    const state = table({ board: [nu, sale, sainte] });
    expect(stats(state, nu.instanceId)).toMatchObject({ attack: 4, health: 3 });
    expect(stats(state, sale.instanceId)).toMatchObject({ attack: 4, health: 4 });
    expect(stats(state, sainte.instanceId)).toMatchObject({ attack: 3, health: 3 });
  });

  it("Ceux qui ont bu se souille en arrivant et gagne +1/+1 par marqueur Souillure qu'il porte", () => {
    const buveur = instance("ceux-qui-ont-bu", "p1");
    const r = jouer(table({ hand: [buveur] }), buveur);
    ok(r);
    expect(souillures(r.state, buveur.instanceId)).toBe(1);
    expect(stats(r.state, buveur.instanceId)).toMatchObject({ attack: 2, health: 2 });
  });

  it("Le Marin aux Branchies souillé gagne +2 Puissance en Houle, pas au Calme", () => {
    const marin = souillee("le-marin-aux-branchies", "p1");
    expect(stats(table({ board: [marin] }, {}, "houle"), marin.instanceId).attack).toBe(4);
    expect(stats(table({ board: [marin] }, {}, "calme"), marin.instanceId).attack).toBe(2);
  });

  it("Le Gardien des Bénis donne +1 Résistance à TOUTES les Créatures bénies, adverses comprises", () => {
    const gardien = instance("le-gardien-des-benis", "p1");
    const alliee = beni("le-fils-du-pecheur", "p1");
    const adverse = beni("le-noye-revenu", "p2");
    const nonBenie = instance("le-noye-revenu", "p2");
    const state = table({ board: [gardien, alliee] }, { board: [adverse, nonBenie] });
    expect(stats(state, alliee.instanceId).health).toBe(5); // 3 +1 (autre Créature) +1 (Gardien)
    expect(stats(state, adverse.instanceId).health).toBe(5);
    expect(stats(state, nonBenie.instanceId).health).toBe(4);
  });

  it("Le Grand-Bienfaiteur souille à son arrivée toutes les autres Créatures non bénies, et renforce vos bénies", () => {
    const gb = instance("le-grand-bienfaiteur", "p1");
    const alliee = beni("le-fils-du-pecheur", "p1");
    const alliee2 = instance("le-vieux-pecheur", "p1");
    const adverse = instance("le-noye-revenu", "p2");
    const r = jouer(table({ hand: [gb], board: [alliee, alliee2] }, { board: [adverse] }), gb);
    ok(r);
    expect(souillures(r.state, alliee.instanceId)).toBe(0);
    expect(souillures(r.state, alliee2.instanceId)).toBe(1);
    expect(souillures(r.state, adverse.instanceId)).toBe(1);
    expect(souillures(r.state, gb.instanceId)).toBe(0);
    expect(stats(r.state, alliee.instanceId).health).toBe(5); // 3 +1 (autre Créature) +1 (Grand-Bienfaiteur)
  });

  it("Refus de Bénédiction retire la Bénédiction, et inflige 2 dégâts si la cible est souillée", () => {
    const cible = beni("le-noye-revenu", "p2", { markers: { souillure: 1 } });
    const refus = instance("refus-de-benediction", "p1");
    const r = jouer(table({ hand: [refus] }, { board: [cible] }), refus, cible.instanceId);
    ok(r);
    expect(benie(r.state, cible.instanceId)).toBe(false);
    expect(unite(r.state, cible.instanceId)!.damageMarked).toBe(2);
  });

  it("L'Encensoir des Abysses bénit une alliée, ou souille une adverse", () => {
    const alliee = instance("le-vieux-pecheur", "p1");
    const adverse = instance("le-noye-revenu", "p2");
    const e1 = instance("lencensoir-des-abysses", "p1");
    const e2 = instance("lencensoir-des-abysses", "p1");
    const state = table({ hand: [e1, e2], board: [alliee] }, { board: [adverse] });
    const r1 = jouer(state, e1, alliee.instanceId);
    ok(r1);
    expect(benie(r1.state, alliee.instanceId)).toBe(true);
    expect(souillures(r1.state, alliee.instanceId)).toBe(0);
    const r2 = jouer(r1.state, e2, adverse.instanceId);
    ok(r2);
    expect(benie(r2.state, adverse.instanceId)).toBe(false);
    expect(souillures(r2.state, adverse.instanceId)).toBe(1);
  });

  it("Marée de Fièvre : 1 dégât aux non bénies, 2 en Tempête ; les bénies sont épargnées", () => {
    const sainte = beni("le-noye-revenu", "p2");
    const nue = instance("le-noye-revenu", "p2");
    const maree = instance("maree-de-fievre", "p1");
    const calme = jouer(table({ hand: [maree] }, { board: [sainte, nue] }), maree);
    ok(calme);
    expect(unite(calme.state, sainte.instanceId)!.damageMarked).toBe(0);
    expect(unite(calme.state, nue.instanceId)!.damageMarked).toBe(1);
    const tempete = jouer(table({ hand: [maree] }, { board: [sainte, nue] }, "tempete"), maree);
    ok(tempete);
    expect(unite(tempete.state, nue.instanceId)!.damageMarked).toBe(2);
  });

  it("La Communion du Sel compte les Créatures bénies APRÈS la désignation", () => {
    const a = instance("le-vieux-pecheur", "p1");
    const b = instance("le-fils-du-pecheur", "p1");
    const deja = beni("le-gardien-des-benis", "p1");
    const communion = instance("la-communion-du-sel", "p1");
    const state = table({ hand: [communion], board: [a, b, deja], anchor: 10 });
    const r = jouer(state, communion);
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("pickUnits");
    const fin = designer(r.state, a.instanceId, b.instanceId);
    ok(fin);
    expect(benie(fin.state, a.instanceId)).toBe(true);
    expect(benie(fin.state, b.instanceId)).toBe(true);
    expect(joueur(fin.state, "p1").anchor).toBe(Math.min(13, joueur(state, "p1").anchor + 3));
  });

  it("Le Pêcheur en deuil : une autre Créature alliée meurt → 1 Ancrage, et 1 carte si elle était bénie", () => {
    // Une Créature bénie attaque une Garde qui la tue au combat.
    const pecheur = instance("le-pecheur-en-deuil", "p1");
    const sainte = beni("le-vieux-pecheur", "p1");
    const garde = instance("le-noye-revenu", "p2");
    const state = testGameState({ ...table({ board: [pecheur, sainte], anchor: 10 }, { board: [garde] }), phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: sainte.instanceId, defenderInstanceId: garde.instanceId });
    ok(r);
    expect(unite(r.state, sainte.instanceId)).toBeUndefined();
    expect(joueur(r.state, "p1").anchor).toBe(11);
    expect(joueur(r.state, "p1").hand).toHaveLength(1);
  });

  it("Le Pêcheur en deuil : une Créature non bénie ne fait pas piocher", () => {
    const pecheur = instance("le-pecheur-en-deuil", "p1");
    const victime = instance("le-vieux-pecheur", "p1");
    const fievre = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [pecheur, victime], anchor: 10 }, { hand: [fievre] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: victime.instanceId });
    ok(r);
    expect(unite(r.state, victime.instanceId)).toBeUndefined();
    expect(joueur(r.state, "p1").anchor).toBe(11);
    expect(joueur(r.state, "p1").hand).toHaveLength(0);
  });

  it("La Mer rend les siens : une Créature bénie revient directement sur le plateau, une autre en main", () => {
    const sainte = beni("le-noye-revenu", "p1");
    const nue = instance("le-vieux-pecheur", "p1");
    const mer = instance("la-mer-rend-les-siens", "p1");
    const state = table({ hand: [mer], graveyard: [sainte, nue] });

    const r1 = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mer.instanceId, chosenGraveyardInstanceId: sainte.instanceId });
    ok(r1);
    const choisi1 = r1.state.pendingChoice
      ? dispatch(r1.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [sainte.instanceId] } })
      : r1;
    ok(choisi1);
    expect(joueur(choisi1.state, "p1").board.some((c) => c.cardId === "le-noye-revenu")).toBe(true);

    const r2 = dispatch(state, { type: "playCard", playerId: "p1", instanceId: mer.instanceId, chosenGraveyardInstanceId: nue.instanceId });
    ok(r2);
    const choisi2 = r2.state.pendingChoice
      ? dispatch(r2.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [nue.instanceId] } })
      : r2;
    ok(choisi2);
    expect(joueur(choisi2.state, "p1").hand.some((c) => c.cardId === "le-vieux-pecheur")).toBe(true);
  });

  it("Brumesel retire tous les marqueurs Souillure et inflige autant de dégâts au Navire adverse, une fois par tour", () => {
    const a = souillee("le-noye-revenu", "p2", 2);
    const b = souillee("le-vieux-pecheur", "p1", 1);
    const brumesel = instance("brumesel", "p1");
    const pose = jouer(table({ hand: [brumesel], board: [b] }, { board: [a] }), brumesel);
    ok(pose);
    const avant = joueur(pose.state, "p2").anchor;
    const r = activerLande(pose.state);
    ok(r);
    expect(souillures(r.state, a.instanceId)).toBe(0);
    expect(souillures(r.state, b.instanceId)).toBe(0);
    expect(joueur(r.state, "p2").anchor).toBe(avant - 3);
    expect(activerLande(r.state).ok).toBe(false);
  });

  it("L'Ancre des Marées empêche la mer de redescendre sous Houle", () => {
    const ancre = instance("lancre-des-marees", "p1");
    const timoniere = instance("la-timoniere-ecume", "p1");
    const state = table({ board: [ancre], hand: [timoniere] }, {}, "tempete");
    const r = jouer(state, timoniere);
    ok(r);
    expect(r.state.environment.tideState).toBe("houle");
  });
});

/** « Une fois par tour, vous pouvez… » : le bouton Activer de la Lande en jeu. */
function activerLande(state: GameState) {
  return dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: state.environment.lande!.instanceId });
}

describe("Voile intrinsèque et marqueurs +1/+1 (Lot 21)", () => {
  it("Mousse Patapouf gagne Voile en arrivant au Calme, pas en Houle", () => {
    const mousse = instance("mousse-patapouf", "p1");
    const calme = jouer(table({ hand: [mousse] }), mousse);
    ok(calme);
    expect(voile(calme.state, mousse.instanceId)).toBe(true);
    const houle = jouer(table({ hand: [mousse] }, {}, "houle"), mousse);
    ok(houle);
    expect(voile(houle.state, mousse.instanceId)).toBe(false);
  });

  it("Voile empêche une destruction, reste à 1 Résistance, puis se consomme ; le Chat de Vigie en tire un +1/+1", () => {
    const mousse = voile1("mousse-patapouf", "p1");
    const chat = instance("le-chat-de-vigie", "p1");
    const fievre = instance("fievre-salee", "p2");
    const fievre2 = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [mousse, chat] }, { hand: [fievre, fievre2] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: mousse.instanceId });
    ok(r);
    const sauvee = unite(r.state, mousse.instanceId)!;
    expect(sauvee).toBeDefined();
    expect(stats(r.state, mousse.instanceId).health - sauvee.damageMarked).toBe(1);
    expect(voile(r.state, mousse.instanceId)).toBe(false);
    expect(plusUns(r.state, chat.instanceId)).toBe(1);
    expect(stats(r.state, chat.instanceId)).toMatchObject({ attack: 3, health: 4 });
    // Pas de seconde Fièvre sans Voile : la seconde la détruit.

    // Plus de Voile : la seconde Fièvre la détruit.
    const r2 = dispatch(r.state, { type: "playCard", playerId: "p2", instanceId: fievre2.instanceId, targetInstanceId: mousse.instanceId });
    ok(r2);
    expect(unite(r2.state, mousse.instanceId)).toBeUndefined();
  });

  it("Voile ne se cumule pas : Une Vie de Plus ! sur une Créature voilée donne un marqueur +1/+1 à la place", () => {
    const voilee = voile1("le-gros-bosco", "p1");
    const vie = instance("une-vie-de-plus", "p1");
    const r = jouer(table({ hand: [vie], board: [voilee] }), vie, voilee.instanceId);
    ok(r);
    expect(plusUns(r.state, voilee.instanceId)).toBe(1);
    expect(unite(r.state, voilee.instanceId)!.statuses?.filter((s) => s === STATUS_VOILE)).toHaveLength(1);
  });

  it("Le Gros Bosco voilé donne +1 Résistance aux autres Créatures alliées", () => {
    const bosco = voile1("le-gros-bosco", "p1");
    const autre = instance("mousse-patapouf", "p1");
    expect(stats(table({ board: [bosco, autre] }), autre.instanceId).health).toBe(3);
    const nu = instance("le-gros-bosco", "p1");
    expect(stats(table({ board: [nu, autre] }), autre.instanceId).health).toBe(2);
  });

  it("L'Appât à Moustaches donne +2/+2 aux autres Félins alliés, pas à lui-même ni aux non-Félins", () => {
    const appat = instance("lappat-a-moustaches", "p1");
    const felin = instance("mousse-patapouf", "p1");
    const humain = instance("le-vieux-pecheur", "p1");
    const state = table({ board: [appat, felin, humain] });
    expect(stats(state, felin.instanceId)).toMatchObject({ attack: 3, health: 4 });
    expect(stats(state, appat.instanceId)).toMatchObject({ attack: 1, health: 1 });
    expect(stats(state, humain.instanceId)).toMatchObject({ attack: 1, health: 2 });
  });

  it("Le Matelot aux Neuf Vies échappe une seule fois à sa destruction, et reçoit un +1/+1", () => {
    const matelot = instance("le-matelot-aux-neuf-vies", "p1");
    const f1 = instance("fievre-salee", "p2");
    const f2 = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [matelot] }, { hand: [f1, f2] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r1 = dispatch(state, { type: "playCard", playerId: "p2", instanceId: f1.instanceId, targetInstanceId: matelot.instanceId });
    ok(r1);
    expect(unite(r1.state, matelot.instanceId)).toBeDefined();
    expect(plusUns(r1.state, matelot.instanceId)).toBe(1);
    const r2 = dispatch(r1.state, { type: "playCard", playerId: "p2", instanceId: f2.instanceId, targetInstanceId: matelot.instanceId });
    ok(r2);
    expect(unite(r2.state, matelot.instanceId)).toBeUndefined();
  });

  it("La Guérisseuse aux Coussinets : un marqueur +1/+1 allié fait récupérer 1 Ancrage", () => {
    const guerisseuse = instance("la-guerisseuse-aux-coussinets", "p1");
    const cible = instance("mousse-patapouf", "p1");
    const patte = instance("la-patte-du-destin", "p1");
    const state = table({ hand: [patte], board: [guerisseuse, cible], anchor: 10 });
    const r = jouer(state, patte, cible.instanceId);
    ok(r);
    expect(voile(r.state, cible.instanceId)).toBe(true);
    expect(plusUns(r.state, cible.instanceId)).toBe(1);
    expect(joueur(r.state, "p1").anchor).toBe(joueur(state, "p1").anchor + 1);
  });

  it("Les Neuf Vies de l'Équipage : soin complet, Voile aux sans-Voile, +1/+1 à celles qui l'avaient déjà", () => {
    const voilee = voile1("le-gros-bosco", "p1", { damageMarked: 2 });
    const nue = instance("mousse-patapouf", "p1", { damageMarked: 1 });
    const neuf = instance("les-neuf-vies-de-lequipage", "p1");
    const r = jouer(table({ hand: [neuf], board: [voilee, nue] }), neuf);
    ok(r);
    expect(unite(r.state, voilee.instanceId)!.damageMarked).toBe(0);
    expect(unite(r.state, nue.instanceId)!.damageMarked).toBe(0);
    expect(plusUns(r.state, voilee.instanceId)).toBe(1);
    expect(plusUns(r.state, nue.instanceId)).toBe(0);
    expect(voile(r.state, nue.instanceId)).toBe(true);
  });

  it("La Timonière Écume fait passer la mer au Calme", () => {
    const timoniere = instance("la-timoniere-ecume", "p1");
    const r = jouer(table({ hand: [timoniere] }, {}, "tempete"), timoniere);
    ok(r);
    expect(r.state.environment.tideState).toBe("calme");
  });

  it("La Vigie aux Pattes Sèches : +1 Puissance au Calme, +1 Résistance en Houle", () => {
    const vigie = instance("la-vigie-aux-pattes-seches", "p1");
    expect(stats(table({ board: [vigie] }), vigie.instanceId)).toMatchObject({ attack: 3, health: 3 });
    expect(stats(table({ board: [vigie] }, {}, "houle"), vigie.instanceId)).toMatchObject({ attack: 2, health: 4 });
  });
});

describe("interactions entre les deux archétypes", () => {
  it("Une Créature bénie ET voilée : Voile la sauve, la Bénédiction reste, et Le Gardien la renforce toujours", () => {
    const gardien = instance("le-gardien-des-benis", "p1");
    const sainte = instance("le-gros-bosco", "p1", { statuses: [STATUS_BENIE, STATUS_VOILE] });
    const fievre = instance("fievre-salee", "p2");
    const balle = instance("refus-de-benediction", "p2");
    const state = testGameState({
      ...table({ board: [gardien, sainte] }, { hand: [fievre, balle] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    // Fièvre salée ne vise pas une bénie : le Refus d'abord, puis la Fièvre.
    expect(dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: sainte.instanceId }).ok).toBe(false);
    expect(stats(state, sainte.instanceId).health).toBe(5);
    const refus = dispatch(state, { type: "playCard", playerId: "p2", instanceId: balle.instanceId, targetInstanceId: sainte.instanceId });
    ok(refus);
    expect(benie(refus.state, sainte.instanceId)).toBe(false);
    expect(voile(refus.state, sainte.instanceId)).toBe(true);
  });

  it("Brumesel compte les Souillures des deux camps, y compris sur des Félins voilés", () => {
    const felin = voile1("le-gros-bosco", "p2", { markers: { souillure: 2 } });
    const brumesel = instance("brumesel", "p1");
    const pose = jouer(table({ hand: [brumesel] }, { board: [felin] }), brumesel);
    ok(pose);
    const avant = joueur(pose.state, "p2").anchor;
    const r = activerLande(pose.state);
    ok(r);
    expect(joueur(r.state, "p2").anchor).toBe(avant - 2);
    expect(voile(r.state, felin.instanceId)).toBe(true);
  });

  it("Une Créature qui garde ses marqueurs +1/+1 et Souillure les cumule : Ceux qui ont bu reçoit la Patte du Destin", () => {
    const buveur = souillee("ceux-qui-ont-bu", "p1", 2);
    const patte = instance("la-patte-du-destin", "p1");
    const r = jouer(table({ hand: [patte], board: [buveur] }), patte, buveur.instanceId);
    ok(r);
    // 1/1 de base, +2/+2 (deux Souillures), +1/+1 (marqueur)
    expect(stats(r.state, buveur.instanceId)).toMatchObject({ attack: 4, health: 4 });
  });

  it("Bénédiction et Voile intrinsèque restent d'un tour sur l'autre", () => {
    const u = instance("le-gros-bosco", "p1", { statuses: [STATUS_BENIE, STATUS_VOILE] });
    const r = dispatch(enFinDeTour(table({ board: [u] })), { type: "endTurn", playerId: "p1" });
    ok(r);
    expect(benie(r.state, u.instanceId)).toBe(true);
    expect(voile(r.state, u.instanceId)).toBe(true);
  });
});

describe("fenêtres de réaction et cascades", () => {
  it("Amiral Griffenoire : un Voile perdu place un +1/+1 sur toutes vos Créatures, et la Guérisseuse soigne pour chacun", () => {
    const amiral = instance("amiral-griffenoire", "p1");
    const mousse = voile1("mousse-patapouf", "p1");
    const guerisseuse = instance("la-guerisseuse-aux-coussinets", "p1");
    const fievre = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [amiral, mousse, guerisseuse], anchor: 5 }, { hand: [fievre] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: mousse.instanceId });
    ok(r);
    for (const u of [amiral, mousse, guerisseuse]) expect(plusUns(r.state, u.instanceId)).toBe(1);
    expect(joueur(r.state, "p1").anchor).toBe(8);
  });

  it("Le Canonnier Ronchon : le +1/+1 ouvre une fenêtre où le joueur désigne la Créature adverse — ou passe", () => {
    const canonnier = instance("le-canonnier-ronchon", "p1");
    const cible = instance("mousse-patapouf", "p1");
    const adverse = instance("le-noye-revenu", "p2");
    const patte = instance("la-patte-du-destin", "p1");
    const r = jouer(table({ hand: [patte], board: [canonnier, cible] }, { board: [adverse] }), patte, cible.instanceId);
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("le-canonnier-ronchon");
    const tir = activateReactionFor(r.state, "le-canonnier-ronchon", adverse.instanceId);
    ok(tir);
    expect(unite(tir.state, adverse.instanceId)!.damageMarked).toBe(1);

    const passe = dispatch(r.state, { type: "passReaction", playerId: r.state.pendingReaction!.awaitingPlayerId });
    ok(passe);
    expect(unite(passe.state, adverse.instanceId)!.damageMarked).toBe(0);
  });

  it("Gros Bisou ! se joue depuis la main quand une Créature adverse attaque : elle perd 2 Puissance pour cette attaque", () => {
    const attaquant = instance("le-noye-revenu", "p2");
    const bisou = instance("gros-bisou", "p1");
    const state = testGameState({
      ...table({ hand: [bisou] }, { board: [attaquant] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      phase: "combatPhase",
    });
    const avant = joueur(state, "p1").anchor;
    const r = dispatch(state, { type: "attack", playerId: "p2", attackerInstanceId: attaquant.instanceId });
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("gros-bisou");
    const bise = activateReactionFor(r.state, "gros-bisou");
    ok(bise);
    let s = bise.state;
    for (let i = 0; i < 4 && s.pendingReaction; i += 1) {
      const pass = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
      ok(pass);
      s = pass.state;
    }
    expect(joueur(s, "p1").anchor).toBe(avant - 2);
  });

  it("La Cloche des Absents : une Créature alliée meurt, on la brise depuis la main pour piocher 2 cartes", () => {
    const cloche = instance("la-cloche-des-absents", "p1");
    const victime = instance("le-vieux-pecheur", "p1");
    const fievre = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [victime], hand: [cloche] }, { hand: [fievre] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: victime.instanceId });
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("la-cloche-des-absents");
    const brise = activateReactionFor(r.state, "la-cloche-des-absents");
    ok(brise);
    const main = joueur(brise.state, "p1").hand;
    expect(main.some((c) => c.instanceId === cloche.instanceId)).toBe(false);
    expect(main).toHaveLength(2);
  });

  it("On Retombe sur Nos Pattes ! : la Créature n'est pas détruite et reçoit un +1/+1", () => {
    const pattes = instance("on-retombe-sur-nos-pattes", "p1");
    const victime = instance("le-vieux-pecheur", "p1");
    const fievre = instance("fievre-salee", "p2");
    const state = testGameState({
      ...table({ board: [victime], hand: [pattes] }, { hand: [fievre] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
    });
    const r = dispatch(state, { type: "playCard", playerId: "p2", instanceId: fievre.instanceId, targetInstanceId: victime.instanceId });
    ok(r);
    expect(pendingCandidates(r.state).map((c) => c.cardId)).toContain("on-retombe-sur-nos-pattes");
    const sauve = activateReactionFor(r.state, "on-retombe-sur-nos-pattes");
    ok(sauve);
    expect(unite(sauve.state, victime.instanceId)).toBeDefined();
    expect(plusUns(sauve.state, victime.instanceId)).toBe(1);
  });

  it("L'Apôtre des Profondeurs : une Créature adverse souillée par vous fait récupérer 1 Ancrage, une fois par tour", () => {
    const apotre = instance("lapotre-des-profondeurs", "p1");
    const adverse = instance("le-noye-revenu", "p2");
    const e1 = instance("lencensoir-des-abysses", "p1");
    const e2 = instance("lencensoir-des-abysses", "p1");
    const state = table({ hand: [e1, e2], board: [apotre], anchor: 5 }, { board: [adverse] });
    const r1 = jouer(state, e1, adverse.instanceId);
    ok(r1);
    expect(joueur(r1.state, "p1").anchor).toBe(6);
    const r2 = jouer(r1.state, e2, adverse.instanceId);
    ok(r2);
    expect(souillures(r2.state, adverse.instanceId)).toBe(2);
    expect(joueur(r2.state, "p1").anchor).toBe(6);
  });

  it("La Cabine du Capitaine : au début de votre tour, le joueur désigne la Créature qui reçoit le +1/+1", () => {
    const cabine = instance("la-cabine-du-capitaine", "p1");
    const mousse = instance("mousse-patapouf", "p1");
    const state = testGameState({
      ...table({ board: [cabine, mousse] }),
      activePlayerId: "p2",
      priorityPlayerId: "p2",
      turnNumber: 2,
    });
    const r = dispatch(enFinDeTour(state), { type: "endTurn", playerId: "p2" });
    ok(r);
    let s = r.state;
    for (let i = 0; i < 3 && s.pendingReaction; i += 1) {
      const next = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
      ok(next);
      s = next.state;
    }
    expect(s.pendingChoice?.kind).toBe("pickUnits");
    const fin = designer(s, mousse.instanceId);
    ok(fin);
    expect(plusUns(fin.state, mousse.instanceId)).toBe(1);
  });
});

describe("Résistance des Structures (validée le 27/10/2026)", () => {
  it("chaque Structure du booster a la Résistance arrêtée", () => {
    const attendues: Record<string, number> = {
      "le-puits-sale": 2,
      "la-fontaine-du-port": 3,
      "le-filet-qui-respire": 4,
      "lancre-des-marees": 3,
      "la-chapelle-des-bienheureux": 4,
      "le-berceau-du-fond": 5,
      "le-bastion-des-coussinets": 5,
      "la-cabine-du-capitaine": 3,
      "la-mer-aux-coussinets": 4,
      "le-gouvernail-des-marees": 4,
      "la-cloche-du-rassemblement": 3,
    };
    const structures = LA_MAREE_BENIE_SET.filter((def) => def.type === "structure");
    expect(Object.fromEntries(structures.map((def) => [def.id, def.health]))).toEqual(attendues);
  });
});
