import { getCardDefinition } from "@/game/cards/sets/core";
import { canUnitAttack } from "@/game/rules/validation";
import type { GameState, PlayerId } from "@/game/state/types";
import { TUTORIAL_CARDS, TUTORIAL_START_TURN } from "@/game/tutorial/scenario";

/**
 * Tutoriel — étapes d'une PARTIE GUIDÉE (refonte du 06/10/2026).
 *
 * Source de vérité : Notion « Progression joueur », section 2, et le retour
 * du 06/10/2026 : expliquer d'abord l'INTERFACE, puis le premier tour, les
 * gestes (Bris, Sabordage, Défausse), le tour adverse, le combat et la
 * Garde, la Marée, la Raison et la Déraison, le public. Sans jamais
 * bloquer le joueur ; une fois tout vu, la partie se joue jusqu'au bout,
 * le guide réduit à un bandeau discret.
 *
 * DEUX SORTES D'ÉTAPES :
 *   - une LEÇON (pas de `isDone`) explique ce qu'on voit, en désignant la
 *     zone ; elle se valide par « Compris ». Le joueur peut jouer pendant
 *     qu'il lit : rien n'est figé ;
 *   - une ACTION se valide quand le joueur a FAIT le geste, prédicat pur
 *     sur l'état réel. Une action déjà faite plus tôt se valide d'office
 *     en arrivant dessus.
 *
 * Une action peut ne pas être faisable TOUT DE SUITE (attaquer pendant le
 * tour adverse) : `waitingFor` dit alors ce qu'on attend, au lieu de
 * laisser le joueur chercher un geste impossible. C'était le défaut de
 * l'ancien tutoriel — « Attaque » s'affichait au premier tour, quand
 * aucune unité ne pouvait frapper.
 *
 * Une étape ne se dévalide jamais : `TutorialProgress` part du rang le plus
 * avancé atteint.
 */

/** Sélecteur CSS de la zone que l'étape désigne — le plateau porte déjà ces ancres. */
export type TutorialAnchor = string;

export interface TutorialStep {
  id: string;
  /** Chapitre, affiché au-dessus du titre. */
  chapter: string;
  /** Titre court, ton « carnet de bord ». */
  title: string;
  /** Consigne ou explication principale. */
  instruction: string;
  /** Précision : la règle que l'étape fait comprendre. */
  detail?: string;
  /** Zone à désigner (halo posé SUR l'élément) — fixe, ou calculée sur l'état (une carte précise). */
  anchor?: TutorialAnchor | ((state: GameState, playerId: PlayerId) => TutorialAnchor | null);
  /**
   * Cartes de la main qui conviennent à cette étape, par `instanceId`. Le
   * guide désigne la première ; le plateau n'autorise que celles-ci, pour
   * qu'une carte posée à contretemps ne rende pas l'étape suivante
   * infranchissable.
   */
  eligibleHandCards?: (state: GameState, playerId: PlayerId) => string[];
  /** ACTION : vrai dès que le joueur a fait le geste. Absent : c'est une LEÇON (« Compris »). */
  isDone?: (state: GameState, playerId: PlayerId) => boolean;
  /** ACTION pas encore faisable : ce qu'on attend, en une phrase. `null` : à toi. */
  waitingFor?: (state: GameState, playerId: PlayerId) => string | null;
}

const ZONE = {
  hand: '[data-zone="PlayerHand"]',
  board: '[data-zone="PlayerZone"]',
  opponentBoard: '[data-zone="OpponentZone"]',
  center: '[data-zone="CenterZone"]',
  // Les boutons de phase : à droite de la Marée sur le Pont du Capitaine,
  // dans la colonne de tour sur la table classique (le premier présent).
  rail: '[data-zone="PhaseActions"], [data-zone="SideRail"]',
  deck: '[data-deck="player"]',
  graveyard: '[data-graveyard="player"]',
  audience: "[data-live-audience]",
  // L'emplacement de Lande, entre les deux Navires (c'est aussi là qu'on la lâche).
  lande: '[data-drop="lande"]',
  // La piste de Marée et la plaque de son sens (Pont du Capitaine).
  tide: "[data-tide-track]",
} as const;

const ship = (playerId: PlayerId) => `[data-ship-target="${playerId}"]`;
const handCard = (instanceId: string) => `[data-hand-card="${instanceId}"]`;
const boardUnit = (instanceId: string) => `[data-board-unit="${instanceId}"]`;

