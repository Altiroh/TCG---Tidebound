import { getCardDefinition } from "@/game/cards/sets/core";
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

export interface TutorialStep {
  id: string;
  /** Titre court, ton « carnet de bord ». */
  title: string;
  /** Consigne, une phrase. */
  instruction: string;
  /** Détail facultatif : la règle que l'étape fait comprendre. */
  detail?: string;
  /** Vrai dès que le joueur a fait le geste — PUR, lu sur l'état réel. */
  isDone: (state: GameState, playerId: PlayerId) => boolean;
}

function playedType(state: GameState, playerId: PlayerId, type: string): boolean {
  return state.eventLog.some((event) => {
    if (event.type !== "PLAY_CARD" || event.playerId !== playerId) return false;
    try {
      return getCardDefinition(event.cardId).type === type;
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
    id: "play-creature",
    title: "Un corps sur le pont",
    instruction: "Pose une Créature depuis ta main.",
    detail: "Glisse la carte sur ton plateau, ou touche-la puis touche une place libre.",
    isDone: (state, playerId) => playedType(state, playerId, "creature"),
  },
  {
    id: "understand-cost",
    title: "La Raison se dépense",
    instruction: "Regarde ta Raison baisser : chaque carte coûte le chiffre inscrit en haut à gauche.",
    detail: "Le médaillon bleu de ton Navire se vide à mesure que tu poses. Il remonte au début de ton tour.",
    // Deux cartes posées : le joueur a vu la Raison bouger deux fois.
    isDone: (state, playerId) => state.eventLog.filter((e) => e.type === "PLAY_CARD" && e.playerId === playerId).length >= 2,
  },
  {
    id: "attack",
    title: "À l'abordage",
    instruction: "Passe en Phase de combat, puis attaque avec une de tes unités.",
    detail: "Une unité qui vient d'arriver doit attendre un tour avant de pouvoir frapper.",
    isDone: (state, playerId) => state.eventLog.some((event) => event.type === "ATTACK" && event.playerId === playerId),
  },
  {
    id: "play-object",
    title: "La cale",
    instruction: "Pose un Objet sur ton plateau.",
    detail: "Un Objet reste en jeu et occupe une place : il attend son heure.",
    isDone: (state, playerId) => playedType(state, playerId, "objet"),
  },
  {
    id: "break-object",
    title: "Ça peut encore servir",
    instruction: "Brise un Objet depuis ta main en le glissant sur le crâne.",
    detail: "Briser depuis la main coûte moins cher que de le poser : c'est l'effet qui t'intéresse, pas la place.",
    isDone: (state, playerId) => state.eventLog.some((event) => event.type === "OBJECT_BROKEN" && event.playerId === playerId && event.fromHand),
  },
  {
    id: "tide",
    title: "La Marée monte",
    instruction: "Observe la piste de Marée au centre : elle avance toute seule, à chaque tour.",
    detail: "Calme, Houle, Tempête, Abysses — chaque état change ce que tes cartes valent, et finit par frapper les deux Navires.",
    isDone: (state) => state.eventLog.some((event) => event.type === "TIDE_ADVANCED" && event.stateChanged),
  },
  {
    id: "finish",
    title: "Tenir jusqu'au bout",
    instruction: "Termine la partie.",
    detail: "Réduis l'Ancrage adverse à zéro — ou tiens plus longtemps que lui.",
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
