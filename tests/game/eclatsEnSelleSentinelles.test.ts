import { describe, expect, it } from "vitest";
import { dispatch } from "@/game/engine";
import { canActivateAbility } from "@/game/actions/activateAbility";
import { auraContextOf, computeEffectiveStats } from "@/game/cards/stats";
import { chromaticColorsOf, emittedSignalsOf, findAssemblage } from "@/game/rules/chromatic";
import { hasEffectiveKeyword } from "@/game/rules/validation";
import type { CardInstance, ChromaticColor } from "@/game/cards/types";
import type { GameState } from "@/game/state/types";
import { activateReactionFor, instance, pendingCandidates, testEnvironment, testGameState, testPlayer } from "./testHelpers";

/**
 * LOT 15 — SENTINELLES CHROMATIQUES : chaque Sentinelle émet le Signal de sa
 * couleur au profit de toutes les AUTRES Sentinelles, même couleur comprise,
 * et les Signaux se cumulent (`game/rules/chromatic.ts`, arbitrage du
 * 23/09/2026).
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
const couleurs = (state: GameState, instanceId: string): ChromaticColor[] => {
  const owner = state.players.find((p) => p.board.some((u) => u.instanceId === instanceId))!;
  return chromaticColorsOf(unite(state, instanceId)!, owner.board);
};

function table(p1: Partial<ReturnType<typeof testPlayer>> = {}, p2: Partial<ReturnType<typeof testPlayer>> = {}, extra: Partial<GameState> = {}): GameState {
  return testGameState({
    environment: testEnvironment({ tideState: "calme" }),
    players: [
      testPlayer("p1", { reason: 10, reasonMax: 10, ...p1 }),
      testPlayer("p2", { shipId: "le-goliath", reason: 10, reasonMax: 10, ...p2 }),
    ],
    ...extra,
  });
}

function passerTout(state: GameState): GameState {
  let s = state;
  while (s.pendingReaction) {
    const r = dispatch(s, { type: "passReaction", playerId: s.pendingReaction.awaitingPlayerId });
    ok(r);
    s = r.state;
  }
  return s;
}

describe("Signaux Rouge et Jaune : des bonus continus", () => {
  it("chaque Rouge prête +1 Puissance à TOUTES les autres Sentinelles, en cumul, pendant son tour seulement", () => {
    const heros = instance("heros-de-la-flamme", "p1");
    const gardienne = instance("gardienne-de-leclat", "p1");
    const autreRouge = instance("briseur-du-brasier", "p1");
    const state = table({ board: [heros, gardienne, autreRouge] });
    // Deux émetteurs rouges : +2 pour la Jaune.
    expect(stats(state, gardienne.instanceId).attack).toBe(3);
    // Deux Rouges se donnent +1 l'un à l'autre — jamais à soi-même.
    expect(stats(state, heros.instanceId).attack).toBe(4);
    expect(stats(state, autreRouge.instanceId).attack).toBe(5);
    // Au tour adverse, plus rien.
    const tourAdverse = { ...state, activePlayerId: "p2" };
    expect(stats(tourAdverse, gardienne.instanceId).attack).toBe(1);
    expect(stats(tourAdverse, heros.instanceId).attack).toBe(3);
  });

  it("une Sentinelle seule ne reçoit pas son propre Signal", () => {
    const heros = instance("heros-de-la-flamme", "p1");
    expect(stats(table({ board: [heros] }), heros.instanceId).attack).toBe(3);
  });

  it("Jaune prête +1 Résistance maximale aux autres couleurs, à toute heure", () => {
    const gardienne = instance("gardienne-de-leclat", "p1");
    const tacticien = instance("tacticien-de-lecume", "p1");
    const state = { ...table({ board: [gardienne, tacticien] }), activePlayerId: "p2" };
    expect(stats(state, tacticien.instanceId).health).toBe(4);
    expect(stats(state, gardienne.instanceId).health).toBe(4);
  });

  it("une unité qui n'est pas une Sentinelle ne reçoit rien", () => {
    const heros = instance("heros-de-la-flamme", "p1");
    const matelot = instance("matelot-fele", "p1");
    expect(stats(table({ board: [heros, matelot] }), matelot.instanceId).attack).toBe(1);
  });

  it("Rempart du Soleil a Garde tant qu'une Sentinelle d'une autre couleur est là", () => {
    const rempart = instance("rempart-du-soleil", "p1");
    let state = table({ board: [rempart, instance("gardienne-de-leclat", "p1")] });
    expect(hasEffectiveKeyword(state, joueur(state, "p1"), rempart, "garde")).toBe(false);
    state = table({ board: [rempart, instance("tacticien-de-lecume", "p1")] });
    expect(hasEffectiveKeyword(state, joueur(state, "p1"), rempart, "garde")).toBe(true);
  });
});

describe("Signaux Bleu, Vert et Violet : une fois par tour", () => {
  it("Bleu : plafonné à -1 par attaque, le second émetteur sert à l'attaque suivante", () => {
    const t1 = instance("tacticien-de-lecume", "p1");
    const t2 = instance("stratege-de-lazur", "p1");
    const attaquant = instance("heros-de-la-flamme", "p1");
    const cible = instance("vieille-selle", "p2");
    const second = instance("gardienne-de-leclat", "p1");
    const state = table({ board: [t1, t2, attaquant, second] }, { board: [cible] }, { phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: attaquant.instanceId, defenderInstanceId: cible.instanceId });
    ok(r);
    expect(stats(r.state, cible.instanceId).attack).toBe(3);
    const r2 = dispatch(passerTout(r.state), { type: "attack", playerId: "p1", attackerInstanceId: second.instanceId, defenderInstanceId: cible.instanceId });
    ok(r2);
    expect(stats(r2.state, cible.instanceId).attack).toBe(2);
  });

  it("Bleu : l'unité adverse attaquée par une autre Sentinelle perd 1 Puissance, jusqu'au prochain tour de l'attaquant", () => {
    const tacticien = instance("tacticien-de-lecume", "p1");
    const heros = instance("heros-de-la-flamme", "p1");
    const cible = instance("vieille-selle", "p2");
    const state = table({ board: [tacticien, heros] }, { board: [cible], deck: [instance("matelot-fele", "p2")] }, { phase: "combatPhase" });
    const r = dispatch(state, { type: "attack", playerId: "p1", attackerInstanceId: heros.instanceId, defenderInstanceId: cible.instanceId });
    ok(r);
    // Riposte affaiblie : 4 - 1 = 3 dégâts, le Héros (2) tombe quand même.
    expect(stats(r.state, cible.instanceId).attack).toBe(3);
    // Le malus tient pendant le tour adverse…
    const fin = dispatch(passerTout(r.state), { type: "endTurn", playerId: "p1" });
    ok(fin);
    expect(stats(fin.state, cible.instanceId).attack).toBe(3);
  });

  it("Vert : chaque émetteur rend 1 Raison à la pose d'une autre Sentinelle, une fois par tour chacun", () => {
    // Porteur de Jade et Survivant de la Mousse émettent tous deux le Vert.
    const jade = instance("porteur-de-jade", "p1");
    const survivant = instance("survivant-de-la-mousse", "p1");
    const heros = instance("heros-de-la-flamme", "p1");
    const heros2 = instance("heros-de-la-flamme", "p1");
    const state = table({ board: [jade, survivant], hand: [heros, heros2], reason: 6 });
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: heros.instanceId });
    ok(r);
    // 2 payées, 2 rendues.
    expect(joueur(r.state, "p1").reason).toBe(6);
    // Survivant : 3 + 1 (Rouge du Héros) + 1 (Raison récupérée grâce à une carte).
    expect(stats(r.state, survivant.instanceId).attack).toBe(5);
    // Les deux émetteurs ont servi ce tour.
    const r2 = dispatch(r.state, { type: "playCard", playerId: "p1", instanceId: heros2.instanceId });
    ok(r2);
    expect(joueur(r2.state, "p1").reason).toBe(4);
  });

  it("Vert : une Sentinelle VERTE jouée profite aussi du Vert des autres", () => {
    const jade = instance("porteur-de-jade", "p1");
    const autreVert = instance("porteur-de-jade", "p1");
    const r = dispatch(table({ board: [jade], hand: [autreVert], reason: 6 }), { type: "playCard", playerId: "p1", instanceId: autreVert.instanceId });
    ok(r);
    expect(joueur(r.state, "p1").reason).toBe(5);
  });

  it("Violet : une Sentinelle d'une autre couleur ciblée par un effet adverse fait piocher puis défausser", () => {
    const veilleuse = instance("veilleuse-de-lombre", "p2");
    const heros = instance("heros-de-la-flamme", "p2");
    const eclat = instance("eclat-de-bouteille", "p1");
    const pioche = instance("matelot-fele", "p2");
    const state = table({ board: [eclat] }, { board: [veilleuse, heros], deck: [pioche], hand: [instance("matelot-fele", "p2")] });
    const r = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: eclat.instanceId, targetInstanceId: heros.instanceId });
    ok(r);
    expect(joueur(r.state, "p2").hand.some((c) => c.instanceId === pioche.instanceId)).toBe(true);
    expect(r.state.pendingChoice?.kind).toBe("handDiscard");
    expect(r.state.pendingChoice?.playerId).toBe("p2");
  });
});

describe("pierres et Éclats", () => {
  it("Émissaire de Quartz choisit sa couleur, et laisse un Éclat de cette couleur à sa destruction", () => {
    const emissaire = instance("emissaire-de-quartz", "p1");
    const r = dispatch(table({ hand: [emissaire] }), { type: "playCard", playerId: "p1", instanceId: emissaire.instanceId });
    ok(r);
    expect(r.state.pendingChoice?.kind).toBe("chromaticColor");
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { color: "vert" } });
    ok(choix);
    expect(couleurs(choix.state, emissaire.instanceId)).toEqual(["vert"]);
    // Le texte ne lui donne pas de Signal.
    expect(emittedSignalsOf(unite(choix.state, emissaire.instanceId)!)).toEqual([]);

    const coup = instance("coup-de-harpon", "p2");
    const detruit = dispatch(
      { ...choix.state, activePlayerId: "p2", priorityPlayerId: "p2", players: choix.state.players.map((p) => (p.id === "p2" ? { ...p, board: [coup] } : p)) as GameState["players"] },
      { type: "breakObject", playerId: "p2", instanceId: coup.instanceId, targetInstanceId: emissaire.instanceId }
    );
    ok(detruit);
    // Coup de Harpon : 2 dégâts, l'Émissaire (3) tient — on l'achève.
    const coup2 = instance("coup-de-harpon", "p2");
    const s2 = { ...detruit.state, players: detruit.state.players.map((p) => (p.id === "p2" ? { ...p, board: [coup2] } : p)) as GameState["players"] };
    const fin = dispatch(passerTout(s2), { type: "breakObject", playerId: "p2", instanceId: coup2.instanceId, targetInstanceId: emissaire.instanceId });
    ok(fin);
    expect(unite(fin.state, emissaire.instanceId)).toBeUndefined();
    expect(joueur(fin.state, "p1").board.map((u) => u.cardId)).toContain("eclat-chromatique-vert");
    // Son texte crée déjà son Éclat : la règle de famille n'en ajoute pas un second.
    expect(joueur(fin.state, "p1").board.filter((u) => u.cardId.startsWith("eclat-chromatique"))).toHaveLength(1);
  });

  describe("la pierre survit à son porteur (règle de famille, 24/09/2026)", () => {
    const eclats = (state: GameState, id: string) =>
      joueur(state, id).board.filter((u) => u.cardId.startsWith("eclat-chromatique")).map((u) => u.cardId);

    it("une Sentinelle tuée au combat laisse un Éclat de sa couleur à son contrôleur", () => {
      // Gardienne de l'Éclat (Jaune, 4 Résistance) déjà à 1 : la riposte du Poisson-lanterne l'achève.
      const gardienne = instance("gardienne-de-leclat", "p1", { damageMarked: 3 });
      const poisson = instance("poisson-lanterne", "p2");
      const r = dispatch(table({ board: [gardienne] }, { board: [poisson] }, { phase: "combatPhase" }), {
        type: "attack",
        playerId: "p1",
        attackerInstanceId: gardienne.instanceId,
        defenderInstanceId: poisson.instanceId,
      });
      ok(r);
      const fin = passerTout(r.state);
      expect(unite(fin, gardienne.instanceId)).toBeUndefined();
      expect(eclats(fin, "p1")).toEqual(["eclat-chromatique-jaune"]);
      expect(eclats(fin, "p2")).toEqual([]);
    });

    it("sabordée : un départ voulu pour faire de la place, elle ne laisse PAS de pierre (25/09/2026)", () => {
      const heros = instance("heros-de-la-flamme", "p1");
      const r = dispatch(table({ board: [heros] }), { type: "saborder", playerId: "p1", instanceId: heros.instanceId });
      ok(r);
      const fin = passerTout(r.state);
      expect(unite(fin, heros.instanceId)).toBeUndefined();
      expect(eclats(fin, "p1")).toEqual([]);
    });

    it("deux Rouges qui meurent ensemble laissent deux Éclats Rouges", () => {
      // Vague Scélérate : 2 dégâts à toutes les unités — deux Héros de la Flamme (3 / 2) y restent.
      const vague = instance("vague-scelerate", "p1");
      const heros = [instance("heros-de-la-flamme", "p1"), instance("heros-de-la-flamme", "p1")];
      const r = dispatch(table({ hand: [vague], board: heros }), { type: "playCard", playerId: "p1", instanceId: vague.instanceId });
      ok(r);
      const fin = passerTout(r.state);
      expect(heros.every((h) => unite(fin, h.instanceId) === undefined)).toBe(true);
      expect(eclats(fin, "p1")).toEqual(["eclat-chromatique-rouge", "eclat-chromatique-rouge"]);
    });

    it("l'Éclat ne peut pas attaquer, mais se Saborde s'il gêne", () => {
      const eclat = instance("eclat-chromatique-rouge", "p1");
      const poisson = instance("poisson-lanterne", "p2");
      const combat = table({ board: [eclat] }, { board: [poisson] }, { phase: "combatPhase" });
      expect(dispatch(combat, { type: "attack", playerId: "p1", attackerInstanceId: eclat.instanceId }).ok).toBe(false);
      expect(
        dispatch(combat, { type: "attack", playerId: "p1", attackerInstanceId: eclat.instanceId, defenderInstanceId: poisson.instanceId }).ok
      ).toBe(false);

      const r = dispatch(table({ board: [eclat] }), { type: "saborder", playerId: "p1", instanceId: eclat.instanceId });
      ok(r);
      expect(eclats(passerTout(r.state), "p1")).toEqual([]);
    });

    it("une unité qui n'est pas une Sentinelle ne laisse rien", () => {
      const requin = instance("requin-balafre", "p1");
      const r = dispatch(table({ board: [requin] }), { type: "saborder", playerId: "p1", instanceId: requin.instanceId });
      ok(r);
      expect(eclats(passerTout(r.state), "p1")).toEqual([]);
    });
  });

  it("Héraut de Nacre prend la couleur d'un Éclat, et en émet le Signal", () => {
    const heraut = instance("heraut-de-nacre", "p1");
    const eclat = instance("eclat-chromatique-rouge", "p1");
    const alliee = instance("gardienne-de-leclat", "p1");
    const r = dispatch(table({ hand: [heraut], board: [eclat, alliee] }), { type: "playCard", playerId: "p1", instanceId: heraut.instanceId });
    ok(r);
    const pris = activateReactionFor(r.state, "heraut-de-nacre", eclat.instanceId);
    ok(pris);
    expect(couleurs(pris.state, heraut.instanceId)).toEqual(["rouge"]);
    expect(stats(pris.state, alliee.instanceId).attack).toBe(2);
  });

  it("un Éclat a une couleur mais n'émet rien", () => {
    const eclat = instance("eclat-chromatique-rouge", "p1");
    const gardienne = instance("gardienne-de-leclat", "p1");
    const state = table({ board: [eclat, gardienne] });
    expect(stats(state, gardienne.instanceId).attack).toBe(1);
    expect(emittedSignalsOf(eclat)).toEqual([]);
  });

  it("Bracelet Chromatique prête à sa Sentinelle la couleur d'un Éclat, sans Signal de plus", () => {
    const porteuse = instance("gardienne-de-leclat", "p1");
    const eclat = instance("eclat-chromatique-bleu", "p1");
    const bracelet = instance("bracelet-chromatique", "p1");
    const r = dispatch(table({ hand: [bracelet], board: [porteuse, eclat] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: bracelet.instanceId,
      targetInstanceId: porteuse.instanceId,
    });
    ok(r);
    const serti = activateReactionFor(r.state, "bracelet-chromatique", eclat.instanceId);
    ok(serti);
    expect(couleurs(serti.state, porteuse.instanceId)).toEqual(["jaune", "bleu"]);
    expect(emittedSignalsOf(unite(serti.state, porteuse.instanceId)!)).toEqual(["jaune"]);
  });

  it("Pierre Retrouvée recrée en jeu un Éclat du Cimetière", () => {
    const pierre = instance("pierre-retrouvee", "p1");
    const ancien = instance("eclat-chromatique-violet", "p1");
    const r = dispatch(table({ board: [pierre], graveyard: [ancien] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: pierre.instanceId,
      chosenGraveyardInstanceId: ancien.instanceId,
    });
    ok(r);
    expect(joueur(r.state, "p1").board.map((u) => u.cardId)).toContain("eclat-chromatique-violet");
  });

  it("Transfert de Pierre : l'Éclat part, sa couleur passe à une Sentinelle jusqu'à votre prochain tour", () => {
    const transfert = instance("transfert-de-pierre", "p1");
    const eclat = instance("eclat-chromatique-vert", "p1");
    const sentinelle = instance("heros-de-la-flamme", "p1");
    const r = dispatch(table({ board: [transfert, eclat, sentinelle] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: transfert.instanceId,
      targetInstanceId: eclat.instanceId,
    });
    ok(r);
    expect(unite(r.state, eclat.instanceId)).toBeUndefined();
    const choix = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [sentinelle.instanceId] } });
    ok(choix);
    expect(couleurs(choix.state, sentinelle.instanceId)).toEqual(["rouge", "vert"]);
  });

  it("Coffret aux Cinq Pierres : Éclats plus solides, et un Éclat Sabordé cherche une Sentinelle de sa couleur", () => {
    const coffret = instance("coffret-aux-cinq-pierres", "p1");
    const eclat = instance("eclat-chromatique-jaune", "p1");
    const jaune = instance("gardienne-de-leclat", "p1");
    const rouge = instance("heros-de-la-flamme", "p1");
    const state = table({ board: [coffret, eclat], deck: [rouge, jaune, instance("matelot-fele", "p1")] });
    expect(stats(state, eclat.instanceId).health).toBe(2);
    const r = dispatch(state, { type: "activateAbility", playerId: "p1", sourceInstanceId: coffret.instanceId, targetInstanceId: eclat.instanceId });
    ok(r);
    expect(unite(r.state, eclat.instanceId)).toBeUndefined();
    const refus = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [rouge.instanceId] } });
    expect(refus.ok).toBe(false);
    const prise = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [jaune.instanceId] } });
    ok(prise);
    expect(joueur(prise.state, "p1").hand.map((c) => c.instanceId)).toContain(jaune.instanceId);
  });

  it("le bouton « Activer » du Coffret : proposé avec un Éclat à Saborder, plus après usage ni sans Éclat", () => {
    const coffret = instance("coffret-aux-cinq-pierres", "p1");
    const eclat = instance("eclat-chromatique-jaune", "p1");
    const avec = table({ board: [coffret, eclat], deck: [instance("matelot-fele", "p1")] });
    expect(canActivateAbility(avec, "p1", coffret.instanceId)).toBe(true);
    // Rien à Saborder : rien à proposer.
    expect(canActivateAbility(table({ board: [coffret] }), "p1", coffret.instanceId)).toBe(false);
    // Pas pendant le tour adverse, et une fois par tour.
    expect(canActivateAbility(avec, "p2", coffret.instanceId)).toBe(false);
    const r = dispatch(avec, { type: "activateAbility", playerId: "p1", sourceInstanceId: coffret.instanceId, targetInstanceId: eclat.instanceId });
    ok(r);
    const apres = { ...r.state, pendingChoice: undefined };
    const autreEclat = instance("eclat-chromatique-rouge", "p1");
    const encore = { ...apres, players: apres.players.map((p) => (p.id === "p1" ? { ...p, board: [...p.board, autreEclat] } : p)) as GameState["players"] };
    expect(canActivateAbility(encore, "p1", coffret.instanceId)).toBe(false);
  });

  it("Appel des Sentinelles ne laisse prendre qu'une Sentinelle", () => {
    const appel = instance("appel-des-sentinelles", "p1");
    const sentinelle = instance("porteur-de-jade", "p1");
    const autre = instance("mange-fer", "p1");
    const r = dispatch(table({ board: [appel], deck: [autre, sentinelle] }), { type: "breakObject", playerId: "p1", instanceId: appel.instanceId });
    ok(r);
    expect(dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [autre.instanceId] } }).ok).toBe(false);
    ok(dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { takeInstanceIds: [sentinelle.instanceId] } }));
  });
});

describe("jouer les couleurs ensemble", () => {
  it("Synchronisation ! : la Sentinelle bénéficie aussi de son propre Signal jusqu'à la fin du tour", () => {
    const heros = instance("heros-de-la-flamme", "p1");
    const sync = instance("synchronisation", "p1");
    const r = dispatch(table({ board: [heros, sync] }), { type: "breakObject", playerId: "p1", instanceId: sync.instanceId, targetInstanceId: heros.instanceId });
    ok(r);
    expect(stats(r.state, heros.instanceId).attack).toBe(4);
  });

  it("Formation Prismatique ne se joue qu'avec 3 couleurs — La Première Pierre peut en fournir une", () => {
    const formation = instance("formation-prismatique", "p1");
    const pierre = instance("la-premiere-pierre", "p1");
    const heros = instance("heros-de-la-flamme", "p1");
    const gardienne = instance("gardienne-de-leclat", "p1");
    const state = table({ hand: [formation], board: [heros, gardienne, pierre] });
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: formation.instanceId }).ok).toBe(false);

    const bris = dispatch(state, { type: "breakObject", playerId: "p1", instanceId: pierre.instanceId });
    ok(bris);
    const couleur = dispatch(bris.state, { type: "resolveChoice", playerId: "p1", choice: { color: "violet" } });
    ok(couleur);
    const joue = dispatch(couleur.state, { type: "playCard", playerId: "p1", instanceId: formation.instanceId });
    ok(joue);
    // Chaque Sentinelle profite aussi de son propre Signal : le Héros prend
    // son propre Rouge, la Gardienne son propre Jaune.
    expect(stats(joue.state, heros.instanceId).attack).toBe(4);
    expect(stats(joue.state, gardienne.instanceId).health).toBe(5);
  });

  it("Les Couleurs Répondent refuse deux Sentinelles de la même couleur", () => {
    const anomalie = instance("les-couleurs-repondent", "p1");
    const r1 = instance("heros-de-la-flamme", "p1");
    const r2 = instance("briseur-du-brasier", "p1");
    const j = instance("gardienne-de-leclat", "p1");
    const r = dispatch(table({ hand: [anomalie], board: [r1, r2, j] }), { type: "playCard", playerId: "p1", instanceId: anomalie.instanceId });
    ok(r);
    expect(dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [r1.instanceId, r2.instanceId] } }).ok).toBe(false);
    const bon = dispatch(r.state, { type: "resolveChoice", playerId: "p1", choice: { pickInstanceIds: [r1.instanceId, j.instanceId] } });
    ok(bon);
    // 1 imprimé + 2 Rouges (en cumul) + 1 des Couleurs Répondent.
    expect(stats(bon.state, j.instanceId).attack).toBe(1 + 2 + 1);
  });

  it("Briseur du Brasier ne pousse qu'une Sentinelle d'une AUTRE couleur", () => {
    const briseur = instance("briseur-du-brasier", "p1");
    const rouge = instance("heros-de-la-flamme", "p1");
    const bleu = instance("tacticien-de-lecume", "p1");
    const r = dispatch(table({ hand: [briseur], board: [rouge, bleu] }), { type: "playCard", playerId: "p1", instanceId: briseur.instanceId });
    ok(r);
    expect(activateReactionFor(r.state, "briseur-du-brasier", rouge.instanceId).ok).toBe(false);
    const pousse = activateReactionFor(r.state, "briseur-du-brasier", bleu.instanceId);
    ok(pousse);
    // 2 imprimé + 2 Rouges (Héros et Briseur, en cumul) + 2 du Briseur.
    expect(stats(pousse.state, bleu.instanceId).attack).toBe(6);
  });

  it("Stratège de l'Azur : le malus tient pendant le tour adverse, et tombe à votre prochain tour", () => {
    const stratege = instance("stratege-de-lazur", "p1");
    const cible = instance("vieille-selle", "p2", { damageMarked: 1 });
    const r = dispatch(table({ hand: [stratege], deck: [instance("matelot-fele", "p1")] }, { board: [cible], deck: [instance("matelot-fele", "p2")] }), {
      type: "playCard",
      playerId: "p1",
      instanceId: stratege.instanceId,
    });
    ok(r);
    const lu = activateReactionFor(r.state, "stratege-de-lazur", cible.instanceId);
    ok(lu);
    expect(stats(lu.state, cible.instanceId).attack).toBe(2);
    const tourAdverse = dispatch(passerTout(lu.state), { type: "endTurn", playerId: "p1" });
    ok(tourAdverse);
    expect(stats(tourAdverse.state, cible.instanceId).attack).toBe(2);
    const retour = dispatch(passerTout(tourAdverse.state), { type: "endTurn", playerId: "p2" });
    ok(retour);
    expect(stats(retour.state, cible.instanceId).attack).toBe(4);
  });

  it("Poste Chromatique renforce la Sentinelle qui apporte une couleur nouvelle", () => {
    const poste = instance("poste-chromatique", "p1", { turnsRemaining: 4 });
    const rouge = instance("heros-de-la-flamme", "p1");
    const nouveau = instance("tacticien-de-lecume", "p1");
    const r = dispatch(table({ board: [poste, rouge], hand: [nouveau] }), { type: "playCard", playerId: "p1", instanceId: nouveau.instanceId });
    ok(r);
    expect(stats(r.state, nouveau.instanceId).health).toBe(4);
  });

  it("Oracle d'Améthyste : une défausse d'effet pendant votre tour lui donne +2 Puissance", () => {
    const oracle = instance("oracle-damethyste", "p1");
    const vigie = instance("vigie-aux-fissures", "p1");
    const matelot = instance("matelot-fele", "p1");
    const eclat = instance("eclat-de-bouteille", "p1");
    const r = dispatch(table({ board: [oracle, vigie, matelot, eclat], deck: [instance("matelot-fele", "p1")], hand: [instance("mange-fer", "p1")] }), {
      type: "breakObject",
      playerId: "p1",
      instanceId: eclat.instanceId,
      targetInstanceId: matelot.instanceId,
    });
    ok(r);
    const defausse = dispatch(r.state, {
      type: "resolveChoice",
      playerId: "p1",
      choice: { discardInstanceIds: [joueur(r.state, "p1").hand[0]!.instanceId] },
    });
    ok(defausse);
    expect(stats(defausse.state, oracle.instanceId).attack).toBe(5);
  });
});

describe("Le Géant Chromatique : l'Assemblage", () => {
  const quatre = () => [
    instance("heros-de-la-flamme", "p1"),
    instance("gardienne-de-leclat", "p1"),
    instance("tacticien-de-lecume", "p1"),
    instance("emissaire-de-quartz", "p1", { chromatic: { colors: ["vert"] } }),
  ];

  it("place quatre Sentinelles de couleurs différentes au Cimetière, sans les détruire, pour 2 Raison", () => {
    const geant = instance("le-geant-chromatique", "p1");
    const sentinelles = quatre();
    const state = table({ hand: [geant], board: sentinelles, reason: 5 });
    const assemblage = findAssemblage(sentinelles, 4)!;
    expect(assemblage).toHaveLength(4);
    const r = dispatch(state, { type: "playCard", playerId: "p1", instanceId: geant.instanceId, assemblage });
    ok(r);
    // 2 Raison payées, 1 rendue : assemblé avec du Vert, le Géant ÉMET le
    // Signal Vert et en BÉNÉFICIE — sa propre pose est celle d'une Sentinelle
    // qui profite du Vert. Lecture littérale du texte, signalée au design.
    expect(joueur(r.state, "p1").reason).toBe(4);
    expect(joueur(r.state, "p1").board.map((u) => u.cardId)).toEqual(["le-geant-chromatique"]);
    expect(joueur(r.state, "p1").graveyard.every((c) => c.graveyardCause === "assembled")).toBe(true);
    // « Cela ne compte pas comme une destruction » : l'Émissaire ne laisse pas d'Éclat.
    expect(joueur(r.state, "p1").board.some((u) => u.cardId.startsWith("eclat-chromatique"))).toBe(false);
    expect(couleurs(r.state, geant.instanceId)).toEqual(["rouge", "jaune", "bleu", "vert"]);
    // Il émet ses quatre Signaux ET en bénéficie : Rouge (+1) pendant son tour, Jaune (+1).
    expect([stats(r.state, geant.instanceId).attack, stats(r.state, geant.instanceId).health]).toEqual([9, 10]);
  });

  it("un Assemblage peut être cherché AUTOUR d'une Sentinelle donnée (celle où l'on lâche le Géant)", () => {
    const sentinelles = quatre();
    const requin = instance("requin-balafre", "p1");
    const board = [requin, ...sentinelles];
    const autour = findAssemblage(board, 4, sentinelles[3]!.instanceId)!;
    expect(autour.map((p) => p.instanceId)).toContain(sentinelles[3]!.instanceId);
    // Pas une Sentinelle : aucun Assemblage ne passe par elle.
    expect(findAssemblage(board, 4, requin.instanceId)).toBeUndefined();
    // Trois couleurs seulement : rien, avec ou sans Sentinelle imposée.
    expect(findAssemblage(sentinelles.slice(0, 3), 4, sentinelles[0]!.instanceId)).toBeUndefined();
  });

  it("refuse un Assemblage à trois couleurs, ou dont une Sentinelle ne porte pas la couleur annoncée", () => {
    const geant = instance("le-geant-chromatique", "p1");
    const sentinelles = quatre();
    const state = table({ hand: [geant], board: sentinelles });
    const faux = sentinelles.map((u) => ({ instanceId: u.instanceId, color: "rouge" as const }));
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: geant.instanceId, assemblage: faux }).ok).toBe(false);
    const menteur = findAssemblage(sentinelles, 4)!.map((part, i) => (i === 0 ? { ...part, color: "violet" as const } : part));
    expect(dispatch(state, { type: "playCard", playerId: "p1", instanceId: geant.instanceId, assemblage: menteur }).ok).toBe(false);
  });

  it("la version ABYSSALE prend d'elle-même la cinquième couleur, la seule qui reste", () => {
    const geant = instance("le-geant-chromatique-abyssal", "p1");
    const sentinelles = quatre();
    const r = dispatch(table({ hand: [geant], board: sentinelles }), {
      type: "playCard",
      playerId: "p1",
      instanceId: geant.instanceId,
      assemblage: findAssemblage(sentinelles, 4)!,
    });
    ok(r);
    expect(couleurs(r.state, geant.instanceId)).toEqual(["rouge", "jaune", "bleu", "vert", "violet"]);
    expect(emittedSignalsOf(unite(r.state, geant.instanceId)!)).toHaveLength(5);
  });

  it("joué à son coût normal, le Géant n'a pas de couleur", () => {
    const geant = instance("le-geant-chromatique", "p1");
    const r = dispatch(table({ hand: [geant] }), { type: "playCard", playerId: "p1", instanceId: geant.instanceId });
    ok(r);
    expect(joueur(r.state, "p1").reason).toBe(2);
    expect(couleurs(r.state, geant.instanceId)).toEqual([]);
    expect(pendingCandidates(r.state)).toEqual([]);
  });
});
