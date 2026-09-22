/**
 * INSTRUMENTATION DU BANC D'ESSAI — une partie mesurée, et rien d'autre.
 *
 * Extrait de `playtestReport.ts` pour que les mesures cessent d'être
 * prisonnières d'un seul script : l'audit du swarm, les replays d'équilibrage
 * et le rapport de rythme lisent tous la MÊME partie mesurée de la même
 * façon. Deux relevés qui ne comptent pas pareil ne se comparent pas.
 *
 * AVERTISSEMENT, inchangé — c'est un bot, pas un joueur. Son évaluation
 * surdépense et s'endette là où un humain temporiserait. Ces chiffres disent
 * le RYTHME et les écarts GROSSIERS, pas la qualité d'un archétype.
 */
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isPermanentCard } from "@/game/cards/types";
import type { DeckList } from "@/game/cards/decks/types";
import { dispatch } from "@/game/engine";
import { createSeededRandom } from "@/game/rng";
import { createGameState } from "@/game/state/createGameState";
import type { GameState, PlayerId } from "@/game/state/types";

/** Coûts dont on veut savoir à quel tour ils tombent pour la première fois. */
export const COUTS_SUIVIS = [3, 4, 5, 6, 7] as const;
export type CoutSuivi = (typeof COUTS_SUIVIS)[number];

/** Postes de dégâts d'Ancrage, tels que le rapport les nomme. */
export const POSTES = ["Combat", "Marée", "Déraison", "Effets de cartes", "Capacité de Navire"] as const;
export type Poste = (typeof POSTES)[number];

export interface Mesures {
  /** Tours de TABLE (les deux joueurs confondus). */
  tours: number;
  /** Tours joués par chaque joueur — la durée telle qu'un joueur la ressent. */
  toursParJoueur: number;
  vainqueur: "a" | "b" | "nul";

  // --- Rythme de pose ----------------------------------------------------
  /** Cartes jouées, par tour de table. */
  posesParTour: number[];
  /** PERMANENTS posés, par tour de table — ce qui occupe un Slot, pas ce qui se résout et s'en va. */
  permanentsParTour: number[];
  /** Slots occupés (le plus garni des deux plateaux) à la fin de chaque tour. */
  slotsFinDeTour: number[];
  /** Premier tour où une carte de ce coût est jouée, par coût suivi. */
  premierCout: Record<CoutSuivi, number[]>;
  /** Coût imprimé de CHAQUE carte jouée — de quoi sortir une moyenne réelle. */
  coutsJoues: number[];

  // --- Raison ------------------------------------------------------------
  /** Raison du joueur actif juste après l'entame de son tour (récupération faite). */
  raisonDebutTour: number[];
  /** Raison du joueur actif au moment où il rend la main : ce qu'il n'a PAS dépensé. */
  raisonFinTour: number[];
  /** Cartes en main qu'il ne pouvait pas payer, au moment de rendre la main. */
  mainInjouableFinTour: number[];
  /** Points de Déraison accumulés sur la partie, les deux joueurs confondus. */
  deraison: number;
  /**
   * PIRE dette atteinte en un seul tour, sur toute la partie.
   *
   * La Déraison n'a pas de plancher : c'est un emprunt illimité, remboursé
   * en Ancrage. Le total dit combien on a emprunté ; ce pic-ci dit si on
   * l'a fait à petites doses ou en une fois — et c'est le second cas qui
   * fabrique un plateau plein d'un coup.
   */
  deraisonPic: number;
  /** Le plus grand nombre de cartes posées dans un SEUL tour. */
  posesPicUnTour: number;
  /** Raison réellement dépensée par tour, coût imprimé des cartes jouées. */
  depenseParTour: number[];
  /** Ancrage perdu à cause de la Déraison. */
  ancrageDeraison: number;

  // --- Corps et Slots ----------------------------------------------------
  /** Permanents arrivés SANS être joués depuis la main : invocations d'effets. */
  invocations: number;
  /** Invocations, par tour de table — c'est là que se lit un départ en trombe. */
  invocationsParTour: number[];
  /** Cartes dont un effet a produit au moins un corps, et combien chacune en a produit. */
  invocationsParCarte: Record<string, number>;

  // --- Autres gestes -----------------------------------------------------
  /** Capacités de Navire activées (les deux joueurs). */
  capacitesNavire: number;
  /** Réactions activées depuis une fenêtre — pièges compris. */
  reactionsActivees: number;