function player(state: GameState, playerId: PlayerId) {
  return state.players.find((p) => p.id === playerId);
}

/** Exemplaires de `cardId` dans la main du joueur. */
function inHand(state: GameState, playerId: PlayerId, cardId: string): string[] {
  return (player(state, playerId)?.hand ?? []).filter((c) => c.cardId === cardId).map((c) => c.instanceId);
}

/** Premier exemplaire de `cardId` sur le plateau d'un joueur. */
function onBoard(state: GameState, playerId: PlayerId, cardId: string): string | null {
  return player(state, playerId)?.board.find((c) => c.cardId === cardId)?.instanceId ?? null;
}

function played(state: GameState, playerId: PlayerId, cardId: string): boolean {
  return state.eventLog.some((e) => e.type === "PLAY_CARD" && e.playerId === playerId && e.cardId === cardId);
}

const opponentOf = (state: GameState, playerId: PlayerId) => state.players.find((p) => p.id !== playerId)!.id;

/** Une de ses unités pourrait-elle attaquer, si l'on était en Phase de combat ? */
function hasReadyAttacker(state: GameState, playerId: PlayerId): boolean {
  // Ni fenêtre ni question ouverte : on demande si l'unité POURRAIT frapper, pas si elle le peut à l'instant.
  const enCombat: GameState = { ...state, phase: "combatPhase", pendingReaction: undefined, pendingChoice: undefined };
  return (player(state, playerId)?.board ?? []).some((unit) => canUnitAttack(enCombat, playerId, unit.instanceId));
}

