/**
 * Jeu de données factice du laboratoire de layout (`/game/board-preview`).
 *
 * AUCUN lien avec `@/game` : cet écran ne crée pas de partie, ne lit aucun
 * deck et n'appelle aucun backend. Les modèles ci-dessous n'existent que
 * pour donner au layout de quoi être jugé (des rectangles à la bonne
 * taille, en bon nombre).
 *
 * Migration future : `PreviewCardModel` est volontairement réduit au strict
 * minimum dont le LAYOUT a besoin (une identité + une étiquette). Le jour
 * où l'on branchera les vraies cartes, seuls les composants de rendu
 * (`PreviewCard` → `GameCard`) changeront — les composants de disposition
 * (`PreviewBoard`, `PreviewHand`) acceptent déjà n'importe quel rendu via
 * leur prop `renderCard`.
 */

export interface PreviewCardModel {
  id: string;
  /** Numéro affiché sur le placeholder, pour repérer une carte à l'oeil. */
  index: number;
  label: string;
  /** Face cachée (main adverse) — change uniquement l'habillage du placeholder. */
  faceDown?: boolean;
}

/** Emplacements d'un plateau, côté joueur comme côté adversaire. */
export const BOARD_CAPACITY = 5;

/** Taille de main de référence pour juger les espacements (cf. cahier des charges : 7 ou 8 cartes). */
export const HAND_SIZE = 8;

function makeCards(prefix: string, count: number, label: string, faceDown = false): PreviewCardModel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    index: i + 1,
    label,
    faceDown,
  }));
}

export const PREVIEW_FIXTURES = {
  opponentBoard: makeCards("opp-board", BOARD_CAPACITY, "Unité"),
  playerBoard: makeCards("own-board", BOARD_CAPACITY, "Unité"),
  playerHand: makeCards("own-hand", HAND_SIZE, "Main"),
  opponent: {
    name: "Adversaire",
    shipName: "Enemy Ship",
    hull: 18,
    maxHull: 20,
    // Colonne de zone : ressources de camp uniquement. Les compteurs
    // deck / main vivent dans le HUD (`PreviewHud`) — un même chiffre
    // n'est jamais affiché à deux endroits, c'est justement ce genre de
    // doublon que ce laboratoire sert à repérer.
    resources: [
      { key: "tides", label: "Tides", value: 3 },
      { key: "deck", label: "Deck", value: 24 },
      { key: "graveyard", label: "Cimetière", value: 2 },
    ],
  },
  player: {
    name: "Joueur",
    shipName: "Player Ship",
    hull: 20,
    maxHull: 20,
    resources: [
      { key: "tides", label: "Tides", value: 5 },
      { key: "deck", label: "Deck", value: 21 },
      { key: "graveyard", label: "Cimetière", value: 4 },
    ],
  },
  tide: {
    name: "Marée montante",
    direction: "up" as const,
    step: 2,
    steps: 4,
  },
} satisfies Record<string, unknown>;

export type PreviewResourceModel = (typeof PREVIEW_FIXTURES)["player"]["resources"][number];
export type PreviewSideModel = (typeof PREVIEW_FIXTURES)["player"];
export type PreviewTideModel = (typeof PREVIEW_FIXTURES)["tide"];