  // --- Budget de dégâts --------------------------------------------------
  /**
   * D'où viennent les points d'Ancrage perdus, les deux joueurs confondus.
   * C'est la métrique qui explique la DURÉE d'une partie — une réserve
   * d'Ancrage divisée par un débit.
   */
  ancrageParPoste: Record<string, number>;
  ancrageDepart: number;
}

function mesuresVides(ancrageDepart: number): Mesures {
  return {
    tours: 0,
    toursParJoueur: 0,
    vainqueur: "nul",
    posesParTour: [],
    permanentsParTour: [],
    slotsFinDeTour: [],
    premierCout: { 3: [], 4: [], 5: [], 6: [], 7: [] },
    coutsJoues: [],
    raisonDebutTour: [],
    raisonFinTour: [],
    mainInjouableFinTour: [],
    deraison: 0,
    deraisonPic: 0,
    posesPicUnTour: 0,
    depenseParTour: [],
    ancrageDeraison: 0,
    invocations: 0,
    invocationsParTour: [],
    invocationsParCarte: {},
    capacitesNavire: 0,
    reactionsActivees: 0,
    ancrageParPoste: {},
    ancrageDepart,
  };
}

/**
 * À quel poste imputer un dégât d'Ancrage. L'événement `DAMAGE` sur une
 * coque ne dit pas d'où il vient ; l'ACTION en cours, si — c'est la seule
 * attribution fiable dont on dispose sans instrumenter le moteur lui-même.
 */
function posteDe(actionType: string): Poste {
  if (actionType === "attack") return "Combat";
  if (actionType === "endTurn") return "Marée";
  if (actionType === "fireShipAbility" || actionType === "activateShipAbility") return "Capacité de Navire";
  return "Effets de cartes";
}

/** Cartes de la main que ce joueur ne peut pas payer avec sa Raison actuelle. */
function mainInjouable(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;
  // Coût IMPRIMÉ : les réductions en attente sont rares et situationnelles,
  // les compter ici donnerait une mesure plus juste sur le papier et moins
  // lisible en pratique. Ce qu'on veut savoir, c'est « combien de cartes
  // dorment en main faute de Raison », pas le coût exact de chacune.
  return player.hand.filter((card) => getCardDefinition(card.cardId).cost > player.reason).length;
}

/**
 * Joue une partie complète entre deux listes et rend tout ce qui s'y est
 * passé. Déterministe à graine donnée.
 */