/** Pourquoi on ne peut pas encore attaquer — `null` si c'est possible maintenant. */
function attackWait(state: GameState, playerId: PlayerId): string | null {
  if (state.activePlayerId !== playerId) return "Attends ton tour : c'est à l'adversaire de jouer.";
  if (state.pendingReaction || state.pendingChoice) return "Réponds d'abord à la question en cours.";
  if (!hasReadyAttacker(state, playerId)) return "Aucune de tes unités n'est prête : pose-en une, elle frappera au tour suivant.";
  if (state.phase !== "combatPhase") return "Passe d'abord en Phase de combat : bouton à droite.";
  return null;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // --- Le pont : ce qu'on voit ---------------------------------------
  {
    id: "welcome",
    chapter: "Le pont",
    title: "Bienvenue à bord",
    instruction: "La partie est déjà lancée : ton équipage est en bas, celui de l'adversaire en haut.",
    detail: "Lis chaque fiche, puis « Compris ». Tu peux jouer pendant ce temps : rien n'est figé.",
  },
  {
    id: "hand",
    chapter: "Le pont",
    title: "Ta main",
    instruction: "Les cartes que tu peux jouer. Le chiffre en haut à gauche est leur coût en Raison.",
    detail: "Survole une carte (ou appuie longuement) pour la lire en grand.",
    anchor: ZONE.hand,
  },
  {
    id: "deck-graveyard",
    chapter: "Le pont",
    title: "Pioche et Cimetière",
    instruction: "Le crâne, à côté de ton Navire, c'est ton Cimetière. Tout au bout de ta rangée, à droite : ta pioche, où tu tires une carte au début de chaque tour.",
    detail: "Tout ce qui est détruit, Brisé, Sabordé ou défaussé y finit.",
    anchor: ZONE.graveyard,
  },
  {
    id: "anchor",
    chapter: "Le pont",
    title: "Ton Navire et son Ancrage",
    instruction: "Le médaillon rouge de ton Navire est son Ancrage : ta vie. À 0, tu perds.",
    detail: "Celui d'en face aussi : le réduire à 0, c'est gagner.",
    anchor: (_state, playerId) => ship(playerId),
  },
  {
    id: "reason",
    chapter: "Le pont",
    title: "La Raison",
    instruction: "Le médaillon bleu, c'est ta Raison : elle paie tes cartes. Ce que tu ne dépenses pas reste acquis.",
    detail:
      "Elle remonte un peu à chaque tour. Tu peux même descendre sous 0 — c'est la Déraison : chaque point manquant te coûte de l'Ancrage à la fin de ton tour.",
    anchor: (_state, playerId) => `[data-reason-gauge="${playerId}"]`,
  },
  {
    id: "ship-ability",
    chapter: "Le pont",
    title: "La capacité du Navire",
    instruction: "Le hublot sur ton Navire est sa capacité : elle s'active d'un clic, quand elle s'allume.",
    detail: "Survole-le pour lire ce qu'elle fait et ce qu'elle coûte.",
    anchor: (_state, playerId) => `${ship(playerId)} [data-ship-ability]`,
  },
  {
    id: "opponent",
    chapter: "Le pont",
    title: "En face",
    instruction: "Le plateau adverse : ses unités, ses Structures, son Navire. Sa main reste cachée.",
    detail: "Le médaillon bouclier sur une carte, c'est Garde. On y revient au combat.",
    anchor: ZONE.opponentBoard,
  },

  // --- Ton premier tour ----------------------------------------------
  {
    id: "play-unit",
    chapter: "Ton premier tour",
    title: "Un corps sur le pont",
    instruction: "Pose la Gabière du Grand Large : glisse-la sur l'emplacement de ton choix (au doigt : touche-la, puis « Jouer »).",
    detail: "Regarde ta Raison baisser du coût de la carte. Une carte posée garde sa place : range ton pont comme tu l'entends.",
    anchor: (state, playerId) => {
      const id = inHand(state, playerId, TUTORIAL_CARDS.unit)[0];
      return id ? handCard(id) : ZONE.hand;
    },
    eligibleHandCards: (state, playerId) => inHand(state, playerId, TUTORIAL_CARDS.unit),
    isDone: (state, playerId) => played(state, playerId, TUTORIAL_CARDS.unit),
  },
  {
    id: "summoning-sickness",
    chapter: "Ton premier tour",
    title: "Il vient d'arriver",
    instruction: "Une unité posée ce tour-ci ne peut pas encore attaquer : elle frappera à ton prochain tour.",
    detail: "Le médaillon « Engourdi » posé sur la carte le rappelle. Il disparaît au début de ton prochain tour.",
    anchor: (state, playerId) => {
      const id = onBoard(state, playerId, TUTORIAL_CARDS.unit);
      return id ? boardUnit(id) : ZONE.board;
    },
  },
  {
    id: "pied-marin",
    chapter: "Ton premier tour",
    title: "Pied marin",
    instruction: "Pose la Sterne des Embruns. Elle a Pied marin : elle peut attaquer dès son arrivée.",
    detail: "Sur la carte posée, le médaillon Pied marin remplace « Engourdi » : elle est prête tout de suite.",
    anchor: (state, playerId) => {
      const id = inHand(state, playerId, TUTORIAL_CARDS.piedMarin)[0];
      return id ? handCard(id) : ZONE.hand;
    },
    eligibleHandCards: (state, playerId) => inHand(state, playerId, TUTORIAL_CARDS.piedMarin),
    isDone: (state, playerId) => played(state, playerId, TUTORIAL_CARDS.piedMarin),
  },
  {
    id: "effects",
    chapter: "Ton premier tour",
    title: "Lire une carte",
    instruction: "Le texte d'une carte dit QUAND elle agit : « À son arrivée », « Brisez cet Objet », « Sabordage », « Lorsqu'il attaque »…",
    detail: "Puissance (épée) et Résistance (bouclier) en bas ; à 0 Résistance, la carte est détruite.",
    anchor: ZONE.board,
  },

  // --- Les gestes ----------------------------------------------------
  {
    id: "break",
    chapter: "Les gestes",
    title: "Briser un Objet",
    instruction: "Un Objet sert en se BRISANT : son effet s'applique, puis il part au Cimetière. Brise le Thermos du Dernier Quart depuis ta main : glisse-le sur le crâne.",
    detail: "Depuis la main, le Bris coûte la moitié du prix. Posé sur le plateau, un Objet attend : tu le Brises quand tu veux.",
    anchor: ZONE.graveyard,
    eligibleHandCards: (state, playerId) => inHand(state, playerId, TUTORIAL_CARDS.object),
    // N'importe quel Bris compte — depuis la main OU le plateau : l'ancien
    // tutoriel n'acceptait que la main, et un Objet Brisé sur le plateau
    // laissait l'étape bloquée sans explication.
    isDone: (state, playerId) => state.eventLog.some((e) => e.type === "OBJECT_BROKEN" && e.playerId === playerId),
    waitingFor: (state, playerId) => (state.activePlayerId === playerId ? null : "Attends ton tour."),
  },
  {
    id: "saborder",
    chapter: "Les gestes",
    title: "Saborder",
    instruction: "Saborder, c'est sacrifier un de tes permanents. Glisse la Caisse des Dernières Planches sur le crâne.",
    detail: "Certaines cartes ont un effet « Sabordage : » qui s'applique alors — ici, 1 Ancrage et une carte.",
    anchor: (state, playerId) => {
      const id = onBoard(state, playerId, TUTORIAL_CARDS.structure);
      return id ? boardUnit(id) : ZONE.graveyard;
    },
    isDone: (state, playerId) => state.eventLog.some((e) => e.type === "SABORDED" && e.playerId === playerId),
    waitingFor: (state, playerId) => (state.activePlayerId === playerId ? null : "Attends ton tour."),
  },
  {
    id: "discard",
    chapter: "Les gestes",
    title: "Défausser",
    instruction: "Défausser, c'est envoyer une carte de ta main au Cimetière. Certains effets le demandent.",
    detail: "Ta main tient 7 cartes au plus : au-delà, tu défausses à la fin de ton tour.",
    anchor: ZONE.graveyard,
  },

  // --- Fin de tour et tour adverse -----------------------------------
  {
    id: "end-turn",
    chapter: "Fin de tour",
    title: "Termine ton tour",
    instruction: "Passe en Phase de combat, puis termine ton tour : boutons à droite.",
    detail:
      "Tant qu'une de tes unités peut attaquer, on ne finit pas son tour en Phase principale 1 (sinon, la Fin de tour s'allume tout de suite). C'est en fin de tour que la Déraison se paie, si ta Raison est sous 0.",
    anchor: ZONE.rail,
    isDone: (state) => state.turnNumber > TUTORIAL_START_TURN,
  },
  {
    id: "opponent-turn",
    chapter: "Fin de tour",
    title: "Au tour de l'adversaire",
    instruction: "L'adversaire pioche, pose, attaque peut-être. Observe : tu reprends la main juste après.",
    detail: "Regarde aussi la Marée au centre : elle avance d'elle-même au fil des tours.",
    anchor: ZONE.center,
    isDone: (state, playerId) => state.activePlayerId === playerId && state.turnNumber > TUTORIAL_START_TURN + 1,
  },

  // --- Le combat -----------------------------------------------------
  {
    id: "attack-concept",
    chapter: "Le combat",
    title: "Attaquer",
    instruction: "Passe en Phase de combat (bouton à droite). Chaque unité prête attaque une fois par tour.",
    detail:
      "Contre une unité : elle encaisse ta Puissance, et riposte avec la sienne. Contre le Navire : il perd autant d'Ancrage, sans riposte.",
    anchor: ZONE.rail,
  },
  {
    id: "garde",
    chapter: "Le combat",
    title: "La Garde",
    instruction: "Tant qu'une unité adverse a Garde, tes attaques doivent la viser : ni le Navire, ni les autres unités.",
    detail: "Abats la Garde, et la voie s'ouvre. Détruire ses unités te protège aussi de leurs attaques au tour suivant.",
    anchor: (state, playerId) => {
      const id = onBoard(state, opponentOf(state, playerId), TUTORIAL_CARDS.garde);
      return id ? boardUnit(id) : ZONE.opponentBoard;
    },
  },
  {
    id: "attack",
    chapter: "Le combat",
    title: "À l'abordage",
    instruction: "Attaque : glisse une unité prête sur sa cible (au doigt : touche ton unité, puis la cible).",
    anchor: ZONE.opponentBoard,
    isDone: (state, playerId) => state.eventLog.some((e) => e.type === "ATTACK" && e.playerId === playerId),
    waitingFor: attackWait,
  },

  // --- La Lande : la carte de terrain ---------------------------------
  {
    id: "lande",
    chapter: "La Lande",
    title: "La carte de terrain",
    instruction: "Au centre, entre les deux Navires : l'emplacement de Lande. Une Lande est un terrain qui change les règles pour les DEUX camps.",
    detail:
      "Une seule Lande à la fois : en poser une chasse celle en place. Elle reste quelques tours de table (le chiffre sur sa carte), puis part au Cimetière. Elle n'occupe aucun emplacement, et rien ne peut l'attaquer ni la viser.",
    anchor: ZONE.lande,
  },
  {
    id: "lande-play",
    chapter: "La Lande",
    title: "Pluie corrosive",
    instruction: "Pose la Pluie corrosive : glisse-la sur l'emplacement de Lande. Sous cette pluie, les permanents perdent Garde.",
    detail: "Pour tout le monde : la Mouette d'en face ne protège plus son Navire. Le pont change de décor tant que la Lande dure.",
    anchor: (state, playerId) => {
      const id = inHand(state, playerId, TUTORIAL_CARDS.lande)[0];
      return id ? handCard(id) : ZONE.lande;
    },
    eligibleHandCards: (state, playerId) => inHand(state, playerId, TUTORIAL_CARDS.lande),
    isDone: (state, playerId) => played(state, playerId, TUTORIAL_CARDS.lande),
    waitingFor: (state, playerId) =>
      state.activePlayerId !== playerId
        ? "Attends ton tour."
        : state.phase === "combatPhase"
          ? "Pas pendant le combat : tu pourras la poser en Phase principale 2."
          : null,
  },
  // --- La Marée ------------------------------------------------------
  {
    id: "tide",
    chapter: "La Marée",
    title: "Les quatre Marées",
    instruction:
      "Calme, Houle, Tempête, Abysses : la Marée change d'état au fil des tours. La plaque à gauche dit son sens : vague bleue, elle monte vers les Abysses ; rouge, tête en bas, elle redescend vers le Calme.",
    detail:
      "Calme : rien. Houle : une carte peut tomber malade et perdre de la Résistance. Tempête : 1 dégât d'Ancrage aux deux Navires chaque tour, et aux Structures. Abysses : 2 Ancrage à l'entrée, Raison max −2. Beaucoup de cartes changent selon la Marée.",
    anchor: ZONE.tide,
  },

  // --- Le public -----------------------------------------------------
  {
    id: "audience",
    chapter: "Le public",
    title: "On te regarde",
    instruction: "L'œil en haut, c'est ton public. Une partie expédiée rapporte peu ; une partie bien jouée attire les regards.",
    detail: "Beaux coups, retournements, Marée bien exploitée : le public grandit, et les mécènes qui te repèrent envoient des cadeaux.",
    anchor: ZONE.audience,
  },
  {
    id: "free-play",
    chapter: "À toi",
    title: "La mer est à toi",
    instruction: "Tu connais les rouages. Joue la partie jusqu'au bout — ou termine le tutoriel quand tu veux.",
  },
];

