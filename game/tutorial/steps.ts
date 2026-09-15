import { getCardDefinition } from "@/game/cards/sets/core";
import { UNIT_CARD_TYPES } from "@/game/cards/types";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * Tutoriel — étapes d'une PARTIE GUIDÉE.
 *
 * Source de vérité : Notion « Progression joueur », section 2. La spec
 * verrouille le contenu minimal et, surtout, la FORME :
 *
 *   > Le tutoriel doit être court, jouable et intégré à l'univers
 *   > Tidebound, pas présenté comme une succession de fenêtres techniques.
 *
 * D'où ce modèle : le tutoriel n'est pas un diaporama ni une partie
 * scriptée à part, c'est une vraie partie contre le bot doublée d'un
 * compagnon de bord. Chaque étape est une CONSIGNE et un PRÉDICAT PUR sur
 * l'état réel ; elle se valide quand le joueur a effectivement fait le
 * geste, jamais sur un clic de « Suivant ». Le joueur peut donc jouer à
 * côté, se tromper, revenir — rien ne le bloque.
 *
 * Une étape ne se dévalide jamais : `TutorialProgress` retient le rang le
 * plus avancé atteint, pour qu'un permanent détruit ne fasse pas reculer la
 * consigne.
 */

/**
 * Zone de l'écran où le geste se fait. Sert à DEUX choses : poser la fiche
 * du guide à côté d'elle plutôt qu'au bord de l'écran, et l'allumer quand
 * le joueur ne trouve pas.
 *
 * Exprimée en sélecteur CSS et non en identifiant abstrait : le plateau
 * porte déjà ces ancres (`data-zone`, `data-drop`, `data-graveyard`), et un
 * registre intermédiaire ne ferait que dupliquer ce qui existe.
 */
export type TutorialAnchor =
  /** La main du joueur. */
  | '[data-zone="PlayerHand"]'
  /** Le plateau du joueur, là où les cartes se posent. */
  | '[data-zone="PlayerZone"]'
  /** La piste de Marée, au centre. */
  | '[data-zone="CenterZone"]'
  /** Le Navire adverse — cible d'attaque. */
  | '[data-drop="ship"]'
  /** Le crâne du joueur : Sabordage et Bris depuis la main. */
  | '[data-graveyard="player"]'
  /** La colonne de droite : tour, journal et bouton de phase. */
  | '[data-zone="SideRail"]';

export interface TutorialStep {
  id: string;
  /** Titre court, ton « carnet de bord ». */
  title: string;
  /** Consigne, une phrase. */
  instruction: string;
  /** Détail facultatif : la règle que l'étape fait comprendre. */
  detail?: string;
  /** Où le geste se fait — le guide s'y ancre et l'allume au besoin. */
  anchor: TutorialAnchor;
  /**
   * Cartes de la main qui conviennent à cette étape, par `instanceId`.
   *
   * Absent = l'étape ne demande pas de poser une carte (attaquer, observer
   * la Marée) et rien n'est restreint. Présent, il fait DEUX choses : le
   * guide désigne la première carte de la liste, et le plateau n'autorise
   * que celles-ci.
   *
   * La restriction n'est pas du dirigisme gratuit : le deck du tutoriel
   * n'a que quelques Objets, et poser le dernier à l'étape « pose un
   * Objet » rendait l'étape suivante — « brise un Objet depuis ta main » —
   * infranchissable. Le joueur se bloquait lui-même sans savoir pourquoi.
   */
  eligibleHandCards?: (state: GameState, playerId: PlayerId) => string[];
  /** Vrai dès que le joueur a fait le geste — PUR, lu sur l'état réel. */
  isDone: (state: GameState, playerId: PlayerId) => boolean;
}

/** Cartes de la main de `playerId` dont le type est l'un de ceux demandés. */
function handCardsOfType(state: GameState, playerId: PlayerId, types: readonly string[]): string[] {
  const player = state.players.find((p) => p.id === playerId);
  return (player?.hand ?? [])
    .filter((card) => {
      try {
        return types.includes(getCardDefinition(card.cardId).type);
      } catch {
        return false;
      }
    })
    .map((card) => card.instanceId);
}

/** Le joueur a-t-il posé une carte de l'un de ces types ? */
function playedOneOf(state: GameState, playerId: PlayerId, types: readonly string[]): boolean {
  return state.eventLog.some((event) => {
    if (event.type !== "PLAY_CARD" || event.playerId !== playerId) return false;
    try {
      return types.includes(getCardDefinition(event.cardId).type);
    } catch {
      return false;
    }
  });
}