export function mesurerPartie(deckA: DeckList, deckB: DeckList, seed: number, difficulte = "moyen" as const): Mesures {
  // Le bot tire au sort ses hésitations (`chooseBotAction`) : sans une
  // graine, deux exécutions du même matchup donneraient deux résultats, et
  // un « avant/après » ne mesurerait plus le changement mais le tirage.
  const hasardDuBot = createSeededRandom(seed ^ 0x5eed);

  let state: GameState = createGameState({
    gameId: `metrics-${seed}`,
    player1: { id: "a", deck: deckA },
    player2: { id: "b", deck: deckB },
    seed,
  });

  const m = mesuresVides(state.players.reduce((somme, pl) => somme + pl.anchor, 0));
  const coutsVus = new Set<number>();
  // Raison d'entame du tout premier tour : personne ne l'a « récupérée »,
  // mais elle compte comme début de tour.
  m.raisonDebutTour.push(state.players.find((p) => p.id === state.activePlayerId)!.reason);

  let coups = 0;
  while (state.status === "active" && coups < 900) {
    const acteur = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
    if (!acteur) break;
    const avant = state;
    const action = chooseBotAction(state, acteur, difficulte, hasardDuBot);

    // MESURÉ AVANT le coup : ce que le joueur actif laisse sur la table en
    // rendant la main, c'est son état juste avant `endTurn`.
    if (action.type === "endTurn" && acteur === avant.activePlayerId) {
      m.raisonFinTour.push(avant.players.find((p) => p.id === acteur)!.reason);
      m.mainInjouableFinTour.push(mainInjouable(avant, acteur));
    }

    const res = dispatch(state, action);
    if (!res.ok) break;

    const tour = avant.turnNumber;
    const jouees = new Set<string>();

    for (const e of res.events) {
      if (!e) continue;
      if (e.type === "PLAY_CARD") {
        jouees.add(e.instanceId);
        const carte = avant.players.flatMap((pl) => pl.hand).find((c) => c.instanceId === e.instanceId);
        const def = carte ? getCardDefinition(carte.cardId) : undefined;
        m.posesParTour[tour] = (m.posesParTour[tour] ?? 0) + 1;
        m.posesPicUnTour = Math.max(m.posesPicUnTour, m.posesParTour[tour]!);
        if (def) {
          m.coutsJoues.push(def.cost);
          m.depenseParTour[tour] = (m.depenseParTour[tour] ?? 0) + def.cost;
          if (isPermanentCard(def)) m.permanentsParTour[tour] = (m.permanentsParTour[tour] ?? 0) + 1;
          if ((COUTS_SUIVIS as readonly number[]).includes(def.cost) && !coutsVus.has(def.cost)) {
            coutsVus.add(def.cost);
            m.premierCout[def.cost as CoutSuivi].push(tour);
          }
        }
      }

      // Un corps arrivé sans être joué depuis la main : c'est une
      // INVOCATION, et c'est exactement ce que l'audit du swarm cherche.
      if (e.type === "SUMMON" && !jouees.has(e.instanceId)) {
        m.invocations += 1;
        m.invocationsParTour[tour] = (m.invocationsParTour[tour] ?? 0) + 1;
        const source = sourceDe(action, avant);
        if (source) m.invocationsParCarte[source] = (m.invocationsParCarte[source] ?? 0) + 1;
      }

      if (e.type === "SHIP_ABILITY_ACTIVATED") m.capacitesNavire += 1;
      if (e.type === "REACTION_ACTIVATED") m.reactionsActivees += 1;

      if (e.type === "DERAISON_SETTLED") {
        m.deraison += e.debt;
        m.deraisonPic = Math.max(m.deraisonPic, e.debt);
        m.ancrageDeraison += e.anchorDamage;
        if (e.anchorDamage > 0) m.ancrageParPoste.Déraison = (m.ancrageParPoste.Déraison ?? 0) + e.anchorDamage;
      }
      if (e.type === "DAMAGE" && e.targetPlayerId) {
        const poste = posteDe(action.type);
        m.ancrageParPoste[poste] = (m.ancrageParPoste[poste] ?? 0) + e.amount;
      }
    }

    if (res.state.turnNumber !== avant.turnNumber) {
      m.slotsFinDeTour[tour] = Math.max(...res.state.players.map((pl) => pl.board.length));
      const entrant = res.state.players.find((p) => p.id === res.state.activePlayerId);
      if (entrant) m.raisonDebutTour.push(entrant.reason);
    }

    state = res.state;
    coups += 1;
  }

  m.tours = state.turnNumber;
  m.toursParJoueur = state.turnNumber / 2;
  const a = state.players.find((p) => p.id === "a")!;
  const b = state.players.find((p) => p.id === "b")!;
  m.vainqueur = a.anchor <= 0 && b.anchor <= 0 ? "nul" : a.anchor <= 0 ? "b" : b.anchor <= 0 ? "a" : "nul";
  return m;
}

/**
 * La carte À L'ORIGINE du coup en cours, quand l'action en désigne une.
 * Une invocation vient presque toujours d'une carte jouée, d'un Objet brisé
 * ou d'une capacité activée : c'est elle qu'on veut nommer dans l'audit.
 */
function sourceDe(action: { type: string; instanceId?: string; sourceInstanceId?: string }, avant: GameState): string | undefined {
  const id = action.instanceId ?? action.sourceInstanceId;
  if (!id) return undefined;
  for (const player of avant.players) {
    for (const zone of [player.hand, player.board]) {
      const carte = zone.find((c) => c.instanceId === id);
      if (carte) return getCardDefinition(carte.cardId).name;
    }
  }
  return undefined;
}

// --- Agrégation ----------------------------------------------------------

export const moy = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((x, y) => x + y, 0) / xs.length);
export const f2 = (n: number) => n.toFixed(2);

/** Moyenne d'un tableau indexé par tour, sur un lot de parties. */
export function moyenneAuTour(parties: Mesures[], champ: "posesParTour" | "permanentsParTour" | "slotsFinDeTour" | "invocationsParTour", tour: number): number {
  return moy(parties.map((m) => m[champ][tour] ?? 0));
}

/** Total des invocations par carte, tous lots confondus. */
export function cumulerInvocations(parties: Mesures[]): Array<{ carte: string; total: number }> {
  const total = new Map<string, number>();
  for (const m of parties) {
    for (const [carte, n] of Object.entries(m.invocationsParCarte)) total.set(carte, (total.get(carte) ?? 0) + n);
  }
  return [...total.entries()].map(([carte, n]) => ({ carte, total: n })).sort((x, y) => y.total - x.total);
}