export interface TutorialProgress {
  /** Index de l'étape en cours ; égal à `TUTORIAL_STEPS.length` une fois tout vu. */
  index: number;
  step: TutorialStep | null;
  doneCount: number;
  total: number;
  /** Toutes les étapes sont vues : le guide se réduit, la partie continue. */
  complete: boolean;
}

/**
 * Avancement du tutoriel pour un état donné.
 *
 * `furthestIndex` (le rang le plus avancé déjà atteint, tenu par l'écran :
 * c'est lui qu'incrémentent « Compris » et « Passer l'étape ») ne redescend
 * jamais. On avance tant que l'étape courante est une ACTION déjà faite —
 * plusieurs peuvent tomber d'un coup quand le joueur va plus vite que le
 * guide. Une leçon arrête la course : elle attend « Compris ».
 */
export function tutorialProgress(state: GameState, playerId: PlayerId, furthestIndex = 0): TutorialProgress {
  let index = Math.max(0, Math.min(furthestIndex, TUTORIAL_STEPS.length));
  while (index < TUTORIAL_STEPS.length && TUTORIAL_STEPS[index]!.isDone?.(state, playerId)) index += 1;

  return {
    index,
    step: TUTORIAL_STEPS[index] ?? null,
    doneCount: index,
    total: TUTORIAL_STEPS.length,
    complete: index >= TUTORIAL_STEPS.length,
  };
}

/** Sélecteur de la zone désignée par l'étape, résolu sur l'état. */
export function tutorialAnchor(step: TutorialStep, state: GameState, playerId: PlayerId): TutorialAnchor | null {
  if (!step.anchor) return null;
  return typeof step.anchor === "function" ? step.anchor(state, playerId) : step.anchor;
}

/** Garde-fou : chaque carte du scénario existe au catalogue (lu par les tests). */
export function tutorialCardsExist(): boolean {
  return Object.values(TUTORIAL_CARDS).every((id) => {
    try {
      return Boolean(getCardDefinition(id));
    } catch {
      return false;
    }
  });
}