/**
 * Les sept apprentissages listés par la spec, dans l'ordre où une partie
 * les rencontre naturellement. Volontairement aucun n'impose une carte
 * précise : le tutoriel se joue avec un vrai deck, pas une main truquée.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "play-unit",
    title: "Un corps sur le pont",
    // Marin OU Créature, et surtout pas « une Créature » seule. Le deck
    // d'emprunt du tutoriel compte 13 Marins pour 12 Créatures : une main
    // d'ouverture sans la moindre Créature est banale, et le joueur posait
    // alors carte sur carte sans que l'étape avance ni que rien ne le lui
    // explique. La leçon de cette étape est le GESTE — mettre un corps sur
    // le pont — pas la distinction entre les deux types d'unité.
    instruction: "Pose une unité sur ton plateau : un Marin ou une Créature.",
    detail: "Glisse la carte sur ton plateau, ou touche-la puis touche une place libre.",
    anchor: '[data-zone="PlayerHand"]',
    eligibleHandCards: (state, playerId) => handCardsOfType(state, playerId, UNIT_CARD_TYPES),
    isDone: (state, playerId) => playedOneOf(state, playerId, UNIT_CARD_TYPES),
  },
  {
    id: "understand-cost",
    title: "La Raison se dépense",
    instruction: "Regarde ta Raison baisser : chaque carte coûte le chiffre inscrit en haut à gauche.",
    detail: "Le médaillon bleu de ton Navire se vide à mesure que tu poses. Il remonte au début de ton tour.",
    anchor: '[data-zone="PlayerZone"]',
    // Les Objets sont écartés : les étapes 4 et 5 en ont besoin, et le deck
    // du tutoriel n'en compte que quelques-uns.
    eligibleHandCards: (state, playerId) => handCardsOfType(state, playerId, [...UNIT_CARD_TYPES, "structure", "equipement"]),
    // Deux cartes posées : le joueur a vu la Raison bouger deux fois.
    isDone: (state, playerId) => state.eventLog.filter((e) => e.type === "PLAY_CARD" && e.playerId === playerId).length >= 2,
  },
  {
    id: "attack",
    title: "À l'abordage",
    instruction: "Passe en Phase de combat, puis attaque avec une de tes unités.",
    detail: "Une unité qui vient d'arriver doit attendre un tour avant de pouvoir frapper.",
    anchor: '[data-zone="SideRail"]',
    isDone: (state, playerId) => state.eventLog.some((event) => event.type === "ATTACK" && event.playerId === playerId),
  },
  {
    id: "play-object",
    title: "La cale",
    instruction: "Pose un Objet sur ton plateau.",
    detail: "Un Objet reste en jeu et occupe une place : il attend son heure.",
    anchor: '[data-zone="PlayerHand"]',
    eligibleHandCards: (state, playerId) => handCardsOfType(state, playerId, ["objet"]),
    isDone: (state, playerId) => playedOneOf(state, playerId, ["objet"]),
  },
  {
    id: "break-object",
    title: "Ça peut encore servir",
    instruction: "Brise un Objet depuis ta main en le glissant sur le crâne.",
    detail: "Briser depuis la main coûte moins cher que de le poser : c'est l'effet qui t'intéresse, pas la place.",
    anchor: '[data-graveyard="player"]',
    eligibleHandCards: (state, playerId) => handCardsOfType(state, playerId, ["objet"]),
    isDone: (state, playerId) => state.eventLog.some((event) => event.type === "OBJECT_BROKEN" && event.playerId === playerId && event.fromHand),
  },
  {
    id: "tide",
    title: "La Marée monte",
    instruction: "Observe la piste de Marée au centre : elle avance toute seule, à chaque tour.",
    detail: "Calme, Houle, Tempête, Abysses — chaque état change ce que tes cartes valent, et finit par frapper les deux Navires.",
    anchor: '[data-zone="CenterZone"]',
    isDone: (state) => state.eventLog.some((event) => event.type === "TIDE_ADVANCED" && event.stateChanged),
  },
  {
    id: "finish",
    title: "Tenir jusqu'au bout",
    instruction: "Termine la partie.",
    detail: "Réduis l'Ancrage adverse à zéro — ou tiens plus longtemps que lui.",
    anchor: '[data-drop="ship"]',
    isDone: (state) => state.status === "finished",
  },
];

export interface TutorialProgress {
  /** Index de l'étape en cours ; égal à `TUTORIAL_STEPS.length` une fois tout fait. */
  index: number;
  step: TutorialStep | null;
  doneCount: number;
  total: number;
  complete: boolean;
}

/**
 * Avancement du tutoriel pour un état donné.
 *
 * `furthestIndex` (le rang le plus avancé déjà atteint) est passé par
 * l'appelant et ne redescend jamais : sans lui, perdre son unique Créature
 * ferait revenir la consigne « pose une Créature » alors que le joueur l'a
 * déjà fait. On avance tant que l'étape courante est remplie — plusieurs
 * étapes peuvent donc tomber d'un coup, ce qui est le comportement voulu
 * quand un joueur va plus vite que le guide.
 */
export function tutorialProgress(state: GameState, playerId: PlayerId, furthestIndex = 0): TutorialProgress {
  let index = Math.max(0, Math.min(furthestIndex, TUTORIAL_STEPS.length));
  while (index < TUTORIAL_STEPS.length && TUTORIAL_STEPS[index]!.isDone(state, playerId)) index += 1;

  return {
    index,
    step: TUTORIAL_STEPS[index] ?? null,
    doneCount: index,
    total: TUTORIAL_STEPS.length,
    complete: index >= TUTORIAL_STEPS.length,
  };
}

/**
 * Types de cartes que la main d'ouverture du tutoriel doit contenir, dans
 * l'ordre où les étapes les réclament.
 *
 * Deux Objets et non un : l'étape 4 en POSE un et l'étape 5 en BRISE un
 * autre depuis la main. Avec un seul, la quatrième étape condamnait la
 * cinquième.
 */
export const TUTORIAL_OPENING_TYPES: readonly string[] = ["creature", "objet", "objet"];
